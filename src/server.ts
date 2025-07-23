import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import websocketPlugin from '@fastify/websocket'; 
import path from 'path';
import dbConnector from './database/db';
import authPlugin from './plugins/auth';
import AuthService from './services/auth.service';
import AuthController from './controllers/auth.controller';

const server = fastify({ 
  logger: true,
  ignoreTrailingSlash: true
});


const activeConnections = new Map<string, WebSocket>();

interface SignupBody {
  nickname: string;
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

// Multiplayer Interfaces
interface Player {
    conn: WebSocket;
    id: string;
    nickname: string;
    score: number;
    paddleY: number;
    roomId?: string;
}

interface GameRoom {
    id: string;
    player1: Player;
    player2: Player | null;
    gameState: {
        ballX: number;
        ballY: number;
        ballVX: number;
        ballVY: number;
        lastUpdate: number;
    };
    isPrivate: boolean;
    gameLoop?: NodeJS.Timeout;
}

const gameRooms: Record<string, GameRoom> = {};
const waitingPlayers: Player[] = [];

async function start() {
  await server.register(dbConnector);
  
  await server.register(authPlugin);

await server.register(websocketPlugin, {
  options: { maxPayload: 1048576 } // 1MB
});
  await server.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/',
    wildcard: false
  });

  const authService = new AuthService(server);
  const authController = new AuthController(authService, server);

  server.post<{ Body: SignupBody }>(
    '/api/signup', 
    (request, reply) => authController.signup(request, reply)
  );

  server.post<{ Body: LoginBody }>(
    '/api/login',
    (request, reply) => authController.login(request, reply)
  );

