import { GameRoom, gameRooms } from './types/types';
import { io } from './server';
import { handleLeaveRoom } from './room';

export function startGame(room: GameRoom) {
  if (!room.owner || !room.guest) {
    throw new Error('Cannot start game without both players');
  }
  if (room.gameLoop) {
    clearInterval(room.gameLoop);
  }
  console.log(`Starting game in room ${room.id}`);
  try {
    io.to(room.id).emit('game_start', {
      message: 'Game is starting',
      ballX: room.gameState.ballX,
      ballY: room.gameState.ballY,
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
      success: true,
    });
  } catch (err) {
    throw new Error(`[startGame] Failed to send game start message: ${err}`);
  }

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
    room.guest!.score++;
    resetBall(room, false);
  } else if (gameState.ballX >= 800) {
    room.owner!.score++;
    resetBall(room, true);
  }
  if (room.owner!.score >= 10 || room.guest!.score >= 10) {
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

  io.to(room.id).emit('game_over', {
    winner,
    finalScore: {
      owner: room.owner!.score,
      guest: room.guest!.score,
    },
    message: `Game over! ${room[winner]!.nickname} wins!`,
  });

  clearInterval(room.gameLoop);
  room.gameLoop = undefined;

  if (room.owner) handleLeaveRoom(room.owner.conn);
  if (room.guest) handleLeaveRoom(room.guest.conn);
}

function broadcastGameState(room: GameRoom) {
  const gameState = {
    ballX: room.gameState.ballX,
    ballY: room.gameState.ballY,
    paddle1Y: room.owner?.paddleY ?? 250,
    paddle2Y: room.guest?.paddleY ?? 250,
    ownerScore: room.owner?.score ?? 0,
    guestScore: room.guest?.score ?? 0,
  };
  try {
    io.to(room.id).emit('game_state', gameState);
  } catch (error) {
    console.error(`[broadcastGameState] Error broadcasting game state: ${error}`);
  }
  console.log(`[Server] Game state broadcasted for room ${room.id}`);
}
