import { Player, GameRoom, activeConnections, gameRooms } from './types/types';
import { io } from './server';
import { startGame, abortGame } from './game';
import { Socket } from 'socket.io';
import { PaddleMovePayload, CreateRoomPayload } from './types/types';
import { apiGatewayUpstream } from './server';
// === Room Management ===

function generateUniqueRoomId(): string {
  let id;
  do {
    id = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (gameRooms[id]); // Prüft, ob ID schon existiert
  return id;
}

export function handleCreateRoom(player: Player, payload: CreateRoomPayload['create_room']) {
  console.log(`[Server] handleCreateRoom called by player ${player.id}`);
  if (player.roomId) {
    console.log(`[Server] Player ${player.id} is already in a room`);
    player.conn.emit('create_error', {
      message: 'You are already in a room',
    });
    return;
  }
  const socket = player.conn;
  console.log(`[Server] Player ${player.nickname} is creating a room`);
  const roomId = generateUniqueRoomId();
  console.log(`[Server] Player ${player.nickname} creating room ${roomId}...`);
  try {
    const room: GameRoom = {
      id: roomId,
      gameType: payload.isSinglePlayer ? 'single' : payload.isRemote ? 'remote' : 'multi',
      owner: player,
      guest: null,
      ownerMovement: 'none',
      guestMovement: 'none',
      gameState: {
        ballX: 400,
        ballY: 300,
        ballVX: 5 * (Math.random() > 0.5 ? 1 : -1),
        ballVY: 3 * (Math.random() > 0.5 ? 1 : -1),
        lastUpdate: Date.now(),
      },
      isPrivate: true,
    };
    gameRooms[roomId] = room;
    socket.room = room;
    console.log(`[Server] Room ${roomId} created successfully`);
  } catch (error) {
    if (gameRooms[roomId]) {
      delete gameRooms[roomId];
    }
    console.error(`[Server] Error creating room for player ${player.id}:`, error);
    player.conn.emit('create_error', {
      message: 'Failed to create room',
    });
    return;
  }
  socket.join(roomId);
  player.roomId = roomId;
  player.conn.emit('room_created', {
    roomId: player.roomId,
    success: true,
  });
  if (payload.isSinglePlayer) {
    console.log(`[Server] Starting single-player game in room ${roomId}`);
    try {
      fetch(`${apiGatewayUpstream}/api/ai`, {
        method: 'GET',
        headers: { 'roomid': roomId },
      })}
     
    catch (error) {
      console.error(`[Server] Error invoking AI service for room ${roomId}:`, error);
    }
  }
}

export function joinRoom(player: Player, roomId: string) {
  const room = gameRooms[roomId];
  if (player.roomId) {
    player.conn.emit('join_error', {
      message: 'You are already in a room',
    });
    return;
  }
  if (!room) {
    player.conn.emit('join_error', {
      message: 'Room not found',
    });
    return;
  }
  if (!room.owner) {
    console.log(`Player ${player.nickname} joining room ${roomId} as owner`);
    room.owner = player;
    player.roomId = roomId;
    player.conn.emit('joined_room', {
      roomId: room.id,
      message: `Player ${player.nickname} has joined the room as owner`,
      success: true,
    });
    console.log(`[Server] Player ${player.id} joined room ${room.id} as owner`);
    return;
  }
  if (room.guest) {
    player.conn.emit('join_error', {
      message: 'Room is already full',
    });
    return;
  }
  room.guest = player;
  console.log(`Player ${player.nickname} joining room ${roomId} as guest`);

  player.roomId = roomId;
  player.conn.join(roomId);
  player.conn.room = room;
  io.to(roomId).emit('joined_room', {
    roomId: room.id,
    message: `Player ${player.nickname} has joined the room`,
    success: true,
  });
  console.log(`[Server] Player ${player.id} joined room ${room.id}`);
  try {
    startGame(room);
  } catch (error) {
    console.error(`[Server] Error starting game in room ${room.id}:`, error);
    player.conn.emit('join_error', {
      message: 'Failed to start game',
    });
    player.roomId = undefined;
    room.guest = null;
    return;
  }
}

export function handleLeaveRoom(socket: Socket) {
  const player = socket.player;
  if (!player || !player.roomId) return;

  const room = gameRooms[player.roomId];
  if (!room) return;
  abortGame(room);
  const roomId = player.roomId;
  console.log(`[Socket] Player ${player.id} leaving room ${room.id}`);
  if (room.guest && room.guest.id === player.id) {
    room.guest = null;
  }
  if (room.owner && room.owner.id === player.id) {
    if (room.guest) {
      room.owner = room.guest;
      room.guest = null;
    } else {
      room.owner = null;
    }
  }
  socket.leave(roomId);
  player.roomId = undefined;
  if (room.owner === null) delete gameRooms[roomId];
}

export function handleDisconnect(player: Player) {
  console.log(`[Server] Player ${player.id} disconnected`);
  handleLeaveRoom(player.conn);
  activeConnections.delete(player.conn.id);
}
