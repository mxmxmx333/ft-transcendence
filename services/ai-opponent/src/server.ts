import Fastify, { FastifyInstance } from 'fastify';
import * as dotenv from 'dotenv';
import { SocketManager } from './socketManager';
import { PongGame } from './game';

class AIServerClass {
  private server?: FastifyInstance;
 // Dictionary mit roomId als Key und AI-Instanz-Daten als Value
  private aiInstances = new Map<string, {
    socketManager: SocketManager;
    game: PongGame;
    createdAt: number;
  }>();

  constructor() {
    // Constructor ist optional, kann leer bleiben
  }

  // AI-Instanz für einen Room erstellen
  createAIInstance(roomId: string): { socketManager: SocketManager; game: PongGame } | null {
    // Prüfe ob bereits eine Instanz existiert
    if (this.aiInstances.has(roomId)) {
      console.log(`[AIServer] AI instance already exists for room: ${roomId}`);
      return this.aiInstances.get(roomId) || null;
    }
  
    console.log(`[AIServer] Creating new AI instance for room: ${roomId}`);
  
    // Erstelle neue isolierte Instanz (KEIN Singleton!)
    const socketManager = new SocketManager(roomId); // Muss Constructor angepasst werden
    const game = new PongGame(socketManager);
    
    socketManager.setGameInstance(game);
  
    // Speichere Instanz
    const instanceData = {
      socketManager,
      game,
      createdAt: Date.now()
    };
    
    this.aiInstances.set(roomId, instanceData);
  
    // Setup cleanup wenn Spiel endet
    game.onGameEnd = () => {
      this.removeAIInstance(roomId);
    };
  
    return instanceData;
  }
  
  // AI-Instanz entfernen
  removeAIInstance(roomId: string): boolean {
    const instance = this.aiInstances.get(roomId);
    
    if (!instance) {
      console.log(`[AIServer] No AI instance found for room: ${roomId}`);
      return false;
    }
  
    console.log(`[AIServer] Removing AI instance for room: ${roomId}`);
  
    // Cleanup
    try {
      instance.game.stop?.(); // Falls stop() Methode existiert
      instance.socketManager.disconnect?.(); // Falls disconnect() Methode existiert
    } catch (error) {
      console.error(`[AIServer] Error during cleanup for room ${roomId}:`, error);
    }
  
    // Aus Dictionary entfernen
    this.aiInstances.delete(roomId);
    return true;
  }
  // Alle aktiven AI-Instanzen abrufen
  getActiveInstances(): string[] {
   return Array.from(this.aiInstances.keys());
  }
  
  // Statistiken
  getStats() {
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
  
  // Cleanup alte Instanzen (optional)
  cleanupOldInstances(maxAgeMs: number = 30 * 60 * 1000) { // 30 Minuten
   const now = Date.now();
   const toRemove: string[] = [];
  
   this.aiInstances.forEach((instance, roomId) => {
     if (now - instance.createdAt > maxAgeMs) {
       toRemove.push(roomId);
     }
   });
  
   toRemove.forEach(roomId => {
     console.log(`[AIServer] Cleaning up old instance for room: ${roomId}`);
     this.removeAIInstance(roomId);
   });
  
   return toRemove.length;
  }
}

const aiServer = new AIServerClass();

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

// DELETED:
// function startSocketConnection(roomId: string) {
//   const socketManager = SocketManager.getInstance();
//   socketManager.connect();
//   socketManager.getSocket()?.emit('join_room', { roomId });
//   socketManager.onGameStart = (payload) => {
//     console.log('Game started with payload:', payload);
//   };
// }

async function start() {
  const server = await buildServer();

  server.get('/api/ai', async (request, reply) => {
    console.log('Received request at /api/ai/');
    const roomId = request.headers['roomid'];
    if (!roomId || typeof roomId !== 'string') {
      reply.status(400).send({ error: 'Missing or invalid roomId header' });
      return;
    }

    try{
      const instance = aiServer.createAIInstance(roomId);

      if (!instance) {
        reply.status(500).send({ error: 'Failed to create AI instance' });
        return;
      }

      instance.socketManager.connect();
      instance.socketManager.getSocket()?.emit('join_room', { roomId });

      return {message: `AI opponent ready for room ${roomId}`, roomId, timestamp: new Date().toISOString()};
    }
    catch (error) {
      console.error(`Error creating AI instance for room ${roomId}:`, error);
      reply.status(500).send({ error: 'Internal server error' });
      return;
    }
  });
  //   const socketManager = SocketManager.getInstance();
  
  //   const game = new PongGame(socketManager);
  //   socketManager.setGameInstance(game);
  //   startSocketConnection(roomId);
  //   return { message: 'Hello from AI Opponent!' };
  // });
  server.get('/api/health', async (request, reply) => {
    return { status: 'ok', ...aiServer.getStats() };
  });
  server.delete('/api/ai', async (request, reply) => {
    const roomId = request.headers['roomid'];
    if (!roomId || typeof roomId !== 'string') {
      reply.status(400).send({ error: 'Missing or invalid roomId header' });
      return;
    }
    const removed = aiServer.removeAIInstance(roomId);
    
    if (removed) {
      return { message: `AI instance for room ${roomId} removed` };
    } else {
      return reply.status(404).send({ error: `No AI instance found for room ${roomId}` });
    }
  });

  // Debug endpoint
  server.get('/api/ai/stats', async (request, reply) => {
    return aiServer.getStats();
  });

  // Cleanup timer (alle 10 Minuten)
  setInterval(() => {
    const cleaned = aiServer.cleanupOldInstances();
    if (cleaned > 0) {
      console.log(`[AIServer] Cleaned up ${cleaned} old instances`);
    }
  }, 10 * 60 * 1000);

  try {
    await server.listen({ port: 3003, host: '0.0.0.0' });
    server.log.info(`API Gateway running at http://localhost:3003`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
