import fastify from 'fastify';
import path from 'path';
import dbConnector from './db';
import AuthService from './auth.service';
import fastifyMultipart from '@fastify/multipart';
import AuthController, { Nickname } from './auth.controller';
import fs from 'fs';
import vaultClient from './vault-client';
import vAuth from './auth';
import OAuthService from './oauth';
import { SqliteError } from 'better-sqlite3';
import { MatchResultBody } from './user';
import tlsReloadPlugin from './tls-reload';
import httpsAgent from './https-client-plugin';
import z, { ZodError } from 'zod';

const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';
const uploadsBaseDir = process.env.AVATAR_UPLOAD_DIR || path.join(__dirname, '../uploads');

export const OAUTH_REDIRECT_URL = process.env.OAUTH_REDIRECT_URL;
if (!OAUTH_REDIRECT_URL) {
  throw new Error('OAUTH_REDIRECT_URL environment variable is not set');
}
export const liveChatUpstream = process.env.LIVE_CHAT_UPSTREAM;
if (!liveChatUpstream) {
  throw new Error('LIVE_CHAT_UPSTREAM environment variable is not set');
}
const isDevelopment = process.env.NODE_ENV === 'development';
let certDir = process.env.CERT_DIR || '../certs';
if (isDevelopment) {
  certDir = path.join(__dirname, certDir);
}
const keyPath = path.join(certDir, 'server.key');
const certPath = path.join(certDir, 'server.crt');
const caPath = path.join(certDir, 'ca.crt');

let httpsOptions = {} as Record<string, any>;
if (fs.existsSync(keyPath) && fs.existsSync(certPath) && fs.existsSync(caPath)) {
  httpsOptions = {
    https: {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      ca: fs.readFileSync(caPath),
    },
  };
  console.log('Auth-Service: ✅ SSL-Zertifikate gefunden, starte mit HTTPS');
} else {
  console.warn('SSL-Zertifikate nicht gefunden, starte ohne HTTPS');
}
export const server = fastify({
  logger: {
    level: 'debug',
    ...(isDevelopment
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: false,
            },
          },
        }
      : {}),
  },
  ...httpsOptions,
});

// Error handling
server.setErrorHandler((error, request, reply) => {
  server.log.error(error);
  reply.status(500).send({ error: 'Internal Server Error' });
});

server.register(httpsAgent);

