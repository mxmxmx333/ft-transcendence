import { GameRoom, gameRooms } from './types/types';
import { io } from './server';
import { handleLeaveRoom } from './room';
import type { GameStartPayload } from './types/types';

export function startGame(room: GameRoom) {
  if (!room.owner || !room.guest) {
    throw new Error('Cannot start game without both players');
  }

  if (room.gameLoop) {
    clearInterval(room.gameLoop);
  }

  console.log(`[Server] Starting game in room ${room.id}`);
  console.log(`[Server] Owner: ${room.owner.nickname} (${room.owner.id})`);
  console.log(`[Server] Guest: ${room.guest.nickname} (${room.guest.id})`);

  // Skorları sıfırla
  room.owner.score = 0;
  room.guest.score = 0;

  try {
    const gameStartPayload: GameStartPayload = {
      message: 'Game is starting',
      roomId: room.id,
      ballX: room.gameState.ballX,
      ballY: room.gameState.ballY,
      ballVX: room.gameState.ballVX,
      ballVY: room.gameState.ballVY,
      paddle1Y: room.owner.paddleY,
      paddle2Y: room.guest.paddleY,
      ownerScore: room.owner.score,
      guestScore: room.guest.score,
      owner: {
        id: room.owner.id,
        nickname: room.owner.nickname,
      },
      guest: {
        id: room.guest.id,
        nickname: room.guest.nickname,
      },
      isOwner: false, 
      success: true,
    };

    // Owner'a gönder (Player 1)
    room.owner.conn.emit('game_start', {
      ...gameStartPayload,
      isOwner: true,
    });

    // Guest'e gönder (Player 2)
    room.guest.conn.emit('game_start', {
      ...gameStartPayload,
      isOwner: false,
    });

    console.log(`[Server] Game start messages sent to both players`);
  } catch (err) {
    console.error(`[Server] Error sending game start messages:`, err);
    throw new Error(`[startGame] Failed to send game start message: ${err}`);
  }

  // Game loop başlat
  room.gameLoop = setInterval(() => {
    if (!gameRooms[room.id] || !room.owner || !room.guest) {
      console.log(`[Server] Game loop stopped for room ${room.id}`);
      clearInterval(room.gameLoop);
      room.gameLoop = undefined;
      return;
    }
    updateGameState(room);
    broadcastGameState(room);
  }, 1000 / 60);

  console.log(`[Server] Game loop started for room ${room.id}`);
}

