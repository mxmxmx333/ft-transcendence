import {
  Player,
  GameRoom,
  activeConnections,
  gameRooms,
  TournamentRoom,
  tournamentRooms,
} from './types/types';
import { checkForExistingRoom, io } from './server';
import { startGame, abortGame } from './game';
import { Socket } from 'socket.io';
import { CreateRoomPayload } from './types/types';
import { aiUpstream } from './server';
import { startTournament } from './tournament';
// === Room Management ===

function generateUniqueRoomId(): string {
  let id;
  do {
    id = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (gameRooms[id] || gameRooms[`T${id}`]); // Prüft, ob ID schon existiert
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
  const hasRoom = checkForExistingRoom(player.id);
  if (hasRoom) {
    console.log(`[Auth] User ${socket.user.nickname} already has an active connection`);
    return socket.emit('create_error', {
      message: 'You are already in an active Room, and therefore cannot create a new room. Your current RoomId: ' + hasRoom,
    });
  }
  console.log(`[Server] Player ${player.nickname} is creating a room`);
  const roomId = generateUniqueRoomId();
  console.log(`[Server] Player ${player.nickname} creating room ${roomId}...`);
  try {
    const room: GameRoom = {
      id: roomId,
      gameType: payload.isSinglePlayer ? 'single' : payload.isRemote ? 'remote' : 'local',
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
    socket.leave(roomId);
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
    (async () => {
      try {
        // Node 18+: globalThis.fetch vorhanden – verwendet den globalen Undici-Dispatcher (mit CA)
        await fetch(`${aiUpstream}/api/ai`, {
          method: 'GET',
          headers: { roomid: roomId },
        });
      } catch (error) {
        console.error(`[Server] Error invoking AI service for room ${roomId}:`, error);
        player.conn.emit('create_error', {
          message: 'Failed to start AI opponent',
        });
        abortGame(gameRooms[roomId]);
        deleteRoom(roomId);
        return;
      }
    })();
  } else if (!payload.isRemote) {
    try {
      gameRooms[roomId].owner = player;
      gameRooms[roomId].owner.nickname = 'Player1';
      let player2: Player = {
        conn: socket,
        id: '123450',
        nickname: 'Player2',
        score: 0,
        paddleY: 250,
        roomId: roomId,
      };

      gameRooms[roomId].guest = player2;
      console.log(
        `[Server] Both players assigned in local room ${roomId}, starting game between ${gameRooms[roomId].owner.nickname} and ${gameRooms[roomId].guest.nickname}`
      );
      startGame(gameRooms[roomId]);
    } catch (error) {
      console.error(`[Server] Error starting game in room ${gameRooms[roomId].id}:`, error);
      player.conn.emit('create_error', {
        message: 'Failed to start game',
      });
      player.roomId = undefined;
      gameRooms[roomId].guest = null;
      return;
    }
  }
}

export function handleCreateTournamentRoom(
  player: Player,
  payload: CreateRoomPayload['create_tournament_room']
) {
  console.log(`[Server] handleCreateTournamentRoom called by player ${player.id}`);
  if (player.roomId) {
    console.log(`[Server] Player ${player.id} is already in a room`);
    player.conn.emit('create_error', {
      message: 'You are already in a room',
    });
    return;
  }
  const socket = player.conn;
  const hasRoom = checkForExistingRoom(player.id);
  if (hasRoom) {
    console.log(`[Auth] User ${socket.user.nickname} already has an active connection`);
    return socket.emit('create_error', {
      message: 'You are already in an active Room, and therefore cannot create a new room. Your current RoomId: ' + hasRoom,
    });
  }
  console.log(`[Server] Player ${player.nickname} is creating a TournamentRoom`);
  const roomId = 'T' + generateUniqueRoomId();
  console.log(`[Server] Player ${player.nickname} creating room ${roomId}...`);
  try {
    const room: TournamentRoom = {
      id: roomId,
      owner: player,
      players: [player],
      lostPlayers: [],
      lastWinner: null,
      matchCount: 0,
    };
    tournamentRooms[roomId] = room;
    socket.room = room;
    console.log(`[Server] Tournament Room ${roomId} created successfully`);
  } catch (error) {
    if (tournamentRooms[roomId]) {
      delete tournamentRooms[roomId];
    }
    console.error(`[Server] Error creating TournamentRoom for player ${player.id}:`, error);
    player.conn.emit('create_error', {
      message: 'Failed to create room',
    });
    socket.leave(roomId);
    return;
  }
  socket.join(roomId);
  player.roomId = roomId;
  player.conn.emit('tournament_room_created', {
    roomId: player.roomId,
    players: [{ id: player.id, nickname: player.nickname }],
    owner: tournamentRooms[roomId].owner?.nickname,
    success: true,
  });
}

export function joinTournamentRoom(player: Player, roomId: string) {
  const room = tournamentRooms[roomId];
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

  if (room.players.length >= 5) {
    player.conn.emit('join_error', {
      message: 'TournamentRoom is full',
    });
    return;
  }
  const socker = player.conn;
  const hasRoom = checkForExistingRoom(player.id);
  if (hasRoom) {
    console.log(`[Auth] User ${socker.user.nickname} already has an active connection`);
    return socker.emit('join_error', {
      message: 'You already are already in an active Room, and therefore cannot join a new room. Your current RoomId: ' + hasRoom,
    });
  }
  room.players.push(player);
  console.log(`Player ${player.nickname} joining TournamentRoom ${roomId}`);

  const cleanPlayers = room.players.map((player) => ({
    id: player.id,
    nickname: player.nickname,
  }));

  player.roomId = roomId;
  player.conn.join(roomId);
  player.conn.room = room;
  io.to(roomId).emit('joined_tournament_room', {
    roomId: room.id,
    message: `Player ${player.nickname} has joined the TournamentRoom`,
    players: cleanPlayers,
    totalPlayers: cleanPlayers.length,
    success: true,
  });
  io.to(roomId).emit('tournament_player_joined', {
    roomId: room.id,
    message: `Player ${player.nickname} has joined the TournamentRoom`,
    players: cleanPlayers,
    totalPlayers: cleanPlayers.length,
    success: true,
  });
  console.log(`[Server] Player ${player.id} joined TournamentRoom ${room.id}`);
}

export function checkStartTournament(player: Player, roomId: string) {
  const room = tournamentRooms[roomId];
  if (!room) {
    player.conn.emit('room_error', {
      message: 'Room not found',
    });
    return;
  }
  if (room.players.length < 3) {
    player.conn.emit('room_error', {
      message: 'At least 3 players are required to start the tournament',
    });
    return;
  }
  startTournament(roomId);
}

export function leaveTournamentRoom(player: Player, roomId: string) {
  const room = tournamentRooms[roomId];
  if (!room) {
    player.conn.emit('room_error', { message: 'Tournament not found' });
    return;
  }

  // Player aus der Liste entfernen
  room.players = room.players.filter((p) => p.id !== player.id);
  player.roomId = undefined;
  player.conn.leave(roomId);

  // Update an alle senden
  if (room.players.length > 0) {
    broadcastTournamentUpdate(room);
  }

  // Room löschen wenn leer
  if (room.players.length === 0) {
    abortGame(room as any);
    deleteRoom(roomId);
    console.log(`[Server] Tournament room ${roomId} deleted - no players left`);
  } else if (room.players.length < 3 && room.gameLoop) {
    io.to(roomId).emit('room_error', {
      message: 'Tournament aborted - not enough players remaining',
    });
    abortGame(room as any);
    deleteRoom(roomId);
    console.log(`[Server] Tournament ${roomId} aborted - insufficient players after disconnect`);
  }
  console.log(`[Server] Player ${player.nickname} left tournament ${roomId}`);
}

function broadcastTournamentUpdate(room: TournamentRoom) {
  const playerData = room.players.map((p) => ({
    id: p.id,
    nickname: p.nickname,
  }));

  io.to(room.id).emit('tournament_players_updated', {
    players: playerData,
    playerCount: room.players.length,
  });
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
  if (room.owner.id === player.id) {
    player.conn.emit('join_error', {
      message: 'You are not allowed to play against yourself',
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
    abortGame(room);
    deleteRoom(roomId);
    player.roomId = undefined;
    room.guest = null;
    return;
  }
}

export function handleLeaveRoom(socket: Socket) {
  if (!socket.room) return;
  const player = socket.player;
  if (!player || !player.roomId) return;

  const room = gameRooms[player.roomId];
  if (!room) return;
  abortGame(room);
  const roomId = player.roomId;
  console.log(`[Socket] Player ${player.id} leaving room ${room.id}`);
  deleteRoom(roomId);
  socket.leave(roomId);
  return;
}

export function handleDisconnect(player: Player) {
  console.log(`[Server] Player ${player.id} disconnected`);
  if (player.roomId && tournamentRooms[player.roomId]) {
    leaveTournamentRoom(player, player.roomId);
  }
  if (player.roomId && gameRooms[player.roomId]) {
    handleLeaveRoom(player.conn);
  }
  activeConnections.delete(player.conn.id);
}

export function deleteRoom(roomId: string) {
  deleteTournamentRoom(roomId);
  const room = gameRooms[roomId];
  if (!room) {
    return;
  }
  if (room.owner) {
    room.owner.conn.leave(roomId);
    room.owner.roomId = undefined;
  }
  if (room.guest) {
    room.guest.conn.leave(roomId);
    room.guest.roomId = undefined;
  }
  delete gameRooms[roomId];
  console.log(`[Server] Room ${roomId} deleted`);
}

export function deleteTournamentRoom(roomId: string) {
  const room = tournamentRooms[roomId];
  if (!room) {
    return;
  }
  room.players.forEach((player) => {
    player.roomId = undefined;
    player.conn.leave(roomId);
  });
  room.lostPlayers.forEach((player) => {
    player.roomId = undefined;
    player.conn.leave(roomId);
  });
  room.lastWinner?.conn.leave(roomId);
  if (room.lastWinner) room.lastWinner.roomId = undefined;
  room.owner?.conn.leave(roomId);
  if (room.owner) room.owner.roomId = undefined;
  room.guest?.conn.leave(roomId);
  if (room.guest) room.guest.roomId = undefined;

  delete tournamentRooms[roomId];
  const roomg = gameRooms[roomId];
  if (roomg) delete gameRooms[roomId];
  console.log(`[Server] Tournament Room ${roomId} deleted`);
}
