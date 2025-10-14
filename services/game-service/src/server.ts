import fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { registerIoHandlers } from './io.handler';
import dotenv from 'dotenv';
import { AuthPayload, gameRooms, tournamentRooms } from './types/types';
import fs from 'fs';
import path from 'path';
import tlsReloadPlugin from './tls-reload';
import httpsAgent from './https-client-plugin';
import { activeConnections } from './types/types';


dotenv.config();
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
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

export const authUserServiceUpstream = process.env.AUTH_USER_SERVICE_UPSTREAM;
if (!authUserServiceUpstream) {
  throw new Error('AUTH_USER_SERVICE_UPSTREAM environment variable is not set');
}

export function checkForExistingRoom(userId: string) {
  const rooms = gameRooms;
 
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.owner?.id === userId || room.guest?.id === userId) {
      return roomId;
    }
  }
  const tRooms = tournamentRooms;
  for (const roomId in tRooms) {
    const room = tRooms[roomId];
    if (room.owner?.id === userId || room.guest?.id === userId) {
      return roomId;
    }
    for (const player of room.players) {
      if (player.id === userId) {
        return roomId;
      }
    }
  }
  return null;
}

const keyPath = path.join(certDir, 'server.key');
const certPath = path.join(certDir, 'server.crt');
const caPath = path.join(certDir, 'ca.crt');
let httpsOptions: Record<string, any> = {};
if (fs.existsSync(keyPath) && fs.existsSync(certPath) && fs.existsSync(caPath)) {
  httpsOptions = {
    https: {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      ca: fs.readFileSync(caPath),
    },
  };
  console.log('Game-Service: SSL-Zertifikate gefunden, starte mit HTTPS');
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
        console.debug(`[Auth] AI service authenticated for room: ${roomId}`);
        return next();
      }
      console.debug('[Auth] No token provided');
      return next(new Error('Authentication error: No token provided'));
    }

    let decoded: AuthPayload = {} as AuthPayload;
    decoded.id = socket.request.headers['x-user-id']?.toString() as string;
    decoded.nickname = socket.request.headers['x-user-nickname']?.toString() as string;
    console.debug('id: ', decoded.id, 'nickname: ', decoded.nickname);

    socket.user = {
      id: decoded.id,
      nickname: decoded.nickname,
      isService: false,
      isAI: false,
    };
    console.debug(`[Auth] User ${socket.user.nickname} authenticated successfully`);
    next();
  } catch (err) {
    console.warn('[Auth] JWT verification error:', err);
    next(new Error('Authentication error: Invalid token'));
  }
});

registerIoHandlers(io);

//  === Error Logging ===
server.setErrorHandler((error, request, reply) => {
  console.error('Request error:', error);
  server.log.error(error);

  if (error.validation) return reply.status(400).send({error: 'Invalid request data'});
  if (error.statusCode == 401) return reply.status(401).send({error: 'Unauthorized'});
  if (error.statusCode == 404) return reply.status(404).send({error: 'Not found'});
  reply.status(400).send({ error: 'Request failed' });
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

// --- Start Server ---
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
  console.debug('Server backend is listening');
}

start().catch((err) => {
  console.error('Error: Server initialization failed', err);
  process.exit(1);
});