function updateGameState(room: GameRoom) {
  const { gameState } = room;
  const now = Date.now();
  const deltaTime = (now - gameState.lastUpdate) / 1000;
  const paddleSpeed = 300; // px/s
  const moveSpeed = paddleSpeed * deltaTime;
  const paddleHeight = 100;
  gameState.lastUpdate = now;

  // handle player movements
  if (room.ownerMovement === 'up') {
    room.owner!.paddleY = Math.max(0, room.owner!.paddleY - moveSpeed);
  } else if (room.ownerMovement === 'down') {
    room.owner!.paddleY = Math.min(600 - paddleHeight, room.owner!.paddleY + moveSpeed);
  }

  if (room.guestMovement === 'up') {
    room.guest!.paddleY = Math.max(0, room.guest!.paddleY - moveSpeed);
  } else if (room.guestMovement === 'down') {
    room.guest!.paddleY = Math.min(600 - paddleHeight, room.guest!.paddleY + moveSpeed);
  }

  // Top hareketini güncelle
  gameState.ballX += gameState.ballVX * deltaTime * 60;
  gameState.ballY += gameState.ballVY * deltaTime * 60;

  // Çarpışmaları kontrol et
  handleCollisions(room);

  // Skor kontrolü
  let scoreChanged = false;

  if (gameState.ballX <= 0) {
    room.guest!.score++;
    resetBall(room, false);
    scoreChanged = true;
    // console.log(`[Server] Guest scored! Score: ${room.owner!.score} - ${room.guest!.score}`);
  } else if (gameState.ballX >= 800) {
    room.owner!.score++;
    resetBall(room, true);
    scoreChanged = true;
    // console.log(`[Server] Owner scored! Score: ${room.owner!.score} - ${room.guest!.score}`);
  }

  // Skor değiştiyse hemen broadcast et
  if (scoreChanged) {
    broadcastGameState(room);
  }

  // Oyun bitti mi kontrol et
  if (room.owner!.score >= 10 || room.guest!.score >= 10) {
  endGame(room);
  return; // Game loop'u durdur
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
  if (
    gameState.ballX - ballRadius <= 30 &&
    gameState.ballX - ballRadius >= 15 &&
    gameState.ballY >= room.owner!.paddleY &&
    gameState.ballY <= room.owner!.paddleY + paddleHeight
  ) {
    gameState.ballVX = Math.abs(gameState.ballVX) * 1.05;
    gameState.ballVY += Math.random() * 2 - 1;
  }

  // Player 2 paddle (right)
  if (
    gameState.ballX + ballRadius >= 785 &&
    gameState.ballX + ballRadius <= 800 &&
    gameState.ballY >= room.guest!.paddleY &&
    gameState.ballY <= room.guest!.paddleY + paddleHeight
  ) {
    gameState.ballVX = -Math.abs(gameState.ballVX) * 1.05;
    gameState.ballVY += Math.random() * 2 - 1;
  }
}

function resetBall(room: GameRoom, scoredByPlayer1: boolean) {
  room.gameState.ballX = 400;
  room.gameState.ballY = 300;
  room.gameState.ballVX = 5 * (scoredByPlayer1 ? 1 : -1);
  room.gameState.ballVY = 3 * (Math.random() > 0.5 ? 1 : -1);
  room.gameState.lastUpdate = Date.now();
}

export function abortGame(room: GameRoom) {
  if (!room.gameLoop) return;
  clearInterval(room.gameLoop);
  room.gameLoop = undefined;
  io.to(room.id).emit('game_aborted', {
    message: 'Game has been aborted',
  });
  console.log(`[Server] Game aborted for room ${room.id}`);
}

export function endGame(room: GameRoom) {
  const winner = room.owner!.score >= 10 ? 'owner' : 'guest';
  console.log(`[Server] Game ended in room ${room.id}. Winner: ${winner}`);

  const winnerNickname = winner === 'owner' ? room.owner!.nickname : room.guest!.nickname;

  io.to(room.id).emit('game_over', {
    winner,
    finalScore: {
      owner: room.owner!.score,
      guest: room.guest!.score,
    },
    message: `Game over! ${winnerNickname} wins!`,
  });

  if (room.gameLoop) {
    clearInterval(room.gameLoop);
    room.gameLoop = undefined;
  }

  console.log(`[Server] Game ended in room ${room.id}, winner: ${winnerNickname}`);

  // 5 saniye sonra oyuncuları lobby'e yönlendir
  setTimeout(() => {
    if (room.owner) {
      room.owner.roomId = undefined;
      room.owner.conn.leave(room.id);
    }
    if (room.guest) {
      room.guest.roomId = undefined;
      room.guest.conn.leave(room.id);
    }
    delete gameRooms[room.id];
    console.log(`[Server] Room ${room.id} cleaned up`);
  }, 5000);
}

function broadcastGameState(room: GameRoom) {
  const gameState = {
    ballX: room.gameState.ballX,
    ballY: room.gameState.ballY,
    ballVX: room.gameState.ballVX,
    ballVY: room.gameState.ballVY,
    paddle1Y: room.owner?.paddleY ?? 250,
    paddle2Y: room.guest?.paddleY ?? 250,
    ownerScore: room.owner?.score ?? 0,
    guestScore: room.guest?.score ?? 0,
  };

  try {
    io.to(room.id).emit('game_state', gameState);
  } catch (error) {
    console.log(`[Server] Game state broadcasted for room ${room.id}`);
  }
}
