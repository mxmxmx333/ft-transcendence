import fastify from 'fastify';
import path from 'path';
import dbConnector from './db';
import AuthService from './auth.service';
import fastifyMultipart from '@fastify/multipart';
import AuthController from './auth.controller';
import fs from 'fs';
import vaultClient from './vault-client';
import vAuth from './auth';
import OAuthService from './oauth';
import { SqliteError } from 'better-sqlite3';
import { Server as SocketIOServer } from 'socket.io';
import { AuthPayload } from './types/types';
import { registerIoHandlers } from './io.handler';

const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';

export const frontendUrl = process.env.FRONTEND_URL;
if (!frontendUrl) {
  throw new Error('FRONTEND_URL environment variable is not set');
}
const isDevelopment = process.env.NODE_ENV === 'development';

const certDir = process.env.CERT_DIR || '../certs';
const keyPath = path.join(__dirname, certDir, 'server.key');
const certPath = path.join(__dirname, certDir, 'server.crt');
const caPath = path.join(__dirname, certDir, 'ca.crt');


// async function buildServer() {
  let httpsOptions;
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


  export const io = new SocketIOServer(server.server, {
	cors: {
	  origin: frontendUrl,
	  methods: ['GET', 'POST'],
	  credentials: true,
	},
	transports: ['websocket', 'polling'],
	allowEIO3: true,
  });
  
  
  // --- Authentication middleware for sockets ---
  io.use((socket, next) => {
	const token = socket.handshake.auth.token;
	if (!token)
		return next(new Error('No token provided'));

	try
	{
		let decoded: AuthPayload= {} as AuthPayload;
    	decoded.id = socket.request.headers['x-user-id']?.toString() as string;
    	decoded.nickname = socket.request.headers['x-user-nickname']?.toString() as string;
    	console.debug('id: ', decoded.id, 'nickname: ', decoded.nickname);

    	socket.user = {
			id: decoded.id,
			nickname: decoded.nickname
   		};
		console.log(`[LiveChat] User ${socket.user.nickname} connected`);
		next();
	}
	catch (err)
	{
		console.error('[LiveChat] Invalid token', err);
		next(new Error('Missing or invalid token'));
	}
  });
  
//   return server;
// }

registerIoHandlers(io);

  // Error handling
  server.setErrorHandler((error, request, reply) => {
    server.log.error(error);
    reply.status(500).send({ error: 'Internal Server Error' });
  });


interface SignupBody {
  nickname: string;
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
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

async function start() {
//   const server = await buildServer();
  // Register plugins

  //TESTING
  await server.register(fastifyMultipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
      files: 1 // Maksimum 1 dosya
    }
  });

  //TESTING
  await server.register(dbConnector);
  await server.register(vaultClient);
  await server.register(vAuth);
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

  server.get('/api/auth/42', async (request, reply) => {
    if (!oAuthService.envVariablesConfigured()) {
      return reply.status(500).send({
        error: 'OAuth settings not configured in .env file'
      });
    }

    request.log.info({headers: request.headers}, 'Incoming oauth request headers');

    const result = await authController.oAuthLogin(request, reply);

    request.log.info({result}, 'OAuth Login response');

    return result;
  });

  server.get('/api/auth/42/callback', async (request, reply) => {
    if (!oAuthService.envVariablesConfigured()) {
      return reply.status(500).send({
        error: 'OAuth settings not configured in .env file'
      });
    }

    request.log.info({headers: request.headers}, 'Incoming oauth callback headers');

    const result = await authController.oAuthLoginCallback(request, reply);

    request.log.info({result}, 'OAuth Login callback response');

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

server.register(require('@fastify/static'), {
  root: path.join(__dirname, '../uploads'),
  prefix: '/uploads/',
});
  //TESTING
  server.post<{ Body: { nickname: string } }>('/api/profile/set-nickname', async (request, reply) => {
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
        const result = authService.setNickname(user.id, request.body.nickname);
        const signToken = await authController.signUserInfos(result);

        return reply.send({ success: true, token: signToken, user: result });
      } catch (error) {
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

  });
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
