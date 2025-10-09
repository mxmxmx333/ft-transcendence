import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import fs from 'fs';

export interface TlsReloadOptions {
  certPath: string;
  keyPath: string;
  caPath: string;
  signal?: NodeJS.Signals; // default: 'SIGHUP'
  debounceMs?: number;     // default: 300ms
}

function readBundle(opts: TlsReloadOptions) {
  const { certPath, keyPath, caPath } = opts;
  if (fs.existsSync(certPath) && fs.existsSync(keyPath) && fs.existsSync(caPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      ca: fs.readFileSync(caPath),
    };
  }
  return null;
}

export default fp(async function tlsReloadPlugin (fastify: FastifyInstance, opts: TlsReloadOptions) {
  const signal = opts.signal ?? 'SIGHUP';
  const debounceMs = opts.debounceMs ?? 300;

  let debounce = false;

  async function reload() {
    if (debounce) return;
    debounce = true;
    try {
      const bundle = readBundle(opts);
      if (!bundle) {
        fastify.log.warn('[tls-reload] Skipping reload: certificate bundle not found');
        return;
      }
      const anyServer: any = fastify.server as any;
      if (anyServer && typeof anyServer.setSecureContext === 'function') {
        anyServer.setSecureContext(bundle);
        fastify.log.info('[tls-reload] TLS certificates reloaded');
      } else {
        fastify.log.warn('[tls-reload] Underlying server has no setSecureContext; restart required to apply new TLS material');
      }
    } catch (err) {
      fastify.log.error({ err }, '[tls-reload] TLS reload failed');
    } finally {
      setTimeout(() => { debounce = false; }, debounceMs);
    }
  }
  fastify.decorate('reloadTls', reload);
  process.on(signal, reload);
  fastify.addHook('onClose', async () => {
    process.off(signal, reload);
  });
});
