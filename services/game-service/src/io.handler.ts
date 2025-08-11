import { Player, activeConnections } from './types/types';
import { handleCreateRoom, joinRoom, handleLeaveRoom, handleDisconnect } from './room';
import { io } from './server';

// io connection handler
io.on('connection', (socket) => {
  console.log(
    `[Socket] New connection from ${socket.id} by user ${socket.user?.nickname || 'unknown'}`
  );

  // socket.user kontrolü ekleyelim
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

  socket.on('paddle_move', (data: { yPos: number }) => {
    if (!data || typeof data.yPos !== 'number') {
      console.error(`[Socket] Invalid paddle_move data from ${player.id} in room ${player.roomId}`);
      return;
    }
    console.log(
      `[Socket] Player ${player.id} paddle moved to ${data.yPos} in room ${player.roomId}`
    );
    player.paddleY = data.yPos;
    // Paddle pozisyonu güncellendiğinde oda bilgisini kontrol et
    if (player.roomId) {
      socket.to(player.roomId).emit('paddle_update', {
        playerId: player.id,
        yPos: data.yPos,
      });
    }
  });

  socket.on('create_room', () => {
    console.log(`[Socket] Player ${player.id} creating room`);
    handleCreateRoom(player);
    // Not: handleCreateRoom zaten room_created emit ediyor, tekrar etmeye gerek yok
  });

  socket.on('join_room', (data: { roomId: string }) => {
    if (!data || !data.roomId) {
      console.error(`[Socket] Invalid join_room data from ${player.id}`);
      socket.emit('join_error', { message: 'Invalid room ID' });
      return;
    }

    console.log(`[Socket] Player ${player.id} joining room ${data.roomId}`);
    joinRoom(player, data.roomId);
    // Not: joinRoom zaten joined_room emit ediyor, tekrar etmeye gerek yok
  });

  socket.on('leave_room', () => {
    handleLeaveRoom(socket);
  });
});
