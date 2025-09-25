import Fastify, { FastifyInstance } from 'fastify';
import * as dotenv from 'dotenv';
import { SocketManager } from './socketManager';
import { PongGame } from './game';
import { AIInstance } from './types';

// Constants
const DEFAULT_CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const DEFAULT_INSTANCE_MAX_AGE = 30 * 60 * 1000; // 30 minutes
const SERVER_PORT = 3003;
const SERVER_HOST = '0.0.0.0';

class AIServerClass {
  private readonly aiInstances = new Map<string, AIInstance>();

  constructor() {
    this.startCleanupTimer();
  }

  public createAIInstance(roomId: string): AIInstance | null {
    if (this.aiInstances.has(roomId)) {
      console.log(`[AIServer] AI instance already exists for room: ${roomId}`);
      return this.aiInstances.get(roomId) || null;
    }

    try {
      console.log(`[AIServer] Creating new AI instance for room: ${roomId}`);

      const socketManager = new SocketManager(roomId);
      const game = new PongGame(socketManager);
      
      socketManager.setGameInstance(game);

      const instanceData: AIInstance = {
        socketManager,
        game,
        createdAt: Date.now()
      };
      
      this.aiInstances.set(roomId, instanceData);

      // Setup cleanup when game ends
      game.onGameEnd = async () => {
        await this.removeAIInstance(roomId);
      };

      return instanceData;
    } catch (error) {
      console.error(`[AIServer] Error creating AI instance for room ${roomId}:`, error);
      return null;
    }
  }
  
  public async removeAIInstance(roomId: string): Promise<boolean> {
    const instance = this.aiInstances.get(roomId);
    
    if (!instance) {
      console.log(`[AIServer] No AI instance found for room: ${roomId}`);
      return false;
    }

    console.log(`[AIServer] Removing AI instance for room: ${roomId}`);

    try {
      // Save AI model before cleanup
      if (instance.game && typeof instance.game.getAISystem === 'function') {
        console.log(`[AIServer] Saving AI model for room: ${roomId}`);
        const aiSystem = instance.game.getAISystem();
        if (aiSystem && typeof aiSystem.cleanup === 'function') {
          await aiSystem.cleanup();
        }
      }

      if (typeof instance.game.stop === 'function') {
        instance.game.stop();
      }
      if (typeof instance.socketManager.disconnect === 'function') {
        instance.socketManager.disconnect();
      }
    } catch (error) {
      console.error(`[AIServer] Error during cleanup for room ${roomId}:`, error);
    } finally {
      this.aiInstances.delete(roomId);
    }

    return true;
  }
  public getActiveInstances(): string[] {
    return Array.from(this.aiInstances.keys());
  }
  
  public getStats() {
    return {
      activeInstances: this.aiInstances.size,
      rooms: Array.from(this.aiInstances.keys()),
      instances: Array.from(this.aiInstances.entries()).map(([roomId, instance]) => ({
        roomId,
        uptime: Date.now() - instance.createdAt,
        createdAt: new Date(instance.createdAt).toISOString()
      }))
    };
  }
  
  public async cleanupOldInstances(maxAgeMs: number = DEFAULT_INSTANCE_MAX_AGE): Promise<number> {
    const now = Date.now();
    const roomsToRemove: string[] = [];
  
    for (const [roomId, instance] of this.aiInstances) {
      if (now - instance.createdAt > maxAgeMs) {
        roomsToRemove.push(roomId);
      }
    }
  
    for (const roomId of roomsToRemove) {
      console.log(`[AIServer] Cleaning up old instance for room: ${roomId}`);
      await this.removeAIInstance(roomId);
    }
  
    return roomsToRemove.length;
  }

  private startCleanupTimer(): void {
    setInterval(async () => {
      const cleaned = await this.cleanupOldInstances();
      if (cleaned > 0) {
        console.log(`[AIServer] Cleaned up ${cleaned} old instances`);
      }
    }, DEFAULT_CLEANUP_INTERVAL);
  }
}

// Initialize environment
dotenv.config();

// Validate required environment variables
export const apiGatewayUpstream = process.env.API_GATEWAY_UPSTREAM || 'http://localhost:3000';
console.log(`[Server] Using API Gateway: ${apiGatewayUpstream}`);

const isDevelopment = process.env.NODE_ENV === 'development';
const aiServer = new AIServerClass();

async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: 'debug',
      ...(isDevelopment && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: false,
          },
        },
      }),
    },
  });

  return server;
}

async function start() {
  const server = await buildServer();

  server.get('/api/ai', async (request, reply) => {
    console.log('[Server] Received request at /api/ai/');
    
    const roomId = request.headers['roomid'];
    if (!roomId || typeof roomId !== 'string') {
      return reply.status(400).send({ error: 'Missing or invalid roomId header' });
    }

    try {
      const instance = aiServer.createAIInstance(roomId);
      if (!instance) {
        return reply.status(500).send({ error: 'Failed to create AI instance' });
      }

      // Connect and join room
      instance.socketManager.connect();
      
      const socket = instance.socketManager.getSocket();
      const joinRoomHandler = () => {
        socket?.emit('join_room', { roomId });
        console.log(`[Server] AI joining room ${roomId}`);
      };

      if (socket?.connected) {
        joinRoomHandler();
      } else {
        socket?.once('connect', joinRoomHandler);
      }

      return {
        message: `AI opponent ready for room ${roomId}`,
        roomId,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`[Server] Error creating AI instance for room ${roomId}:`, error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  server.get('/api/health', async () => {
    return { status: 'ok', ...aiServer.getStats() };
  });

  server.delete('/api/ai', async (request, reply) => {
    const roomId = request.headers['roomid'];
    if (!roomId || typeof roomId !== 'string') {
      return reply.status(400).send({ error: 'Missing or invalid roomId header' });
    }

    const removed = await aiServer.removeAIInstance(roomId);
    
    if (removed) {
      return { message: `AI instance for room ${roomId} removed` };
    } else {
      return reply.status(404).send({ error: `No AI instance found for room ${roomId}` });
    }
  });

  server.get('/api/ai/stats', async () => {
    return aiServer.getStats();
  });

  try {
    await server.listen({ port: SERVER_PORT, host: SERVER_HOST });
    server.log.info(`AI Opponent Service running at http://localhost:${SERVER_PORT}`);
  } catch (error) {
    server.log.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
