import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import {
  Agent as UndiciAgent,
  Headers as UndiciHeaders,
  fetch as undiciFetch,
  type Dispatcher,
  type RequestInit as UndiciRequestInit,
} from 'undici';

dotenv.config();

function filesReady(paths: string[]) {
  return paths.every((p) => fs.existsSync(p));
}

function mustRead(p: string, label: string) {
  if (!fs.existsSync(p)) throw new Error(`${label} not found: ${p}`);
  return fs.readFileSync(p);
}

type VaultState = {
  token?: string;
  expiresAt?: number;
  renewable?: boolean;
};

declare module 'fastify' {
  interface FastifyInstance {
    vClient: {
      dispatcher: Dispatcher;
      fetch: typeof undiciFetch;
      rawFetch: typeof undiciFetch;
      getToken: () => string | undefined;
      ensureToken: () => Promise<void>;
      appRoleLogin: () => Promise<void>;
      renewNow: () => Promise<void>;
      vRequest: typeof undiciFetch;
      reloadMtls: () => Promise<void>;
      tryEnable: (force?: boolean) => Promise<void>;
    };
  }
}

const certDir = process.env.CERT_DIR || path.resolve(__dirname, '../certs/vault');
const appRoleDir = process.env.APPROLE_DIR || path.resolve(__dirname, '../certs/approle');

const caPath = path.join(certDir, 'ca.crt');
const crtPath = path.join(certDir, 'client.crt');
const keyPath = path.join(certDir, 'client.key');
const roleIdPath = path.join(appRoleDir, 'role_id');
const secretIdPath = path.join(appRoleDir, 'secret_id');

