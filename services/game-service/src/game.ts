import { GameRoom, gameRooms, tournamentRooms } from './types/types';
import { io } from './server';
import { handleLeaveRoom } from './room';
import type { GameStartPayload, Player } from './types/types';
import { setMaxIdleHTTPParsers } from 'http';
import { handleTournamentGameEnd } from './tournament';
import { authUserServiceUpstream } from './server';

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

    if (room.gameType !== 'local') {
      // Guest'e gönder (Player 2)
      room.guest.conn.emit('game_start', {
        ...gameStartPayload,
        isOwner: false,
      });
    }

    if ('players' in room && 'gameState' in room) {
      // loope durch die players durch und sende ihnen game_start
      let players = (room as any).players as Player[];
      if (Array.isArray(players)) {
        players.forEach((player: Player) => {
          if (player.conn) {
            player.conn.emit('game_start', {
              ...gameStartPayload,
              isOwner: player.id === room.owner?.id,
            });
          }
        });
      }
      players = (room as any).lostPlayers as Player[];
      if (Array.isArray(players)) {
        players.forEach((player: Player) => {
          if (player.conn) {
            player.conn.emit('game_start', {
              ...gameStartPayload,
              isOwner: player.id === room.owner?.id,
            });
          }
        });
      }
    }

    // Owner'a gönder (Player 1)
    room.owner.conn.emit('game_start', {
      ...gameStartPayload,
      isOwner: true,
    });

    console.log(`[Server] Game start messages sent to both players, payload: ${gameStartPayload}`);
  } catch (err) {
    console.error(`[Server] Error sending game start messages:`, err);
    throw new Error(`[startGame] Failed to send game start message: ${err}`);
  }

  setTimeout(() => {
    gameLoop(room);
  }, 3000);
}

function gameLoop(room: GameRoom) {
  console.log(`[Server] Starting game loop for room ${room.id}`);
  room.gameLoop = setInterval(() => {
    if (!room.gameLoop) {
      console.log(`[Server] Game loop already cleared for room ${room.id}`);
      return;
    }
    if (!gameRooms[room.id] && !tournamentRooms[room.id]) {
      console.log(`[Server] Room ${room.id} no longer exists - stopping game loop`);
      abortGame(room);
      return;
    }
    if (!room.owner || !room.guest) {
      console.log(`[Server] Missing players in room ${room.id} - stopping game loop`);
      abortGame(room);
      return;
    }
    if (!room.gameState) {
      console.log(`[Server] No game state in room ${room.id} - stopping game loop`);
      abortGame(room);
      return;
    }

    updateGameState(room);
    broadcastGameState(room);
  }, 1000 / 60);
  console.log(`[Server] Game loop started for room ${room.id}`);
}

function updateGameState(room: GameRoom) {
  // Eğer oyun pause'lanmışsa hiçbir şey yapma
  if (room.isPaused) {
    return;
  }

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
  } else if (gameState.ballX >= 800) {
    room.owner!.score++;
    resetBall(room, true);
    scoreChanged = true;
  }

  // Skor değiştiyse hemen broadcast et
  if (scoreChanged) {
    broadcastGameState(room);
  }

  if (room.owner!.score >= 10 || room.guest!.score >= 10) {
    if (room.gameLoop) {
      clearInterval(room.gameLoop);
      room.gameLoop = undefined;
      console.log(`[Server] Game loop cleared in updateGameState for room ${room.id}`);
    }
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

export async function endGame(room: GameRoom) {
  if (room.gameLoop) {
    clearInterval(room.gameLoop);
    room.gameLoop = undefined;
    console.log(`[Server] Game loop stopped for room ${room.id}`);
  }
  const winner = room.owner!.score >= 10 ? room.owner!.nickname : room.guest!.nickname;
  console.log(`[Server] Game ended in room ${room.id}. Winner: ${winner}`);

  let gameResult = {
    player1: room.owner!.id,
    player2: room.gameType === 'single' ? null : room.guest!.id,
    winner:
      winner === room.owner!.nickname
        ? room.owner!.id
        : room.gameType === 'single'
          ? null
          : room.guest!.id,
    scores: {
      player1: room.owner!.score,
      player2: room.guest!.score,
    },
    gameType: room.gameType,
    roomId: room.id,
  };

  if ('players' in room) {
    await saveGameResult({
      ...gameResult,
      player2: room.guest!.id,
      winner: gameResult.winner != null ? gameResult.winner : room.guest?.id,
      gameType: 'tournament',
    });
    console.debug(`[Server] Tournament game result saved for room ${room.id}`);
    handleTournamentGameEnd(room, winner);
    return;
  }

  await saveGameResult({ ...gameResult });

  io.to(room.id).emit('game_over', {
    winner,
    finalScore: {
      owner: room.owner!.score,
      guest: room.guest!.score,
    },
    message: `Game over! ${winner} wins!`,
  });

  if (room.gameLoop) {
    clearInterval(room.gameLoop);
    room.gameLoop = undefined;
  }
  console.log(`[Server] Game ended in room ${room.id}, winner: ${winner}`);

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

async function saveGameResult(gameData: {
  player1: any;
  player2?: any;
  winner?: any;
  scores: { player1: number; player2: number };
  gameType: string;
  roomId?: string;
}): Promise<boolean> {
  const matchData = {
    player1_id: gameData.player1,
    player2_id: gameData.player2,
    winner_id: gameData.winner,
    player1_score: gameData.scores.player1,
    player2_score: gameData.scores.player2,
    game_type: gameData.gameType,
    room_id: gameData.roomId,
  };

  try {
    const response = await fetch(`${authUserServiceUpstream}/api/match-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(matchData),
      // @ts-ignore
    });

    if (response.ok) {
      console.log('Match result saved successfully');
      return true;
    } else {
      const errorData = await response.text();
      console.error('Failed to save match result:', response.status, errorData);
      return false;
    }
  } catch (error) {
    console.error('Error saving match result:', error);
    return false;
  }
}

function broadcastGameState(room: GameRoom) {
  if (!room) {
    console.warn(`[Server] No room in broadcastGameState`);
    return;
  }

  if (!room.gameState) {
    console.warn(`[Server] No gameState for room ${room.id} - skipping broadcast`);
    return;
  }

  if (!room.owner || !room.guest) {
    console.warn(`[Server] Missing players in room ${room.id} - skipping broadcast`);
    return;
  }

  if (!room.gameLoop) {
    console.warn(`[Server] Game loop not active for room ${room.id} - skipping broadcast`);
    return;
  }

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
    console.log(`[Server] Game state not broadcasted for room ${room.id}`);
  }
}
