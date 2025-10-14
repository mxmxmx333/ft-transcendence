import Fastify, { fastify, FastifyInstance } from 'fastify';
import path from 'path';
import proxy from '@fastify/http-proxy';
import dotenv from 'dotenv';
import fs from 'fs';
import fastifyStatic from '@fastify/static'; // IMPORTANT FOR SENDFILE
import vaultClient from './vault-client';
import vAuth from './auth';
import tlsReloadPlugin from './tls-reload';
import { register } from 'module';
import { send } from 'process';
dotenv.config();

const LOG_LEVEL = 'info'; ///process.env.LOG_LEVEL || 'debug';

const liveChatUpstream = process.env.LIVE_CHAT_UPSTREAM;
if (!liveChatUpstream) {
  throw new Error('LIVE_CHAT_UPSTREAM environment variable is not set');
}

const isDevelopment = process.env.NODE_ENV === 'development';
let certDir = process.env.CERT_DIR || '../certs';
if (isDevelopment) {
  certDir = path.join(__dirname, certDir);
}

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
  let httpsOptions: Record<string, any> = {};
  const keyPath = path.join(certDir, 'server.key');
  const certPath = path.join(certDir, 'server.crt');
  const caPath = path.join(certDir, 'ca.crt');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath) && fs.existsSync(caPath)) {
    httpsOptions = {
      https: {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
        ca: fs.readFileSync(caPath),
      },
    };
    console.log('Api-Gateway: SSL-Zertifikate gefunden, starte mit HTTPS');
  } else {
    console.warn('SSL-Zertifikate nicht gefunden, starte ohne HTTPS');
  }
  const server = Fastify({
    logger: {
      level: 'info',

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
  await server.register(tlsReloadPlugin, {
    certPath,
    keyPath,
    caPath,
    signal: 'SIGHUP',
    debounceMs: 300,
  });

  server.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/socket.io')) {
      server.log.info('🔍 Socket.IO request detected');
      server.log.info(`Headers: ${JSON.stringify(request.headers, null, 2)}`);
      server.log.info(`URL: ${request.url}`);
      server.log.info(`Method: ${request.method}`);
      server.log.info(`Auth Header: ${request.headers.authorization || 'MISSING'}`);
    }

    const publicRoutes = [
      '/api/signup',
      '/api/login',
      '/api/auth/42',
      '/api/auth/42/callback',
      '/api/logout',
      '/api/health',
      '/api/profile/avatars', // ✅ BU SATIRI EKLEYİN
      '/uploads/',
    ];
    if (publicRoutes.some((route) => request.url.startsWith(route))) {
      server.log.info(`✅ Public route: ${request.url}`);
      return;
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
      '/api/account',
      '/api/auth/2fa/enable',
      '/api/auth/2fa/disable',
      '/api/verify',
      '/api/profile/chat-game-statistics',
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
      server.log.warn(`No token found for ${request.url}`);
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
        throw new Error('Tried accessing an disallowed endpoint with a preAuth token (nickname required)');
      }
      if (user.totp_required && request.url !== '/api/auth/2fa/login') {
        throw new Error('Tried accessing an disallowed endpoint with a preAuth token (2fa required)');
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
      server.log.warn(`Auth failed: ${error}`);
      return reply.code(401).send({
        error: 'Invalid token',
        message: 'Token verification failed',
      });
    }
  });

  await server.get('/api/verify', async (request, reply) => {
    reply.code(200).send({ status: 'ok' });
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
    wsUpstream: upstreamGameService || 'https://localhost:3001',
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

  // === ROUTE LIVE CHAT ===
  await server.register(proxy, {
    upstream: liveChatUpstream || 'https://localhost:3004',
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
    wsUpstream: liveChatUpstream || 'https://localhost:3004',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // NEW ADDED PLEASE DONT DELETE, I FORGOT EDDING THESE ROUTES AND IT COST ME A DAY ABOUT FRIEND REQUEST FEATURE :((
  // ==============================================
  // await server.register(fastifyStatic, {
  //     root: path.join(__dirname, '../uploads/avatars'),
  //     prefix: '/uploads/avatars/',
  //     decorateReply: false
  //   });
  // const uploadsBasePath = path.resolve(__dirname, '../../uploads');
  // await server.register(fastifyStatic, {
  //   root: uploadsBasePath,  // ✅ Tüm uploads dizini
  //   prefix: '/uploads/',    // ✅ Tüm /uploads/ path'i
  //   decorateReply: false,
  //   serve: true,           // ✅ Serving aktif
  //   preCompressed: false,
  //   allowedPath: (pathName: string, root: string) => {
  //     // Güvenlik: sadece images ve avatars'a izin ver
  //     return pathName.startsWith(path.join(root, 'avatars'));
  //   }
  // });
  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/profile/avatar/upload',
    rewritePrefix: '/api/profile/avatar/upload',
    httpMethods: ['POST'],
  });
  await server.register(fastifyStatic, {
    root: path.join(__dirname, '../../uploads'),
    prefix: '/uploads/',
    decorateReply: false,
  });
  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/profile/avatar',
    rewritePrefix: '/api/profile/avatar',
    httpMethods: ['DELETE'],
  });
  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/profile/chat-game-statistics',
    rewritePrefix: '/api/profile/chat-game-statistics',
    httpMethods: ['GET'],
  });
  // === More New added
  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/profile/avatars',
    rewritePrefix: '/api/profile/avatars',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

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

  //match history
  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/my-statistics',
    rewritePrefix: '/api/my-statistics',
    httpMethods: ['GET'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/my-matches',
    rewritePrefix: '/api/my-matches',
    httpMethods: ['GET'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/account',
    rewritePrefix: '/api/account',
    httpMethods: ['GET', 'POST'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/auth/2fa/login',
    rewritePrefix: '/api/auth/2fa/login',
    httpMethods: ['POST'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/auth/2fa/enable',
    rewritePrefix: '/api/auth/2fa/enable',
    httpMethods: ['POST'],
  });

  await server.register(proxy, {
    upstream: upstreamAuthAndUserService || 'https://localhost:3002',
    prefix: '/api/auth/2fa/disable',
    rewritePrefix: '/api/auth/2fa/disable',
    httpMethods: ['POST'],
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

async function gracefulShutdown(signal: string, server: FastifyInstance) {  
    try {
      await server.close();
      console.log('Graceful shutdown completed');
      process.exit(0); 
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

// --- Start Server ---
async function start() {
  const server = await buildServer();
  
  process.on('SIGINT', () => gracefulShutdown('SIGINT', server));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM', server));
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION', server);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION', server);
  });

  try {
    await server.listen({ port: 3000, host: '0.0.0.0' });
    server.log.info(`API Gateway running at https://localhost:3000`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
