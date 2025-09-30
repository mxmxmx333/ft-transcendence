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
    vauth: {
      dispatcher: Dispatcher;
      fetch: typeof undiciFetch;
      rawFetch: typeof undiciFetch;
      getToken: () => string | undefined;
      ensureToken: () => Promise<void>;
      loginWithCert: () => Promise<void>;
      renewNow: () => Promise<void>;
    };
  }
}

const vaultClient: FastifyPluginAsync = async (fastify) => {
  const { VAULT_ADDR, VAULT_TOKEN_MARGIN_SEC = '30' } = process.env;

  const certDir = path.resolve(__dirname, '../certs/vault');
  const caPath  = path.join(certDir, 'ca.crt');
  const crtPath = path.join(certDir, 'client.crt');
  const keyPath = path.join(certDir, 'client.key');

  if (!VAULT_ADDR) throw new Error('VAULT_ADDR is required in .env');

  const ca   = mustRead(caPath,  'Vault CA');
  const cert = mustRead(crtPath, 'Client certificate');
  const key  = mustRead(keyPath, 'Client key');

  const dispatcher = new UndiciAgent({
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
    connect: {
      ca, cert, key,
      rejectUnauthorized: true,
    },
  });

  const state: VaultState = {};
  const marginMs = Math.max(Number(VAULT_TOKEN_MARGIN_SEC) || 30, 5) * 1000;

  const rawFetch: typeof undiciFetch = (input, init) =>
    undiciFetch(input, { ...(init as UndiciRequestInit), dispatcher });

  const vfetch: typeof undiciFetch = (input, init) => {
    const headers = new UndiciHeaders(init?.headers);
    if (state.token && !headers.has('X-Vault-Token')) {
      headers.set('X-Vault-Token', state.token);
    }
    return undiciFetch(input, { ...(init as UndiciRequestInit), headers, dispatcher });
  };

  async function loginWithCert() {
    const res = await rawFetch(`${VAULT_ADDR}/v1/auth/cert/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`Vault cert login failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as any;
    state.token = data?.auth?.client_token;
    const ttl   = Number(data?.auth?.lease_duration) || 0;
    state.renewable = Boolean(data?.auth?.renewable);
    state.expiresAt = Date.now() + ttl * 1000;
    fastify.log.info({ ttl, renewable: state.renewable }, '[vault] cert login ok');
  }

  async function renewNow() {
    if (!state.token) return loginWithCert();
    if (!state.renewable) return loginWithCert();
    const res = await vfetch(`${VAULT_ADDR}/v1/auth/token/renew-self`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) {
      fastify.log.warn(`[vault] renew-self failed: ${res.status}`);
      return loginWithCert();
    }
    const data = await res.json() as any;
    const ttl  = Number(data?.auth?.lease_duration) || 0;
    state.renewable = Boolean(data?.auth?.renewable);
    state.expiresAt = Date.now() + ttl * 1000;
    fastify.log.info({ ttl, renewable: state.renewable }, '[vault] token renewed');
  }

  async function ensureToken() {
    if (!state.token || !state.expiresAt) return loginWithCert();
    if (state.expiresAt - Date.now() <= marginMs) return renewNow();
  }

  fastify.decorate('vauth', {
    dispatcher,
    fetch: vfetch,
    rawFetch: rawFetch,
    getToken: () => state.token,
    ensureToken,
    loginWithCert,
    renewNow,
  });

  await loginWithCert();

  fastify.addHook('onClose', async () => {
    await dispatcher.close();
  });
};

export default fp(vaultClient, { name: 'vaultClient' });
