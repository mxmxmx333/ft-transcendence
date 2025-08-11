import fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { Socket } from 'socket.io';
import dotenv from 'dotenv';
import jwt from '@fastify/jwt';
import { AuthPayload } from './types/types';

dotenv.config();
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';
const isDevelopment = process.env.NODE_ENV === 'development';
const JWT_TOKEN_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const server = fastify({
  logger: {
    level: LOG_LEVEL,
    ...(isDevelopment
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, singleLine: false },
          },
        }
      : {}),
  },
});

export const io = new SocketIOServer(server.server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
  },
});

server.register(jwt, {
  secret: JWT_TOKEN_SECRET!,
});

// === WebSocket Authentication Middleware ===
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    console.log('[Auth] No token provided');
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const payload = server.jwt.verify(token) as AuthPayload;
    socket.user = payload;
    console.log(`[Auth] User ${payload.nickname} authenticated successfully`);
    next();
  } catch (err) {
    console.error('[Auth] JWT verification error:', err);
    next(new Error('Missing or invalid token'));
  }
});

// ÖNEMLI: io handler'ı io tanımlandıktan SONRA import et
import './io.handler';

//  === Error Logging ===
server.setErrorHandler((error, request, reply) => {
  console.log('Error occurred:', error);
  server.log.error(error);
  reply.status(500).send({ error: 'Internal Server Error' });
});

async function start() {
  await server.listen({ port: 3001, host: '0.0.0.0' });
  console.log('Server backend is listening: http://localhost:3001 adresinde çalışıyor');
}

start().catch((err) => {
  console.error('Error: Server initialization failed', err);
  process.exit(1);
});
