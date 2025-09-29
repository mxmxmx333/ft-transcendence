import fastify from 'fastify';
import path from 'path';
import dbConnector from './db';
import authPlugin from './auth';
import AuthService from './auth.service';
import AuthController from './auth.controller';
import db from './db';
import fs from 'fs';

const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';

const isDevelopment = process.env.NODE_ENV === 'development';


const certDir = process.env.CERT_DIR || '../certs';
const keyPath = path.join(__dirname, certDir, 'server.key');
const certPath = path.join(__dirname, certDir, 'server.crt');
const caPath = path.join(__dirname, certDir, 'ca.crt');


async function buildServer() {
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
  const server = fastify({
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

  // Register plugins
  await server.register(dbConnector);
  await server.register(authPlugin);

  // Error handling
  server.setErrorHandler((error, request, reply) => {
    server.log.error(error);
    reply.status(500).send({ error: 'Internal Server Error' });
  });

  return server;
}

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
  const server = await buildServer();
  const authService = new AuthService(server);
  const authController = new AuthController(authService, server);

  server.post<{ Body: SignupBody }>('/api/signup', (request, reply) =>
    authController.signup(request, reply)
  );

  server.post<{ Body: LoginBody }>('/api/login', async (request, reply) => {
    // 1) Logge eingehende Payload
    request.log.info({ headers: request.headers }, 'Incoming login request headers');
    request.log.info({ body: request.body }, 'Incoming login request');

    // 2) Rufe deinen Controller auf
    const result = await authController.login(request, reply);

    // 3) (Optional) Logge die Antwort
    request.log.info({ result }, 'Login response');

    return result;
  });

  server.post('/api/logout', async (req, reply) => {
    try {
      return reply.send({ success: true });
    } catch (err) {
      return reply.status(500).send({ error: 'Logout failed' });
    }
  });

  server.get('/api/profile', async (req, reply) => {
    req.log.info({ headers: req.headers }, 'Incoming profile request');
    req.log.info({ auth: req.headers.authorization }, 'Auth header');
    try {
      const decoded = await req.jwtVerify<{ id: string }>();
      const user = await authService.getUserById(Number(decoded.id));

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

// Friend request'e cevap verme endpoint'i
server.post('/api/friends/request/:id/accept', async (req, reply) => {
  return authController.respondToFriendRequestById(
    { ...req, body: { action: 'accept' } } as any, 
    reply
  );
});

server.post('/api/friends/request/:id/decline', async (req, reply) => {
  return authController.respondToFriendRequestById(
    { ...req, body: { action: 'decline' } } as any, 
    reply
  );
});

server.post<{ Params: { id: string }, Body: { action: 'accept' | 'decline' } }>('/api/friends/request/:id/:action?', async (req, reply) => {
  // URL parametresinden action'ı al veya body'den
  const actionFromUrl = (req.params as any).action;
  const actionFromBody = (req.body as any)?.action;
  const action = actionFromUrl || actionFromBody;
  
  if (!action) {
    return reply.status(400).send({ error: 'Action parameter required' });
  }

  return authController.respondToFriendRequestById(
    { 
      ...req, 
      params: req.params, 
      body: { action } 
    } as any, 
    reply
  );
});

// =========
  server.put<{ Body: UpdateProfileBody }>('/api/profile', async (req, reply) => {
    return authController.updateProfile(req, reply);
  });
  
    server.get<{ Querystring: { q: string } }>('/api/users/search', async (req, reply) => {
    req.log.info({ query: req.query }, 'Incoming search request');
    return authController.searchUsers(req, reply);
  });

  server.post<{ Body: FriendRequestBody }>('/api/friends/request', async (req, reply) => {
    return authController.sendFriendRequest(req, reply);
  });

  server.put<{ Body: FriendResponseBody }>('/api/friends/respond', async (req, reply) => {
    return authController.respondToFriendRequest(req, reply);
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
