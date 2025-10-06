import { Player, activeConnections } from './types/types';
import { handleCreateRoom, joinRoom, handleLeaveRoom, handleDisconnect, handleCreateTournamentRoom, joinTournamentRoom, checkStartTournament, leaveTournamentRoom } from './room';
import type { Server, Socket } from 'socket.io';
import type { PaddleMovePayload, CreateRoomPayload, GameRoom } from './types/types';

export function registerIoHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(
      `[Socket] New connection from ${socket.id} by user ${socket.user?.nickname || 'unknown'}`
    );

    if (!socket.user) {
      console.error(`[Socket] No user data found for socket ${socket.id}`);
      socket.disconnect();
      return;
    }

    const { id, nickname } = socket.user;
    const player: Player = {
      conn: socket,
      id,
      nickname,
      score: 0,
      paddleY: 250,
    };
    socket.player = player;
    activeConnections.set(socket.id, socket);

    socket.on('disconnect', () => {
      console.log(`[Socket] Player ${player.id} disconnected`);
      handleDisconnect(player);
    });

    socket.on('paddle_move', (payload: PaddleMovePayload) => {
      try {
        if (!socket.room) {
          console.error(`[Socket] Socket ${socket.id} has no room assigned`);
          return;
        }

        let gameRoom: GameRoom | null = null;

        if (socket.room.gameRoom) {
          gameRoom = socket.room.gameRoom;
          console.log(`[Socket] Found gameRoom for socket ${socket.id} in tournamentRoom ${socket.room.id}`);
        }

        else if ('gameState' in socket.room) {
          gameRoom = socket.room as GameRoom;
          console.log(`[Socket] Found gameRoom for socket ${socket.id} in regular room ${socket.room.id}`);
        }
        else {
          console.error(`[Socket] Socket ${socket.id} room is neither a gameRoom nor a tournamentRoom`);
          return;
        }

        if (!gameRoom) {
          console.error(`[Socket] No gameRoom found for socket ${socket.id}`);
          return;
        }

        if (socket === gameRoom.owner?.conn) {
          gameRoom.ownerMovement = payload.moveP1;
          if (gameRoom.gameType === 'local') {
            gameRoom.guestMovement = payload.moveP2;
          }
          console.debug(`[Socket] Owner paddle move: ${payload.moveP1}`);
        } else if (socket === gameRoom.guest?.conn) {
          gameRoom.guestMovement = payload.moveP2;
          console.debug(`[Socket] Guest paddle move: ${payload.moveP2}`);
        } else {
          console.log(`[Socket] Socket ${socket.id} ${socket.player.nickname} is neither owner nor guest in game room ${gameRoom.id}`);
        }

      } catch (error) {
        console.error('[Socket] Error in paddle_move handler:', error);
      }
    });

    socket.on('create_tournament_room', (payload: CreateRoomPayload['create_tournament_room']) => {
      console.log(`[Socket] Player ${player.id} creating tournament room`);
      handleCreateTournamentRoom(player, payload);
    });

    socket.on('join_tournament_room', (data: { roomId: string }) => {
      if (!data || !data.roomId) {
        console.error(`[Socket] Invalid join_tournament_room data from ${player.id}`);
        socket.emit('join_error', { message: 'Invalid room ID' });
        return;
      }
      console.log(`[Socket] Player ${player.id} joining tournament room ${data.roomId}`);
      joinTournamentRoom(player, data.roomId);
    });

    socket.on('start_tournament', (data: { roomId: string }) => {
      if (!data || !data.roomId) {
        console.error(`[Socket] Invalid start_tournament data from ${player.id}`);
        socket.emit('join_error', { message: 'Invalid room ID' });
        return;
      }
      console.log(`[Socket] Player ${player.id} starting tournament in room ${data.roomId}`);
      checkStartTournament(player, data.roomId);
    });

    socket.on('leave_tournament', (data: { roomId: string }) => {
      if (!data || !data.roomId) {
        console.error(`[Socket] Invalid leave_tournament data from ${player.id}`);
        socket.emit('tournament_error', { message: 'Invalid room ID' });
        return;
      }
      console.log(`[Socket] Player ${player.id} leaving tournament ${data.roomId}`);
      leaveTournamentRoom(player, data.roomId);
    });

    socket.on('create_room', (payload: CreateRoomPayload['create_room']) => {
      console.log(`[Socket] Player ${player.id} creating room`);
      handleCreateRoom(player, payload);
    });

    socket.on('join_room', (data: { roomId: string }) => {
      if (!data || !data.roomId) {
        console.error(`[Socket] Invalid join_room data from ${player.id}`);
        socket.emit('join_error', { message: 'Invalid room ID' });
        return;
      }
      console.log(`[Socket] Player ${player.id} joining room ${data.roomId}`);
      joinRoom(player, data.roomId);
    });

    socket.on('leave_room', () => {
      handleLeaveRoom(socket);
    });
  });
}
