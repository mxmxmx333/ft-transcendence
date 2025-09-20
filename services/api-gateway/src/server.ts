import Fastify, { fastify } from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'path';
import cors from '@fastify/cors';
import proxy from '@fastify/http-proxy';
import dotenv from 'dotenv';
dotenv.config();

const LOG_LEVEL = 'debug'; ///process.env.LOG_LEVEL || 'debug';

const isDevelopment = process.env.NODE_ENV === 'development';

const aiServiceUpstream = process.env.AI_OPPONENT_SERVICE_UPSTREAM;
if (!aiServiceUpstream) {
  throw new Error('AI_OPPONENT_SERVICE_UPSTREAM environment variable is not set');
}

const upstreamGameService = process.env.GAME_SERVICE_UPSTREAM;
if (!upstreamGameService) {
  throw new Error('GATEWAY_UPSTREAM environment variable is not set');
}

const upstreamAuthAndUserService = process.env.AUTH_USER_SERVICE_UPSTREAM;
if (!upstreamAuthAndUserService) {
  throw new Error('AUTH_USER_SERVICE_UPSTREAM environment variable is not set');
}

async function buildServer() {
  const server = Fastify({
    logger: {
      level: 'debug',

      ...(process.env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: false,
              },
            },
          }
        : {}), // In Production füge nichts hinzu
    },
  });
  // // CORS
  // const publicRoot = isDevelopment
  //   ? path.join(__dirname, '../public')
  //   : path.join(__dirname, '../public');
  // await server.register(fastifyStatic, {
  //   root: publicRoot,
  //   prefix: '/',
  //   wildcard: true,
  // });
  // === ROUTE GAME SERVICE ===
  await server.register(proxy, {
    upstream: upstreamGameService || 'http://localhost:3001',
    prefix: '/socket.io',
    rewritePrefix: '/socket.io',
    websocket: true,
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await server.register(proxy, {
    upstream: upstreamGameService || 'http://localhost:3001',
    prefix: '/api/game',
    rewritePrefix: '/api/game',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // === ROUTE AI OPPONENT SERVICE ===
  await server.register(proxy, {
    upstream: aiServiceUpstream || 'http://localhost:3003',
    prefix: '/api/ai',
    rewritePrefix: '/api/ai',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });
    
  // === ROUTE AUTH AND USER SERVICE ===
  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'http://localhost:3002',
    prefix: '/api/auth',
    rewritePrefix: '/api/auth',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // NEW ADDED PLEASE DONT DELETE, I FORGOT EDDING THESE ROUTES AND IT COST ME A DAY ABOUT FRIEND REQUEST FEATURE :((
  // ==============================================

  // === More New added
  await server.register(proxy, {
  upstream: upstreamAuthAndUserService || 'http://localhost:3002',
  prefix: '/api/user',
  rewritePrefix: '/api/user',
  httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

await server.register(proxy, {
  upstream: upstreamAuthAndUserService || 'http://localhost:3002',
  prefix: '/api/users',
  rewritePrefix: '/api/users',
  httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// Friend request endpoint'leri
await server.register(proxy, {
  upstream: upstreamAuthAndUserService || 'http://localhost:3002',
  prefix: '/api/friends/requests',
  rewritePrefix: '/api/friends/requests',
  httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});


  // ============


await server.register(proxy, {
  upstream: upstreamAuthAndUserService || 'http://localhost:3002',
  prefix: '/api/user/:id', // Dinamik route için
  rewritePrefix: '/api/user/:id', // Aynı şekilde rewrite edin
  httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});


await server.register(proxy, {
  upstream: upstreamAuthAndUserService || 'http://localhost:3002',
  prefix: '/api/friends',
  rewritePrefix: '/api/friends',
  httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});
// =================================================


  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'http://localhost:3002',
    prefix: '/api/signup',
    rewritePrefix: '/api/signup',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'http://localhost:3002',
    prefix: '/api/login',
    rewritePrefix: '/api/login',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'http://localhost:3002',
    prefix: '/api/logout',
    rewritePrefix: '/api/logout',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'http://localhost:3002',
    prefix: '/api/profile',
    rewritePrefix: '/api/profile',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  server.setNotFoundHandler((request, reply) => {
    if (request.raw.method === 'GET' && !request.raw.url?.startsWith('/api')) {
      reply.sendFile('index.html');
    } else {
      reply.status(404).send({ error: 'Not Found' });
    }
  });

  return server;
}

async function start() {
  const server = await buildServer();
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' });
    server.log.info(`API Gateway running at http://localhost:3000`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
