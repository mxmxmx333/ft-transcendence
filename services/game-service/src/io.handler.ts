import { Player, activeConnections } from './types/types';
import { handleCreateRoom, joinRoom, handleLeaveRoom, handleDisconnect } from './room';
import { io } from './server';

// io connection handler
io.on('connection', (socket) => {
  console.log(`[Socket] New connection from ${socket.id}`);
  const { id, nickname } = socket.user!;
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
  socket.on('paddel_move', (data: { yPos: number }) => {
    player!.paddleY = data.yPos;
  });
  socket.on('create_room', () => {
    console.log(`[Socket] Player ${player.id} creating room`);
    handleCreateRoom(player);
  });
  socket.on('join_room', (data: { roomId: string }) => {
    console.log(`[Socket] Player ${player.id} joining room ${data.roomId}`);
    joinRoom(player, data.roomId);
  });
  socket.on('leave_room', () => {
    handleLeaveRoom(socket);
  });
});