interface SignupBody {
  nickname: string;
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface TotpBody {
  totp_code: string;
}

interface UpdateAccountBody {
  email: string;
  current_password: string;
  new_password: string | null;
}

interface DeleteAccountBody {
  password: string | null;
}

// I added new features don't delete
interface UpdateProfileBody {
  nickname?: string;
  avatar?: string;
  status?: string;
}

interface FriendRequestBody {
  targetUserId: number;
}

interface FriendResponseBody {
  friendshipId: number;
  response: 'accepted' | 'declined';
}

// --- Shutdown ---
async function gracefulShutdown(signal: string) {  
  try {
    await server.close();
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// --- Start Server ---
async function start() {
  //   const server = await buildServer();
  // Register plugins
  await server.register(dbConnector);
  await server.register(vaultClient);
  await server.register(vAuth);

  // Pre-warm Vault token to avoid first-request race conditions
  try {
    // Force enable + ensure token before serving requests
    // (requires vClient.tryEnable to be exposed by the plugin)
    // If files are missing, this will just log a warning and continue.
    // It avoids 403 from transit/keys on first request.
    await (server as any).vClient?.tryEnable?.(true);
    await (server as any).vClient?.ensureToken?.(true);
    server.log.info('[startup] Vault client ready (token pre-warmed)');
  } catch (err) {
    server.log.warn({ err }, '[startup] Vault client not ready yet; will attempt on demand');
  }

  await server.register(tlsReloadPlugin, {
    certPath,
    keyPath,
    caPath,
    signal: 'SIGHUP',
    debounceMs: 300,
  });
  //TESTING
  await server.register(fastifyMultipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
      files: 1, // Maksimum 1 dosya
    },
  });

  //TESTING

  const authService = new AuthService(server);

  const oAuthService = new OAuthService();
  const authController = new AuthController(authService, oAuthService, server);

  server.post<{ Body: SignupBody }>('/api/signup', (request, reply) =>
    authController.signup(request, reply)
  );

  server.post<{ Body: LoginBody }>('/api/login', async (request, reply) => {
    // 1) Logge eingehende Payload
    request.log.info({ headers: request.headers }, 'Incoming login request headers');

    // 2) Rufe deinen Controller auf
    const result = await authController.login(request, reply);

    // 3) (Optional) Logge die Antwort
    request.log.info({ result }, 'Login response');

    return result;
  });

  server.get<{Querystring: {cli_port?: number}}>('/api/auth/42', async (request, reply) => {
    if (!oAuthService.envVariablesConfigured()) {
      return reply.status(500).send({
        error: 'OAuth settings not configured in .env file',
      });
    }

    request.log.info({ headers: request.headers }, 'Incoming oauth request headers');

    const result = await authController.oAuthLogin(request, reply);

    request.log.info({ result }, 'OAuth Login response');

    return result;
  });

  server.get('/api/auth/42/callback', async (request, reply) => {
    if (!oAuthService.envVariablesConfigured()) {
      return reply.status(500).send({
        error: 'OAuth settings not configured in .env file',
      });
    }

    request.log.info({ headers: request.headers }, 'Incoming oauth callback headers');

    const result = await authController.oAuthLoginCallback(request, reply);

    request.log.info({ result }, 'OAuth Login callback response');

    return result;
  });

  server.post<{Body: TotpBody}>('/api/auth/2fa/login', async (request, reply) => {
    request.log.info({headers: request.headers}, 'Incoming login 2fa headers');

    const result = await authController.login2Fa(request, reply);

    request.log.info({result}, 'Login 2FA response');

    return result;
  });

  server.post<{Body: TotpBody}>('/api/auth/2fa/enable', async (request, reply) => {
    request.log.info({headers: request.headers}, 'Incoming enable 2fa headers');

    const result = await authController.enable2Fa(request, reply);

    request.log.info({result}, 'Enable 2FA response');

    return result;
  });

  server.post<{Body: TotpBody}>('/api/auth/2fa/disable', async (request, reply) => {
    request.log.info({headers: request.headers}, 'Incoming disable 2fa headers');

    const result = await authController.disable2Fa(request, reply);

    request.log.info({result}, 'Disable2FA response');

    return result;
  });

  server.get('/api/account', async (request, reply) => {
    request.log.info({headers: request.headers}, 'Incoming account headers');

    const result = await authController.getAccountInfos(request, reply);

    request.log.info({result}, '/account response');

    return result;
  });

  server.post<{Body: UpdateAccountBody}>('/api/account/update', async (request, reply) => {
    request.log.info({headers: request.headers}, 'Incoming account update headers');

    const result = await authController.updateAccountInfos(request, reply);

    request.log.info({result}, 'Account update response');

    return result;
  });

  server.post<{Body: DeleteAccountBody}>('/api/account/delete', async (request, reply) => {
    request.log.info({headers: request.headers}, 'Incoming account delete headers');

    const result = await authController.deleteAccount(request, reply);

    request.log.info({result}, 'Account delete response');

    return result;
  });

  server.post('/api/logout', async (req, reply) => {
    try {
      return reply.send({ success: true });
    } catch (err) {
      return reply.status(500).send({ error: 'Logout failed' });
    }
  });

  server.get('/api/profile/avatars', async (req, reply) => {
    return authController.getAvailableAvatars(req, reply);
  });

  server.get('/api/profile', async (req, reply) => {
    req.log.info({ headers: req.headers }, 'Incoming profile request');
    req.log.info({ auth: req.headers.authorization }, 'Auth header');
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const decoded = await req.server.vAuth.verify(token);
      const user = authService.getUserById(Number(decoded.sub));
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }
      return reply.send({
        nickname: user.nickname,
        email: user.email,
        avatar: user.avatar,
      });
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  //TESTING
  server.post('/api/profile/avatar/upload', async (req, reply) => {
    return authController.uploadAvatar(req, reply);
  });

  server.delete('/api/profile/avatar', async (req, reply) => {
    return authController.deleteCustomAvatar(req, reply);
  });
  server.get('/api/profile/chat-game-statistics', async (req, reply) => {
    return authController.getGameStatistics(req, reply);
  });
  server.register(require('@fastify/static'), {
    root: uploadsBaseDir,
    prefix: '/uploads/',
    decorateReply: false, // Önemli: reply.send'i override etme
  });
  //TESTING
  server.post<{ Body: { nickname: string } }>(
    '/api/profile/set-nickname',
    async (request, reply) => {
      request.log.info({ headers: request.headers }, 'Incoming profile request');
      try {
        const token = request.headers.authorization?.split(' ')[1];
        if (!token) {
          return reply.status(401).send({ error: 'Unauthorized' });
        }
        const decoded = await request.server.vAuth.verify(token);
        if (!decoded.nickname_required) {
          return reply.status(403).send({ error: 'Setting Nickname only allowed during sign up.' });
        }

        const user = authService.getUserById(Number(decoded.sub));
        if (!user || user.id === undefined) {
          return reply.status(404).send({ error: 'User not found' });
        }

        try {
          const nicknameSchema = z.object({nickname: Nickname});
          const {nickname} = await nicknameSchema.parseAsync(request.body);
          const result = authService.setNickname(user.id, nickname);
          const signToken = await authController.signUserInfos(result);

          return reply.send({ success: true, token: signToken, user: result });
        } catch (error) {
          if (error instanceof ZodError) {
            return reply.send({success: false, error: 'Nickname doesn\'t meet the requirements'});
          }
          if (error instanceof SqliteError) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
              return reply.send({ success: false, error: 'Nickname already in use' });
            }
            return reply.send({ success: false, error: 'Unknown database error' });
          }
          return reply.send({ success: false, error: 'Signing error' });
        }
      } catch (err) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  );
  // New don't delete pls

  // === More new methods
  server.get<{ Params: { id: string } }>('/api/user/:id', async (req, reply) => {
    return authController.getUserById(req, reply);
  });

  // Alternatif kullanıcı profil endpoint'i
  server.get<{ Params: { id: string } }>('/api/users/:id', async (req, reply) => {
    return authController.getUserByIdAlt(req, reply);
  });

  // Friend request'leri getirme endpoint'i
  server.get('/api/friends/requests', async (req, reply) => {
    return authController.getFriendRequests(req, reply);
  });

  server.post<{ Body: MatchResultBody }>('/api/match-result', async (req, reply) => {
    try {
      console.log('Internal match result received:', req.body);
      const success = authService.saveMatchResult(req.body);

      req.log.info({ matchData: req.body }, 'Match result saved internally');
      return reply.send({ success });
    } catch (error) {
      req.log.error(error);
      return reply.status(500).send({ error: 'Failed to save match result' });
    }
  });

  server.get<{ Querystring: { limit?: string } }>('/api/my-matches', async (req, reply) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const decoded = await req.server.vAuth.verify(token);
      const limit = parseInt(req.query.limit || '50');
      const matches = authService.getUserMatchHistory(Number(decoded.sub), limit);

      return reply.send({ matches });
    } catch (error) {
      req.log.error(error);
      return reply.status(500).send({ error: 'Failed to get match history' });
    }
  });

  server.get('/api/my-statistics', async (req, reply) => {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const decoded = await req.server.vAuth.verify(token);
      const stats = authService.getUserGameStats(Number(decoded.sub));

      return reply.send(stats);
    } catch (error) {
      req.log.error(error);
      return reply.status(500).send({ error: 'Failed to get statistics' });
    }
  });

  // =========
  server.put<{ Body: UpdateProfileBody }>('/api/profile', async (req, reply) => {
    return authController.updateProfile(req, reply);
  });

  server.get('/api/friends', async (req, reply) => {
    return authController.getFriends(req, reply);
  });

  server.delete<{ Params: { friendId: string } }>('/api/friends/:friendId', async (req, reply) => {
    return authController.removeFriend(req, reply);
  });

  server.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (request.method === 'OPTIONS') {
      reply.status(200).send();
      return;
    }
  });
  server.get('/health', async (_req, reply) => {
    reply.send({ status: 'ok' });
  });

  await server.listen({ port: 3002, host: '0.0.0.0' });
  console.log('Server "auth-user-service" is listening: https://localhost:3002 ');
}

start().catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});
