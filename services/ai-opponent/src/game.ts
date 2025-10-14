import { SocketManager } from './socketManager';
import { ClientToServerEvents, ServerToClientEvents } from './socket-interfaces';
import { HybridAISystem } from './hybrid_ai_system';
import { Constants, DEFAULT_CONSTANTS, GameStatePG } from './types';

// Game constants
const GAME_FPS = 60;
const PADDLE_UPDATE_INTERVAL = 50; // ms
const AI_UPDATE_INTERVAL = 1000; // ms - AI can only update once per second
const PADDLE_TOLERANCE = 20; // Tolerance to avoid paddle jittering
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const INITIAL_PLAYER_Y = 250;
const INITIAL_BALL_X = 400;
const INITIAL_BALL_Y = 300;

export class PongGame {
  private readonly gameId = Math.random().toString(36).substring(2, 15);
  private readonly socketManager: SocketManager;
  private readonly constants: Constants;
  private readonly aiSystem: HybridAISystem;

  // Game state
  private gameRunning = false;
  private isPaused = false;
  private gameLoopInterval?: NodeJS.Timeout;

  // Player and ball positions
  private playerY = INITIAL_PLAYER_Y;
  private opponentY = INITIAL_PLAYER_Y;
  private ballX = INITIAL_BALL_X;
  private ballY = INITIAL_BALL_Y;
  private ballVX = 0;
  private ballVY = 0;

  // Scores
  private playerScore = 0;
  private opponentScore = 0;

  // AI state
  private aiY = INITIAL_PLAYER_Y;
  private aiTargetY = INITIAL_PLAYER_Y;
  private lastAIMove = -AI_UPDATE_INTERVAL;

  // Timing
  private lastPaddleUpdate = 0;
  private ballSpeed = 0;

  // Game settings - can be configured if needed
  public readonly isSinglePlayer = false;
  public readonly isRemote = false;

  constructor(socketManager: SocketManager) {
    this.socketManager = socketManager;
    this.constants = { ...DEFAULT_CONSTANTS };
    this.constants.paddleCenter = this.constants.paddleHeight / 2;
    this.ballSpeed = this.constants.INITIAL_BALL_SPEED;
    this.aiSystem = new HybridAISystem(this.constants);
  }

  public onGameEnd?: () => void;

  private updateStatus(message: string): void {
    // Log status instead of updating DOM (server-side environment)
    console.log(`[PongGame-${this.gameId}] Status: ${message}`);
  }

  public updateFromServer(gameState: ServerToClientEvents['game_state']): void {
    // Update ball state
    this.ballX = gameState.ballX;
    this.ballY = gameState.ballY;
    this.ballVX = gameState.ballVX;
    this.ballVY = gameState.ballVY;

    // Update paddle positions (AI is always player2)
    this.playerY = gameState.paddle2Y;
    this.opponentY = gameState.paddle1Y;
    this.aiY = gameState.paddle2Y;

    // Update scores
    this.playerScore = gameState.guestScore;
    this.opponentScore = gameState.ownerScore;
  }

  public handleGameStart(message: any): void {
    console.log(`[PongGame-${this.gameId}] Game started`);

    if (this.gameRunning) {
      console.log(`[PongGame-${this.gameId}] Game already running`);
      return;
    }

    this.gameRunning = true;
    this.startGameLoop();
  }

