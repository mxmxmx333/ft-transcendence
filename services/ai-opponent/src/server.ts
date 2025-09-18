import Fastify, { fastify } from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import proxy from '@fastify/http-proxy';
import * as dotenv from 'dotenv';
import { io, Socket } from 'socket.io-client';
import { SocketManager } from './socketManager';

dotenv.config();

const LOG_LEVEL = 'debug'; ///process.env.LOG_LEVEL || 'debug';

const isDevelopment = process.env.NODE_ENV === 'development';

export const apiGatewayUpstream = process.env.API_GATEWAY_UPSTREAM;
if (!apiGatewayUpstream) {
  throw new Error('API_GATEWAY_UPSTREAM environment variable is not set');
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
 
  return server;
}

function startSocketConnection(roomId: string) {
  const socketManager = SocketManager.getInstance();
  socketManager.connect();
  socketManager.getSocket()?.emit('join_room', { roomId });
  socketManager.onGameStart = (payload) => {
    console.log('Game started with payload:', payload);
  };
}

async function start() {
  const server = await buildServer();
  server.get('/api/ai', async (request, reply) => {
    console.log('Received request at /api/ai/');
    const roomId = request.headers['roomid'];
    if (!roomId || typeof roomId !== 'string') {
      reply.status(400).send({ error: 'Missing or invalid roomId header' });
      return;
    }
    startSocketConnection(roomId);
    return { message: 'Hello from AI Opponent!' };
  });
  server.get('/api/health', async (request, reply) => {
    return { status: 'ok' };
  });
  server.delete('/api/ai', async (request, reply) => {
    const roomId = request.headers['roomid'];
    if (!roomId || typeof roomId !== 'string') {
      reply.status(400).send({ error: 'Missing or invalid roomId header' });
      return;
    }
    // TODO: Implement instance deletion logic
  });
    try {
    await server.listen({ port: 3003, host: '0.0.0.0' });
    server.log.info(`API Gateway running at http://localhost:3003`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
