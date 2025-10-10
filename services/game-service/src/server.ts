import fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { registerIoHandlers } from './io.handler';
import dotenv from 'dotenv';
import { AuthPayload } from './types/types';
import fs from 'fs';
import path from 'path';
import tlsReloadPlugin from './tls-reload';
import httpsAgent from './https-client-plugin';

dotenv.config();
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';
const isDevelopment = process.env.NODE_ENV === 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://localhost:3000';
let certDir = process.env.CERT_DIR || '../certs';
if (isDevelopment) {
  certDir = path.join(__dirname, certDir);
}
export const apiGatewayUpstream = process.env.API_GATEWAY_UPSTREAM;
if (!apiGatewayUpstream) {
  throw new Error('API_GATEWAY_UPSTREAM environment variable is not set');
}
export const aiUpstream = process.env.AI_OPPONENT_SERVICE_UPSTREAM;
if (!aiUpstream) {
  throw new Error('AI_OPPONENT_SERVICE_UPSTREAM environment variable is not set');
}

const keyPath = path.join(certDir, 'server.key');
const certPath = path.join(certDir, 'server.crt');
const caPath = path.join(certDir, 'ca.crt');
let httpsOptions: Record<string, any> = {};
if (fs.existsSync(keyPath) && fs.existsSync(certPath) && fs.existsSync(caPath)) {
  httpsOptions = { https: { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), ca: fs.readFileSync(caPath) } };
  console.log('Game-Service: ✅ SSL-Zertifikate gefunden, starte mit HTTPS');
} else {
  console.warn('Game-Service: SSL-Zertifikate nicht gefunden, starte ohne HTTPS');
}

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
  ...httpsOptions,
});

export const io = new SocketIOServer(server.server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      const isAIService = socket.handshake.query.serviceType === 'AI';
      if (isAIService) {
        const roomId = socket.handshake.query.roomId as string;
        if (!roomId) {
          return next(new Error('AI service missing room ID'));
        }
        socket.user = {
          id: `AI-${roomId}`,
          nickname: 'AI',
          isService: true,
          isAI: true,
        };
        console.log(`[Auth] AI service authenticated for room: ${roomId}`);
        return next();
      }
      console.log('[Auth] No token provided');
      return next(new Error('Authentication error: No token provided'));
    }

    let decoded: AuthPayload= {} as AuthPayload;
    decoded.id = socket.request.headers['x-user-id']?.toString() as string;
    decoded.nickname = socket.request.headers['x-user-nickname']?.toString() as string;
    console.debug('id: ', decoded.id, 'nickname: ', decoded.nickname);

    socket.user = {
      id: decoded.id,
      nickname: decoded.nickname,
      isService: false,
      isAI: false,
    };
    console.log(`[Auth] User ${socket.user.nickname} authenticated successfully`);
    next();
  } catch (err) {
    console.error('[Auth] JWT verification error:', err);
    next(new Error('Authentication error: Invalid token'));
  }
});

registerIoHandlers(io);

//  === Error Logging ===
server.setErrorHandler((error, request, reply) => {
  console.log('Error occurred:', error);
  server.log.error(error);
  reply.status(500).send({ error: 'Internal Server Error' });
});

async function start() {
  server.register(tlsReloadPlugin, {
    certPath,
    keyPath,
    caPath,
    signal: 'SIGHUP',
    debounceMs: 300,
  });
  server.register(httpsAgent);
  await server.listen({ port: 3001, host: '0.0.0.0' });
  console.log('Server backend is listening: https://localhost:3001 adresinde çalışıyor');
}

start().catch((err) => {
  console.error('Error: Server initialization failed', err);
  process.exit(1);
});
