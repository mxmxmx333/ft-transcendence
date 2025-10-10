import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import fs from 'fs';

export interface TlsReloadOptions {
  certPath: string;
  keyPath: string;
  caPath: string;
  signal?: NodeJS.Signals; // default: 'SIGHUP'
  debounceMs?: number; // default: 300ms
  retryIntervalMs?: number; // default: 500ms
  retryTimeoutMs?: number; // default: 30000ms (30s)
}

function readBundle(opts: TlsReloadOptions) {
  const { certPath, keyPath, caPath } = opts;
  console.log('Reading certs from:', { certPath, keyPath, caPath });
  if (fs.existsSync(certPath) && fs.existsSync(keyPath) && fs.existsSync(caPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      ca: fs.readFileSync(caPath),
    } as const;
  }
  return null;
}

export default fp(async function tlsReloadPlugin(fastify: FastifyInstance, opts: TlsReloadOptions) {
  const signal = opts.signal ?? 'SIGHUP';
  const debounceMs = opts.debounceMs ?? 300;
  const retryIntervalMs = opts.retryIntervalMs ?? 500;
  const retryTimeoutMs = opts.retryTimeoutMs ?? 30_000;

  let debounce = false;
  let retryTimer: NodeJS.Timeout | null = null;

  function clearRetryTimer() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function setSecureContextIfPossible(bundle: { key: Buffer; cert: Buffer; ca: Buffer }) {
    const anyServer: any = fastify.server as any;
    if (anyServer && typeof anyServer.setSecureContext === 'function') {
      anyServer.setSecureContext(bundle);
      fastify.log.info('[tls-reload] TLS certificates reloaded');
      return true;
    } else {
      fastify.log.warn(
        '[tls-reload] Underlying server has no setSecureContext; restart required to apply new TLS material'
      );
      return false;
    }
  }

  function startRetryLoop(startedAt = Date.now()) {
    // Avoid multiple concurrent retry loops
    if (retryTimer) return;

    const attempt = () => {
      const bundle = readBundle(opts);
      if (bundle) {
        clearRetryTimer();
        setSecureContextIfPossible(bundle);
        return;
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed >= retryTimeoutMs) {
        clearRetryTimer();
        fastify.log.error('[tls-reload] Retry timeout reached; certificate bundle still not found');
        return;
      }
      retryTimer = setTimeout(attempt, retryIntervalMs);
    };

    // first schedule immediately (next tick) so we don’t block the current signal handler
    retryTimer = setTimeout(attempt, Math.min(50, retryIntervalMs));
    fastify.log.warn(
      { retryIntervalMs, retryTimeoutMs },
      '[tls-reload] Bundle missing; starting retry loop'
    );
  }

  async function reload() {
    if (debounce) return;
    debounce = true;
    try {
      const bundle = readBundle(opts);
      if (!bundle) {
        fastify.log.warn('[tls-reload] Skipping immediate reload: certificate bundle not found');
        startRetryLoop();
        return;
      }
      setSecureContextIfPossible(bundle);
    } catch (err) {
      fastify.log.error({ err }, '[tls-reload] TLS reload failed');
    } finally {
      setTimeout(() => {
        debounce = false;
      }, debounceMs);
    }
  }

  fastify.decorate('reloadTls', reload);
  process.on(signal, reload);
  fastify.addHook('onClose', async () => {
    process.off(signal, reload);
    clearRetryTimer();
  });
});
