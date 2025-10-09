import Fastify, { fastify } from 'fastify';
import path from 'path';
import proxy from '@fastify/http-proxy';
import dotenv from 'dotenv';
import fs from 'fs';
import fastifyStatic from '@fastify/static';
import vaultClient from './vault-client';
import vAuth from './auth';
dotenv.config();

const LOG_LEVEL = 'debug'; ///process.env.LOG_LEVEL || 'debug';

const isDevelopment = process.env.NODE_ENV === 'development';
const certDir = process.env.CERT_DIR || '../certs';

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
  let httpsOptions;
  const keyPath = path.join(__dirname, certDir, 'server.key');
  const certPath = path.join(__dirname, certDir, 'server.crt');
  const caPath = path.join(__dirname, certDir, 'ca.crt');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath) && fs.existsSync(caPath)) {
    httpsOptions = {
      https: {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
        ca: fs.readFileSync(caPath),
      },
    };
    console.log('Api-Gateway: ✅ SSL-Zertifikate gefunden, starte mit HTTPS');
  } else {
    console.warn('SSL-Zertifikate nicht gefunden, starte ohne HTTPS');
  }
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
        : {}),
    },
    ...httpsOptions,
  });
  // Register plugins
  await server.register(vaultClient);
  await server.register(vAuth);

  server.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/socket.io')) {
      server.log.info('🔍 Socket.IO request detected');
      server.log.info(`Headers: ${JSON.stringify(request.headers, null, 2)}`);
      server.log.info(`URL: ${request.url}`);
      server.log.info(`Method: ${request.method}`);
      server.log.info(`Auth Header: ${request.headers.authorization || 'MISSING'}`);
    }
    // Definiere welche Routen Auth benötigen
    const protectedRoutes = [
      '/api/profile',
      '/api/profile/set-nickname',
      '/api/user',
      '/api/users',
      '/api/friends',
      '/api/game',
      '/socket.io',
    ];
    const needsAuth = protectedRoutes.some((route) => request.url.startsWith(route));

    if (!needsAuth) {
      return;
    }

  let token = null;

  // 1. Versuche Authorization Header (für HTTP API Calls)
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
    server.log.info('🔍 Token from Authorization header');
  }

  // 2. Für Socket.IO: Token aus Query Parameter
  if (!token && request.url.startsWith('/socket.io')) {
    const url = new URL(request.url, 'http://localhost');
    token = url.searchParams.get('token');
    server.log.info(`🔍 Socket.IO token from query: ${token ? 'FOUND' : 'MISSING'}`);
  }

  if (!token) {
    server.log.warn(`❌ No token found for ${request.url}`);
    return reply.code(401).send({
      error: 'Authorization token missing',
      message: 'Please provide a valid Bearer token or token query parameter',
    });
  }
    try {
      const user = await server.vAuth.verify(token);
        console.debug('Token:', token);
        console.debug('ID:', user.sub);
        console.debug('Nickname:', user.nickname);
      if (user.nickname_required && request.url !== '/api/profile/set-nickname') {
        throw new Error('Tried accessing an disallowed endpoint with a preAuth token');
      }
      console.debug('type of user.sub:', typeof user.sub);
      console.debug('type of user.nickname:', typeof user.nickname);
      console.debug('type of request.headers:', typeof request.headers);

      request.headers['x-user-id'] = user.sub.toString();
      if (user.nickname !== null) {
        request.headers['x-user-nickname'] = user.nickname.toString();
      }
      console.debug('type of request.headers["x-user-id"]:', typeof request.headers['x-user-id']);

      server.log.info(`✅ Authorized user: ${user.nickname} (${user.sub})`);
    } catch (error) {
      server.log.warn(`❌ Auth failed: ${error}`);
      return reply.code(401).send({
        error: 'Invalid token',
        message: 'Token verification failed',
      });
    }
  });

  // === ROUTE GAME SERVICE ===
  await server.register(proxy, {
    upstream: upstreamGameService || 'https://localhost:3001',
    prefix: '/socket.io',
    rewritePrefix: '/socket.io',
    websocket: true,
    wsClientOptions: {
      rejectUnauthorized: false,
      rewriteRequestHeaders: (headers: any, request: any) => {
        headers['x-user-id'] = request.headers['x-user-id'];
        headers['x-user-nickname'] = request.headers['x-user-nickname'];
        return {
          ...headers,
        };
      },
    },
    wsUpstream: 'wss://localhost:3001',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await server.register(proxy, {
    upstream: upstreamGameService || 'https://localhost:3001',
    prefix: '/api/game',
    rewritePrefix: '/api/game',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // === ROUTE AI OPPONENT SERVICE ===
  await server.register(proxy, {
    upstream: aiServiceUpstream || 'https://localhost:3003',
    prefix: '/api/ai',
    rewritePrefix: '/api/ai',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // === ROUTE AUTH AND USER SERVICE ===
  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/auth',
    rewritePrefix: '/api/auth',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });
  
  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/socket.io/livechat',
    rewritePrefix: '/socket.io',
    websocket: true,
    wsClientOptions: {
      rejectUnauthorized: false,
      rewriteRequestHeaders: (headers: any, request: any) => {
        headers['x-user-id'] = request.headers['x-user-id'];
        headers['x-user-nickname'] = request.headers['x-user-nickname'];
        return {
          ...headers,
        };
      },
    },
    wsUpstream: 'wss://localhost:3002',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // NEW ADDED PLEASE DONT DELETE, I FORGOT EDDING THESE ROUTES AND IT COST ME A DAY ABOUT FRIEND REQUEST FEATURE :((
  // ==============================================

  // === More New added
  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/user',
    rewritePrefix: '/api/user',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/users',
    rewritePrefix: '/api/users',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Friend request endpoint'leri
  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/friends/requests',
    rewritePrefix: '/api/friends/requests',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // ============

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/user/:id', // Dinamik route için
    rewritePrefix: '/api/user/:id', // Aynı şekilde rewrite edin
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/friends',
    rewritePrefix: '/api/friends',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });
  // =================================================

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/signup',
    rewritePrefix: '/api/signup',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/login',
    rewritePrefix: '/api/login',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/auth/42',
    rewritePrefix: '/api/auth/42',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/auth/42/callback',
    rewritePrefix: '/api/auth/42/callback',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/logout',
    rewritePrefix: '/api/logout',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
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
    server.log.info(`API Gateway running at https://localhost:3000`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
