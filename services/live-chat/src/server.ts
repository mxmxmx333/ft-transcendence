import fastify from 'fastify';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { FastifyRequest } from 'fastify';
import dotenv from 'dotenv';
import { AuthPayload, TournamentInfo } from './types/types';
import database from './db';
import tlsReloadPlugin from './tls-reload';
import fs from 'fs';
import path from 'path';
import { registerIoHandlers } from './io.handler';
import httpsAgent from './https-client-plugin';
import { display_tournament_message } from './backend_connections';
dotenv.config();

const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';

export const authUserServiceUpstream =
  process.env.AUTH_USER_SERVICE_UPSTREAM || 'https://localhost:3002';

const isDevelopment = process.env.NODE_ENV === 'development';
let certDir = process.env.CERT_DIR || '../certs';
export const frontendUrl = process.env.FRONTEND_URL;
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
  if (!token) return next(new Error('No token provided'));

  try {
    let decoded: AuthPayload = {} as AuthPayload;
    decoded.id = socket.request.headers['x-user-id']?.toString() as string;
    decoded.nickname = socket.request.headers['x-user-nickname']?.toString() as string;
    console.debug('id: ', decoded.id, 'nickname: ', decoded.nickname);

    socket.user = {
      id: decoded.id,
      nickname: decoded.nickname,
    };
    console.log(`User ${socket.user.nickname} connected`);
    next();
  } catch (err) {
    console.error('Invalid token', err);
    next(new Error('Missing or invalid token'));
  }
});

registerIoHandlers(io);

// --- Error handler ---
server.setErrorHandler((error, request, reply) => {
  console.error('Error:', error);
  server.log.error(error);
  reply.status(500).send({ error: 'Internal Server Error' });
});

// --- Shutdown ---
async function gracefulShutdown(signal: string) {  
  try {
    io.close(() => {});
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

// --- Start server ---
async function start() {
  await server.register(database);
  await server.register(tlsReloadPlugin, {
    certPath,
    keyPath,
    caPath,
    signal: 'SIGHUP',
    debounceMs: 300,
  });
  await server.register(httpsAgent);
  await server.post<{ Body: TournamentInfo }>('/tournament/notificiation', (request, reply) => {
    return display_tournament_message(request, reply);
  });
  await server.listen({ port: 3004, host: '0.0.0.0' });
  console.log('Live Chat service listening at http://localhost:3004');
}

start().catch((err) => {
  console.error('Error starting live chat server:', err);
  process.exit(1);
});
