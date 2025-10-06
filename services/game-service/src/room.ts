import { Player, GameRoom, activeConnections, gameRooms, TournamentRoom, tournamentRooms } from './types/types';
import { io } from './server';
import { startGame, abortGame } from './game';
import { Socket } from 'socket.io';
import { PaddleMovePayload, CreateRoomPayload } from './types/types';
import { apiGatewayUpstream } from './server';
import { startTournament } from './tournament';
import fs from 'node:fs';
import path from 'path';

// Neu: Undici für TLS/Dispatcher
import { Agent as UndiciAgent, setGlobalDispatcher } from 'undici';
import { start } from 'node:repl';
import { clear } from 'node:console';

// === TLS / Custom CA für fetch ===
const certDir = process.env.CERT_DIR || path.join(__dirname, '../certs');
const caPath = path.join(certDir, 'ca.crt');

try {
  if (fs.existsSync(caPath)) {
    const vaultca = fs.readFileSync(caPath, 'utf8');
    // Globalen Dispatcher setzen – gilt für alle fetch()-Calls
    const dispatcher = new UndiciAgent({
      connect: {
        ca: vaultca, // eigene CA als PEM-String
      },
    });
    setGlobalDispatcher(dispatcher);
    console.log(`[TLS] Using custom CA for outgoing HTTPS via Undici dispatcher: ${caPath}`);
  } else {
    console.warn(`[TLS] CA file not found at ${caPath}. Outgoing HTTPS will use default trust store.`);
  }
} catch (e) {
  console.warn(`[TLS] Failed to initialize Undici dispatcher with CA ${caPath}:`, e);
}

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
        await fetch(`${apiGatewayUpstream}/api/ai`, {
          method: 'GET',
          headers: { roomid: roomId },
        });
      } catch (error) {
        console.error(`[Server] Error invoking AI service for room ${roomId}:`, error);
      }
    })();
  }
  else if (!payload.isRemote) {
    try {
      gameRooms[roomId].owner = player;
      gameRooms[roomId].owner.nickname = 'Player1';
      let player2: Player = {
        conn : socket,
        id : '123450',
        nickname : 'Player2',
        score : 0,
        paddleY : 250,
        roomId : roomId
      }
      
      gameRooms[roomId].guest = player2;
      console.log(`[Server] Both players assigned in local room ${roomId}, starting game between ${gameRooms[roomId].owner.nickname} and ${gameRooms[roomId].guest.nickname}`);
      startGame(gameRooms[roomId]);
    } catch (error) {
      console.error(`[Server] Error starting game in room ${gameRooms[roomId].id}:`, error);
      player.conn.emit('join_error', {
        message: 'Failed to start game',
      });
      player.roomId = undefined;
      gameRooms[roomId].guest = null;
      return;
    }
  }
}

export function handleCreateTournamentRoom(player: Player, payload: CreateRoomPayload['create_tournament_room']) {
  console.log(`[Server] handleCreateTournamentRoom called by player ${player.id}`);
  if (player.roomId) {
    console.log(`[Server] Player ${player.id} is already in a room`);
    player.conn.emit('create_error', {
      message: 'You are already in a room',
    });
    return;
  }
  const socket = player.conn;
  console.log(`[Server] Player ${player.nickname} is creating a TournamentRoom`);
  const roomId = 'T'+generateUniqueRoomId();
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
    return;
  }
  socket.join(roomId);
  player.roomId = roomId;
  ////emit
  player.conn.emit('tournament_room_created', {
    roomId: player.roomId,
    players: [{id: player.id, nickname: player.nickname}],
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

  room.players.push(player);
  console.log(`Player ${player.nickname} joining TournamentRoom ${roomId}`);

  const cleanPlayers = room.players.map(player => ({
    id: player.id,
    nickname: player.nickname,
    isOwner: player.id === room.owner?.id
  }));

  if (!room.owner) {
    console.log(`Player ${player.nickname} joining TournamentRoom ${roomId} as owner`);
    room.owner = player;
    player.roomId = roomId;
    
    ////emit
    io.to(roomId).emit('joined_tournament_room', {
      roomId: room.id,
      message: `Player ${player.nickname} has joined the TournamentRoom as owner`,
      players: cleanPlayers,
      totalPlayers: cleanPlayers.length,
      success: true,
    });
    io.to(roomId).emit('tournament_player_joined', {
      roomId: room.id,
      message: `Player ${player.nickname} has joined the TournamentRoom as owner`,
      players: cleanPlayers,
      totalPlayers: cleanPlayers.length,
      success: true,
    });
    console.log(`[Server] Player ${player.id} joined TournamentRoom ${room.id} as owner`);
    return;
  }

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
    message: `Player ${player.nickname} has joined the TournamentRoom as owner`,
    players: cleanPlayers,
    totalPlayers: cleanPlayers.length,
    success: true,
  });
  console.log(`[Server] Player ${player.id} joined TournamentRoom ${room.id}`);
}

export function checkStartTournament(player: Player, roomId: string) {
  const room = tournamentRooms[roomId];
  if (!room) {
    player.conn.emit('join_error', {
      message: 'Room not found',
    });
    return;
  }
  if (room.owner?.id !== player.id) {
    player.conn.emit('join_error', {message: 'Only the owner can start the tournament',});
    return;
  }
  if (room.players.length < 3) {
    player.conn.emit('join_error', {message: 'At least 3 players are required to start the tournament',});
    return;
  }
  startTournament(roomId);
  // Owner vs Player2 starten
}

export function leaveTournamentRoom(player: Player, roomId: string) {
  const room = tournamentRooms[roomId];
  if (!room) {
    player.conn.emit('tournament_error', { message: 'Tournament not found' });
    return;
  }
  
  // Player aus der Liste entfernen
  room.players = room.players.filter(p => p.id !== player.id);
  
  // Wenn Owner verlässt, neuen Owner bestimmen
  if (room.owner?.id === player.id && room.players.length > 0) {
    room.owner = room.players[0];
    io.to(roomId).emit('tournament_owner_changed', {
      newOwner: room.owner.nickname
    });
  }
  
  player.roomId = undefined;
  player.conn.leave(roomId);
  
  // Update an alle senden
  broadcastTournamentUpdate(room);
  
  // Room löschen wenn leer
  if (room.players.length === 0) {
    delete tournamentRooms[roomId];
    console.log(`[Server] Tournament room ${roomId} deleted - no players left`);
  }
  
  console.log(`[Server] Player ${player.nickname} left tournament ${roomId}`);
}

function broadcastTournamentUpdate(room: TournamentRoom) {
  const playerData = room.players.map(p => ({
    id: p.id,
    nickname: p.nickname,
    isOwner: p.id === room.owner?.id
  }));
  
  io.to(room.id).emit('tournament_players_updated', {
    players: playerData,
    playerCount: room.players.length
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