console.debug(`[vault] Using certDir: ${certDir}`);
console.debug(`[vault] Using appRoleDir: ${appRoleDir}`);
console.debug(`[vault] Using CA: ${caPath}`);
console.debug(`[vault] Using client.crt: ${crtPath}`);
console.debug(`[vault] Using client.key: ${keyPath}`);
console.debug(`[vault] Using role_id: ${roleIdPath}`);
console.debug(`[vault] Using secret_id: ${secretIdPath}`);
const vaultClient: FastifyPluginAsync = async (fastify) => {
  const { VAULT_ADDR, VAULT_TOKEN_MARGIN_SEC = '30' } = process.env;

  if (!VAULT_ADDR) throw new Error('VAULT_ADDR is required in .env');

  let enabled = false;

  function createDispatcher() {
    if (filesReady([caPath, crtPath, keyPath])) {
      const ca = mustRead(caPath, 'Vault CA');
      const cert = mustRead(crtPath, 'Client certificate');
      const key = mustRead(keyPath, 'Client key');
      enabled = true;
      return new UndiciAgent({
        keepAliveTimeout: 30_000,
        keepAliveMaxTimeout: 60_000,
        connect: {
          ca,
          cert,
          key,
          rejectUnauthorized: true,
        },
      });
    }
    // Fallback agent without mTLS; plugin stays disabled until files appear
    enabled = false;
    return new UndiciAgent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 60_000 });
  }

  let dispatcher = createDispatcher();

  async function tryEnable(force = false) {
    if (!force && enabled) return;
    if (!filesReady([caPath, crtPath, keyPath, roleIdPath, secretIdPath])) {
      fastify.log.warn('[vault] mTLS/approle files not present yet; vault client inactive');
      return;
    }
    // swap dispatcher with mTLS
    const next = new UndiciAgent({
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      connect: {
        ca: mustRead(caPath, 'Vault CA'),
        cert: mustRead(crtPath, 'Client certificate'),
        key: mustRead(keyPath, 'Client key'),
        rejectUnauthorized: true,
      },
    });
    const prev = dispatcher;
    dispatcher = next;
    try {
      await prev.close();
    } catch {}
    enabled = true;
    await appRoleLogin();
    fastify.log.info('[vault] enabled mTLS after files appeared');
  }

  const state: VaultState = {};
  const marginMs = Math.max(Number(VAULT_TOKEN_MARGIN_SEC) || 30, 5) * 1000;

  let reloading = false;
  async function reloadMtls() {
    if (reloading) return;
    reloading = true;
    try {
      const next = createDispatcher();
      const prev = dispatcher;
      dispatcher = next;
      try {
        await prev.close();
      } catch (e) {
        if (typeof (prev as any).destroy === 'function') (prev as any).destroy();
      }
      fastify.log.info('[vault] mTLS dispatcher reloaded');
    } catch (err) {
      fastify.log.error({ err }, '[vault] mTLS reload failed');
    } finally {
      reloading = false;
    }
  }

  const rawFetch: typeof undiciFetch = (url, init) =>
    undiciFetch(url, { ...(init as UndiciRequestInit), dispatcher });

  const vfetch: typeof undiciFetch = (url, init) => {
    const headers = new UndiciHeaders(init?.headers);
    if (state.token && !headers.has('X-Vault-Token')) {
      headers.set('X-Vault-Token', state.token);
    }
    return undiciFetch(url, { ...(init as UndiciRequestInit), headers, dispatcher });
  };

  async function appRoleLogin() {
    if (!enabled) return; // wait until mTLS/files are available
    const roleId = mustRead(roleIdPath, 'role_id').toString().trim();
    const secretId = mustRead(secretIdPath, 'secret_id').toString().trim();
    const res = await rawFetch(`${VAULT_ADDR}/v1/auth/approle/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
    });
    if (!res.ok) throw new Error(`Vault approle login failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as any;
    state.token = data?.auth?.client_token;
    const ttl = Number(data?.auth?.lease_duration) || 0;
    state.renewable = Boolean(data?.auth?.renewable);
    state.expiresAt = Date.now() + ttl * 1000;
    fastify.log.info({ ttl, renewable: state.renewable }, '[vault] approle login ok');
  }

  async function renewNow() {
    if (!enabled) return;
    if (!state.token) return appRoleLogin();
    if (!state.renewable) return appRoleLogin();
    const res = await vfetch(`${VAULT_ADDR}/v1/auth/token/renew-self`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) {
      fastify.log.warn(`[vault] renew-self failed: ${res.status}`);
      return appRoleLogin();
    }
    const data = (await res.json()) as any;
    const ttl = Number(data?.auth?.lease_duration) || 0;
    state.renewable = Boolean(data?.auth?.renewable);
    state.expiresAt = Date.now() + ttl * 1000;
    fastify.log.info({ ttl, renewable: state.renewable }, '[vault] token renewed');
  }

  let singleFlightLock: Promise<void> | null = null;
  async function ensureToken(force = false) {
    if (!enabled) return;
    const nearlyExpired = !state.expiresAt || state.expiresAt - Date.now() <= marginMs;
    const need = force || !state.token || nearlyExpired;
    if (!need) return;

    if (singleFlightLock) return singleFlightLock;

    singleFlightLock = (async () => {
      try {
        if (!state.token) await appRoleLogin();
        else if (state.renewable) await renewNow();
        else await appRoleLogin();
      } finally {
        singleFlightLock = null;
      }
    })();
    return singleFlightLock;
  }

  const vRequest: typeof undiciFetch = async (url, init) => {
    // Ensure client is enabled (files present) and token is ready
    try {
      if (!enabled) {
        await tryEnable(true);
      }
      await ensureToken(true);
    } catch (err) {
      fastify.log.error({ err }, '[vault] ensureToken/enable failed');
    }
    return vfetch(url, init);
  };

  fastify.decorate('vClient', {
    get dispatcher() {
      return dispatcher;
    },
    fetch: vfetch,
    rawFetch: rawFetch,
    getToken: () => state.token,
    ensureToken,
    appRoleLogin,
    renewNow,
    vRequest,
    reloadMtls,
    tryEnable,
  });

  // Install SIGHUP handler to reload Vault mTLS materials at runtime
  const hupHandler = () => {
    void (enabled ? reloadMtls() : tryEnable(true));
  };
  process.on('SIGHUP', hupHandler);

  // Do not fail startup if files are missing; attempt to enable once
  await tryEnable(false);

  fastify.addHook('onClose', async () => {
    process.off('SIGHUP', hupHandler);
    await dispatcher.close();
  });
};

export default fp(vaultClient, { name: 'vaultClient' });