server.post('/api/logout', async (req, reply) => {
  try {
    return reply.send({ success: true });
  } catch (err) {
    return reply.status(500).send({ error: 'Logout failed' });
  }
});
  server.get('/api/profile', async (req, reply) => {
    try {
      const decoded = await req.jwtVerify<{ id: string }>();
      const user = await authService.getUserById(Number(decoded.id));
      
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({
        nickname: user.nickname,
        email: user.email
      });
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

server.get('/ws', { websocket: true }, (connection, req) => {

  const socket = connection;
  
  const token = req.headers['sec-websocket-protocol'];
  if (!token) {
    socket?.close(1008, 'Unauthorized');
    return;
  }

  server.jwt.verify(token, async (err, decoded) => {
    if (err) {
      socket?.close(1008, 'Invalid token');
      return;
    }

    try {
      const user = await authService.getUserById(Number(decoded.id));
      if (!user) {
        socket?.close(1008, 'User not found');
        return;
      }

      const player: Player = {
  conn: socket,
  id: user?.id?.toString() || 'unknown',
  nickname: user?.nickname || 'Guest',
  score: 0,
  paddleY: 250
};
waitingPlayers.push(player);

      handlePlayerConnection(player);
      type WebSocketMessage = string | Buffer | ArrayBuffer | Buffer[];

      socket.on('message', (message: WebSocketMessage) => {
        try {
          const data = JSON.parse(message.toString());
          handleWebSocketMessage(socket, data);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });

      socket.on('close', () => {
        console.log(`Player ${player.id} disconnected`);
        handlePlayerConnection(player);
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      socket?.close(1008, 'Internal error');
    }
  });
});

  server.setNotFoundHandler((_, reply) => {
    reply.sendFile('index.html');
  });

  await server.listen({ port: 3000, host: '0.0.0.0' });
  console.log('Server http://localhost:3000 adresinde çalışıyor');
}

// Multiplayer Game Functions
function handlePlayerConnection(player: Player) {
  const url = new URL(`http://dummy${player.conn.url}`);
  const roomId = url.searchParams.get('room');
  
  if (roomId) {
    joinPrivateRoom(player, roomId);
  } else {
    addToMatchmaking(player);
  }
}

function joinPrivateRoom(player: Player, roomId: string) {
  const room = gameRooms[roomId];
  
  if (!room || room.player2 || !room.isPrivate) {
    player.conn.send(JSON.stringify({
      type: 'join_error',
      message: 'Room not available'
    }));
    return;
  }
  
  room.player2 = player;
  startGame(room);
}

function addToMatchmaking(player: Player) {
  if (waitingPlayers.length > 0) {
    const opponent = waitingPlayers.pop()!;
    const roomId = generateRoomId();
    
    const gameState = {
      ballX: 400,
      ballY: 300,
      ballVX: 5 * (Math.random() > 0.5 ? 1 : -1),
      ballVY: 3 * (Math.random() > 0.5 ? 1 : -1),
      lastUpdate: Date.now()
    };
    
    const room: GameRoom = {
      id: roomId,
      player1: opponent,
      player2: player,
      gameState,
      isPrivate: false
    };
    
    gameRooms[roomId] = room;
    startGame(room);
  } else {
    waitingPlayers.push(player);
    player.conn.send(JSON.stringify({
      type: 'waiting_for_opponent'
    }));
  }
}

function startGame(room: GameRoom) {
  if (!room.player2) return;

  if (room.gameLoop) {
    clearInterval(room.gameLoop);
  }

  console.log(`Starting game in room ${room.id}`);

  const startMessages = [
    {
      type: 'game_start',
      roomId: room.id,
      opponent: room.player2.nickname,
      isPlayer1: true,
      ballX: room.gameState.ballX,
      ballY: room.gameState.ballY
    },
    {
      type: 'game_start',
      roomId: room.id,
      opponent: room.player1.nickname,
      isPlayer1: false,
      ballX: room.gameState.ballX,
      ballY: room.gameState.ballY
    }
  ];

  [room.player1, room.player2].forEach((player, index) => {
    player.conn.send(JSON.stringify(startMessages[index]));
  });

  room.gameLoop = setInterval(() => {
    if (!gameRooms[room.id]) {
      clearInterval(room.gameLoop);
      return;
    }
    updateGameState(room);
    broadcastGameState(room);
  }, 1000 / 60);
}

function updateGameState(room: GameRoom) {
  const { gameState } = room;
  const now = Date.now();
  const deltaTime = (now - gameState.lastUpdate) / 1000;
  gameState.lastUpdate = now;
  
  gameState.ballX += gameState.ballVX * deltaTime * 60;
  gameState.ballY += gameState.ballVY * deltaTime * 60;
  
  handleCollisions(room);
  
  if (gameState.ballX <= 0) {
    room.player2!.score++;
    resetBall(room, false);
  } else if (gameState.ballX >= 800) {
    room.player1.score++;
    resetBall(room, true);
  }
  
  if (room.player1.score >= 10 || room.player2!.score >= 10) {
    endGame(room);
  }
}

function handleCollisions(room: GameRoom) {
  const { gameState } = room;
  const ballRadius = 10;
  const paddleHeight = 100;
  const paddleWidth = 15;
  
  if (gameState.ballY - ballRadius <= 0 || gameState.ballY + ballRadius >= 600) {
    gameState.ballVY *= -1;
  }
  
  // Player 1 paddle (left)
  if (gameState.ballX - ballRadius <= 30 && 
      gameState.ballX - ballRadius >= 15 &&
      gameState.ballY >= room.player1.paddleY && 
      gameState.ballY <= room.player1.paddleY + paddleHeight) {
    gameState.ballVX = Math.abs(gameState.ballVX) * 1.05;
    gameState.ballVY += (Math.random() * 2 - 1);
  }
  
  // Player 2 paddle (right)
  if (gameState.ballX + ballRadius >= 785 && 
      gameState.ballX + ballRadius <= 800 &&
      gameState.ballY >= room.player2!.paddleY && 
      gameState.ballY <= room.player2!.paddleY + paddleHeight) {
    gameState.ballVX = -Math.abs(gameState.ballVX) * 1.05;
    gameState.ballVY += (Math.random() * 2 - 1);
  }
}

function resetBall(room: GameRoom, scoredByPlayer1: boolean) {
  room.gameState.ballX = 400;
  room.gameState.ballY = 300;
  room.gameState.ballVX = 5 * (scoredByPlayer1 ? 1 : -1);
  room.gameState.ballVY = 3 * (Math.random() > 0.5 ? 1 : -1);
  room.gameState.lastUpdate = Date.now();
}

function endGame(room: GameRoom) {
  const winner = room.player1.score >= 10 ? 'player1' : 'player2';
  
  room.player1.conn.send(JSON.stringify({
    type: 'game_over',
    winner,
    finalScore: {
      player1: room.player1.score,
      player2: room.player2!.score
    }
  }));
  
  room.player2!.conn.send(JSON.stringify({
    type: 'game_over',
    winner,
    finalScore: {
      player1: room.player1.score,
      player2: room.player2!.score
    }
  }));
  
  delete gameRooms[room.id];
}

function broadcastGameState(room: GameRoom) {
  const gameState = {
    type: 'game_state',
    ballX: room.gameState.ballX,
    ballY: room.gameState.ballY,
    paddle1Y: room.player1.paddleY,
    paddle2Y: room.player2?.paddleY || 250,
    player1Score: room.player1.score,
    player2Score: room.player2?.score || 0
  };
   try {
    const state = { /*...*/ };
    room.player1.conn.send(JSON.stringify(state));
    if (room.player2) room.player2.conn.send(JSON.stringify(state));
  } catch (e) {
    console.error("Broadcast error:", e);
    endGame(room);
  }
  room.player1.conn.send(JSON.stringify(gameState));
  if (room.player2) {
    room.player2.conn.send(JSON.stringify(gameState));
  }
}

function handleWebSocketMessage(socket: WebSocket, data: any) {
  console.log("[Server] Received message:", data);
  
  const { player, room } = findPlayerAndRoom(socket);
  console.log(`[Server] Found player: ${player?.id}, room: ${room?.id}`);

  switch (data.type) {
    case 'paddle_move':
      console.log(`[Server] Paddle move from player ${player?.id}`);
      if (player) player.paddleY = data.yPos;
      break;
      
    case 'create_room':
      console.log("[Server] Create room request received");
      if (player) handleCreateRoom(player);
      break;
      
    case 'join_room':
      console.log(`[Server] Join room request for room ${data.roomId}`);
      if (player) handleJoinRoom(player, data.roomId);
      break;
      
    default:
      console.warn('[Server] Unknown message type:', data.type);
  }
}

function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function findPlayerAndRoom(socket: WebSocket): { player: Player | null, room: GameRoom | null } {
  for (const roomId in gameRooms) {
    const room = gameRooms[roomId];
    if (room.player1.conn === socket) {
      return { player: room.player1, room };
    }
    if (room.player2 && room.player2.conn === socket) {
      return { player: room.player2, room };
    }
  }
  
  const waitingPlayer = waitingPlayers.find(p => p.conn === socket);
  if (waitingPlayer) {
    return { player: waitingPlayer, room: null };
  }
  
  return { player: null, room: null };
}

function handleCreateRoom(player: Player) {
  console.log(`[Server] handleCreateRoom called by player ${player.id}`);
  
  try {
    const roomId = generateRoomId();
    console.log(`[Server] Creating room ${roomId}`);

    const gameState = {
      ballX: 400,
      ballY: 300,
      ballVX: 5 * (Math.random() > 0.5 ? 1 : -1),
      ballVY: 3 * (Math.random() > 0.5 ? 1 : -1),
      lastUpdate: Date.now()
    };
    
    const room: GameRoom = {
      id: roomId,
      player1: player,
      player2: null,
      gameState,
      isPrivate: true
    };
    
    gameRooms[roomId] = room;
    console.log(`[Server] Room ${roomId} created, sending response`);

    const response = {
      type: 'room_created',
      roomId,
      success: true
    };
    
    console.log("[Server] Sending response:", response);
    player.conn.send(JSON.stringify(response));
    
  } catch (error) {
    console.error('[Server] Error in handleCreateRoom:', error);
    
    const errorResponse = {
      type: 'error',
      message: 'Failed to create room',
      error: error
    };
    
    player.conn.send(JSON.stringify(errorResponse));
  }
}

function handleJoinRoom(player: Player, roomId: string) {
  const { room: currentRoom } = findPlayerAndRoom(player.conn);
  if (currentRoom && currentRoom.id !== roomId) {
    cleanupRoom(currentRoom);
  }

  const targetRoom = gameRooms[roomId];
  if (!targetRoom || targetRoom.player2) {
    player.conn.send(JSON.stringify({
      type: 'join_error',
      message: 'Room not available'
    }));
    return;
  }

  targetRoom.player2 = player;
  player.roomId = roomId;

  startGame(targetRoom);
}
function cleanupRoom(room: GameRoom) {
  if (room.gameLoop) {
    clearInterval(room.gameLoop);
    room.gameLoop = undefined;
  }
  
  [room.player1, room.player2].forEach(player => {
    if (player) {
      try {
        player.conn.send(JSON.stringify({
          type: 'room_terminated',
          reason: 'Player switched rooms'
        }));
      } catch (e) {
        console.error('Error sending termination message:', e);
      }
    }
  });

  delete gameRooms[room.id];
}
start().catch(err => {
  console.error('Sunucu başlatma hatası:', err);
  process.exit(1);
});