import fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { Socket } from 'socket.io';
// import { createServer } from 'http';
import dotenv from 'dotenv';
import jwt from '@fastify/jwt';
import { AuthPayload } from './types/types'; // Adjust the import path as necessary

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

// const httpServer = createServer(server.server);

export const io = new SocketIOServer(server.server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
  },
});

import './io.handler'; // Import the io handler to set up the connection

server.register(jwt, {
  secret: JWT_TOKEN_SECRET!,
});

// === WebSocket Authentication Middleware ===
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const payload = server.jwt.verify(token) as AuthPayload;
    socket.user = payload;
    next();
  } catch (err) {
    console.error('JWT verification error:', err);
    next(new Error('Missing or invalid token'));
  }
});

//  === Error Logging ===
server.setErrorHandler((error, request, reply) => {
  console.log('Error occurred:', error);
  server.log.error(error); // ganzer Stacktrace im Log
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
