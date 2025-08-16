import fastify from 'fastify';
import path from 'path';
import dbConnector from './db';
import authPlugin from './auth';
import AuthService from './auth.service';
import AuthController from './auth.controller';
import db from './db';

const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';

const isDevelopment = process.env.NODE_ENV === 'development';

async function buildServer() {
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
  });

  // Register plugins
  await server.register(dbConnector);
  await server.register(authPlugin);

  const authService = new AuthService(server);
  const authController = new AuthController(authService, server);

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

  server.get('/health', async (_req, reply) => {
    reply.send({ status: 'ok' });
  });

  await server.listen({ port: 3002, host: '0.0.0.0' });
  console.log('Server "auth-user-service" is listening: http://localhost:3002 ');
}

start().catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});