  private startGameLoop(): void {
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
    }
    this.gameLoopInterval = setInterval(() => {
      if (!this.gameRunning) {
        this.stopGameLoop();
        return;
      }
      this.gameLoop();
    }, 1000 / GAME_FPS);
  }

  private stopGameLoop(): void {
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
      this.gameLoopInterval = undefined;
    }
  }

  private gameLoop = (): void => {
    if (!this.gameRunning || this.isPaused) {
      return;
    }

    const timestamp = Date.now();

    // Only send paddle updates at specified interval
    if (timestamp - this.lastPaddleUpdate >= PADDLE_UPDATE_INTERVAL) {
      this.lastPaddleUpdate = timestamp;
      this.handlePaddleMovement();
    }
  };

  public handleRoomTerminated(): void {
    console.log(`[PongGame-${this.gameId}] Room terminated`);
    this.stop();
    this.resetGame();
  }

  public handleGameOver(message: any) {
    console.log(`[PongGame-${this.gameId}] Game over`);
    this.gameRunning = false;

    // PROBLEM: onGameEnd wird nicht mit korrektem won-Parameter aufgerufen!
    const aiWon = message.winner === 'AI';

    // Informiere das AI-System über das Spielende mit korrektem Result
    if (this.aiSystem?.onGameEnd) {
      this.aiSystem.onGameEnd(aiWon);
    }

    // Cleanup callback aufrufen
    this.onGameEnd?.();
  }

  public handleOpponentDisconnected(): void {
    console.log(`[PongGame-${this.gameId}] Opponent disconnected`);
    this.updateStatus('Opponent disconnected');

    setTimeout(() => {
      this.stop();
      this.updateStatus('Game ended due to opponent disconnect');
    }, 2000);
  }

  public handleConnectionLost(): void {
    console.warn(`[PongGame-${this.gameId}] Connection lost`);
    this.stop();
    this.updateStatus('Connection lost. Trying to reconnect...');
  }

  private handlePaddleMovement(): void {
    const moveP1: 'up' | 'down' | 'none' = 'none'; // AI doesn't control player 1
    let moveP2: 'up' | 'down' | 'none' = 'none';

    // Update AI target position only once per second
    if (this.lastPaddleUpdate - this.lastAIMove >= AI_UPDATE_INTERVAL) {
      const gameState: GameStatePG = {
        ballX: this.ballX,
        ballY: this.ballY,
        ballVX: this.ballVX,
        ballVY: this.ballVY,
        aiY: this.aiY,
        playerY: this.playerY,
        canvasWidth: CANVAS_WIDTH,
        canvasHeight: CANVAS_HEIGHT,
        ballSpeed: this.ballSpeed,
        gameTime: performance.now(),
      };

      this.aiTargetY = this.aiSystem.getTargetY(gameState);
      this.lastAIMove = this.lastPaddleUpdate;
    }

    // Determine AI movement with tolerance to avoid jittering
    const distanceToTarget = Math.abs(this.aiY - this.aiTargetY);

    if (distanceToTarget > PADDLE_TOLERANCE) {
      if (this.aiY < this.aiTargetY - PADDLE_TOLERANCE) {
        moveP2 = 'down'; // Move towards larger Y values
      } else if (this.aiY > this.aiTargetY + PADDLE_TOLERANCE) {
        moveP2 = 'up'; // Move towards smaller Y values
      }
    }

    // Send paddle movement to server
    const payload: ClientToServerEvents['paddle_move'] = { moveP1, moveP2 };
    this.socketManager.paddleMove(payload);
  }

  private resetGame(): void {
    this.playerScore = 0;
    this.opponentScore = 0;

    this.playerY = INITIAL_PLAYER_Y;
    this.opponentY = INITIAL_PLAYER_Y;
    this.aiY = INITIAL_PLAYER_Y;
    this.aiTargetY = INITIAL_PLAYER_Y;

    this.ballX = INITIAL_BALL_X;
    this.ballY = INITIAL_BALL_Y;
    this.ballVX = 0;
    this.ballVY = 0;

    this.lastAIMove = -AI_UPDATE_INTERVAL;
    this.lastPaddleUpdate = 0;
  }

  public pauseGame(): void {
    if (!this.gameRunning || this.isPaused) {
      console.log(`[PongGame-${this.gameId}] Cannot pause - game not running or already paused`);
      return;
    }

    this.isPaused = true;
    this.updateStatus('Game paused');
  }

  public resumeGame(): void {
    if (!this.isPaused) {
      return;
    }
    this.isPaused = false;
    this.updateStatus('Game resumed');
  }

  public stop(): void {
    console.log(`[PongGame-${this.gameId}] Stopping game`);

    this.gameRunning = false;
    this.isPaused = false;
    this.stopGameLoop();
  }

  public getGameId(): string {
    return this.gameId;
  }

  public isGameRunning(): boolean {
    return this.gameRunning;
  }

  public getAIPosition(): { current: number; target: number } {
    return {
      current: this.aiY,
      target: this.aiTargetY,
    };
  }

  public getGameStats(): {
    playerScore: number;
    opponentScore: number;
    ballPosition: { x: number; y: number };
    aiPosition: { current: number; target: number };
  } {
    return {
      playerScore: this.playerScore,
      opponentScore: this.opponentScore,
      ballPosition: { x: this.ballX, y: this.ballY },
      aiPosition: this.getAIPosition(),
    };
  }

  public getAISystem(): HybridAISystem {
    return this.aiSystem;
  }
}
