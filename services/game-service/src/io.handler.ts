import { Player, activeConnections } from './types/types';
import { handleCreateRoom, joinRoom, handleLeaveRoom, handleDisconnect } from './room';
import type { Server, Socket } from 'socket.io';
import type { PaddleMovePayload, CreateRoomPayload } from './types/types';

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

    socket.on('paddle_move', (data: PaddleMovePayload) => {
      if (!data || !('moveP1' in data) || !('moveP2' in data)) {
        console.error(`[Socket] Invalid paddle_move data from ${player.id}`);
        return;
      }
      if (socket === socket.room.guest?.conn) {
        socket.room.guestMovement = data.moveP2 === 'none' ? 'stop' : data.moveP2;
      }
      else if (socket === socket.room.owner?.conn) {
        socket.room.ownerMovement = data.moveP1 === 'none' ? 'stop' : data.moveP1;
      }
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
