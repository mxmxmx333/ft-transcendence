import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import {
  Agent as UndiciAgent,
  fetch as undiciFetch,
  setGlobalDispatcher,
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

declare module 'fastify' {
  interface FastifyInstance {
    httpsAgent: {
      dispatcher: Dispatcher;
      rawFetch: typeof undiciFetch;
      reloadMtls: () => Promise<void>;
    };
  }
}

const certDir = process.env.CERT_DIR || path.resolve(__dirname, '../certs');

const httpsAgent: FastifyPluginAsync = async (fastify) => {
  const caPath = path.join(certDir, 'ca.crt');

  let enabled = false;

  function createDispatcher() {
    if (filesReady([caPath])) {
      const ca = mustRead(caPath, 'CA');
      
      enabled = true;
      const agent = new UndiciAgent({
        keepAliveTimeout: 30_000,
        keepAliveMaxTimeout: 60_000,
        connect: { ca },
      });
      // Ensure global fetch() uses our dispatcher
      setGlobalDispatcher(agent);
      return agent;
    }
    // Fallback agent without custom CA; plugin stays disabled until file appears
    enabled = false;
    const fallback = new UndiciAgent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 60_000 });
    setGlobalDispatcher(fallback);
    return fallback;
  }

  let dispatcher = createDispatcher();

  async function tryEnable(force = false) {
    if (!force && enabled) return;
    if (!filesReady([caPath])) {
      fastify.log.warn('[ca-agent] CA file not present yet; HTTPS client inactive');
      return;
    }
    // swap dispatcher with custom CA
    const next = new UndiciAgent({
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      connect: {
        ca: mustRead(caPath, 'CA'),
      },
    });
    setGlobalDispatcher(next);
    const prev = dispatcher;
    dispatcher = next;
    try { await prev.close(); } catch {}
    enabled = true;
    fastify.log.info('[ca-agent] enabled custom CA after file appeared');
  }

  let reloading = false;
  async function reloadMtls() {
    if (reloading) return;
    reloading = true;
    try {
      const next = createDispatcher();
      const prev = dispatcher;
      dispatcher = next;
      setGlobalDispatcher(next);
      try {
        await prev.close();
      } catch (e) {
        if (typeof (prev as any).destroy === 'function') (prev as any).destroy();
      }
      fastify.log.info('[ca-agent] HTTPS dispatcher reloaded');
    } catch (err) {
      fastify.log.error({ err }, '[ca-agent] HTTPS reload failed');
    } finally {
      reloading = false;
    }
  }

  const rawFetch: typeof undiciFetch = (url, init) =>
    undiciFetch(url, { ...(init as UndiciRequestInit), dispatcher });



  fastify.decorate('httpsAgent', {
    get dispatcher() { return dispatcher; },
    rawFetch: rawFetch,
    reloadMtls,
  });
  
  // Install SIGHUP handler to reload CA materials at runtime
  const hupHandler = () => { void (enabled ? reloadMtls() : tryEnable(true)); };
  process.on('SIGHUP', hupHandler);

  // Do not fail startup if files are missing; attempt to enable once
  await tryEnable(false);

  fastify.addHook('onClose', async () => {
    process.off('SIGHUP', hupHandler);
    await dispatcher.close();
  });
};

export default fp(httpsAgent, { name: 'httpsAgent' });
