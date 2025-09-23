import { Server } from 'http';
import { SocketManager } from './socketManager';
import { ClientToServerEvents, ServerToClientEvents } from './socket-interfaces';
import { HybridAISystem } from './hybrid_ai_system';
import { Constants, DEFAULT_CONSTANTS } from './types';

export class PongGame {
  public isSinglePlayer = false;
  public isRemote = false;
  // private canvas: HTMLCanvasElement;
  // private ctx: CanvasRenderingContext2D;
  private gameRunning = false;
  private animationId!: number;
  private isPlayer1 = false;
  // private roomId: string | null = null;
  // private opponentNickname = '';
  // private myNickname = 'Player';
  private socketManager?: SocketManager;
  // Game state
  private playerY = 250;
  private opponentY = 250;
  private ballX = 400;
  private ballY = 300;
  private playerScore = 0;
  private opponentScore = 0;
  private isPaused = false;
  private lastAIMove = -10000;

  // Constants
  private constants: Constants;
  private savedBallSpeed: number = 0;
  private ballSpeed: number = 0;
  private aiSystem!: HybridAISystem;

  // game loop
  private lastPaddleUpdate = 0;
  private paddleUpdateInterval = 50; // ms
  private ballVX = 0;
  private ballVY = 0;
  private aiY = 250;
  private AITargetY = 250;
  private canvasWidth = 800;
  private canvasHeight = 600;

  constructor(socketManager: SocketManager) {
    this.constants = DEFAULT_CONSTANTS;
    this.socketManager = socketManager;
    // this.canvas = canvas;
    this.constants.paddleCenter = this.constants.paddleHeight / 2;
    // this.ctx = canvas.getContext('2d')!;
    this.savedBallSpeed = this.constants.INITIAL_BALL_SPEED;
    this.ballSpeed = this.constants.INITIAL_BALL_SPEED;
    this.aiSystem = new HybridAISystem(this.constants);
    const socket = this.socketManager; // ist bisher in init (async) drin. muss es wieder in eine async funktion rein?
    // this.init();
  }

  public onGameEnd?: () => void; // Callback für Cleanup

  // constructor(canvas: HTMLCanvasElement, socketManager: SocketManager) {
  //   console.log('Initializing Pong Game');
  //   this.socketManager = socketManager;
  //   // this.canvas = canvas;
  //   // this.ctx = canvas.getContext('2d')!;
  //   this.init();
  // }

  // public async init() {
  //   this.setupSocketListeners();
  //   // this.setupUI();
  // }

  // private setupSocketListeners() {
  //   const socket = this.socketManager;
  //   console.log('Setting up socket listeners');
  // }

  // private setupControls() {
  //   // Keyboard
  //   const keyDownHandler = (e: KeyboardEvent) => {
  //     if (this.isPlayer1) {
  //       console.log('Player 1 controls');
  //       // Player 1 uses W/S
  //       if (e.key === 'w' || e.key === 'W') this.wPressed = true;
  //       else if (e.key === 's' || e.key === 'S') this.sPressed = true;
  //     } else {
  //       console.log('Player 2 controls');
  //       // Player 2 uses Arrow Keys
  //       if (e.key === 'ArrowUp') this.upPressed = true;
  //       else if (e.key === 'ArrowDown') this.downPressed = true;
  //     }
  //   };

  //   const keyUpHandler = (e: KeyboardEvent) => {
  //     if (this.isPlayer1) {
  //       if (e.key === 'w' || e.key === 'W') this.wPressed = false;
  //       if (e.key === 's' || e.key === 'S') this.sPressed = false;
  //     } else {
  //       if (e.key === 'ArrowUp') this.upPressed = false;
  //       if (e.key === 'ArrowDown') this.downPressed = false;
  //     }
  // //   };

  //   document.addEventListener('keydown', keyDownHandler);
  //   document.addEventListener('keyup', keyUpHandler);

  //   // Mobile controls - sadece kendi oyuncusu için
  //   const upBtn = document.getElementById('up-btn');
  //   const downBtn = document.getElementById('down-btn');

  //   if (upBtn && downBtn) {
  //     upBtn.addEventListener('touchstart', () => {
  //       if (this.isPlayer1) this.wPressed = true;
  //       else this.upPressed = true;
  //     });
  //     upBtn.addEventListener('touchend', () => {
  //       if (this.isPlayer1) this.wPressed = false;
  //       else this.upPressed = false;
  //     });
  //     downBtn.addEventListener('touchstart', () => {
  //       if (this.isPlayer1) this.sPressed = true;
  //       else this.downPressed = true;
  //     });
  //     downBtn.addEventListener('touchend', () => {
  //       if (this.isPlayer1) this.sPressed = false;
  //       else this.downPressed = false;
  //     });
  //   }
  // }

  // private async setupUI() {
  //   try {
  //     const response = await fetch('/api/profile', {
  //       headers: {
  //         Authorization: `Bearer ${localStorage.getItem('authToken')}`,
  //         // 'Content-Type': 'application/json',
  //       },
  //     });

  //     if (response.ok) {
  //       const user = await response.json();
  //       // this.myNickname = user.nickname;
  //       document.getElementById('game-nick')!.textContent = user.nickname;
  //     }
  //   } catch (error) {
  //     console.error('Failed to fetch user profile:', error);
  //     document.getElementById('game-nick')!.textContent = 'Player';
  //   }

  //   // document.getElementById('game-nick2')!.textContent = 'Waiting...';
  // }

  private updateStatus(message: string) {
    const statusElement = document.getElementById('lobby-status');
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  // UPDATED
  public updateFromServer(gameState: ServerToClientEvents['game_state']) {
    this.ballX = gameState.ballX;
    this.ballY = gameState.ballY;
    this.ballVX = gameState.ballVX; // Das fehlt auch!
    this.ballVY = gameState.ballVY; // Das fehlt auch!
    this.playerY = gameState.paddle2Y;
    this.opponentY = gameState.paddle1Y;
    this.aiY = gameState.paddle2Y;
    this.playerScore = gameState.guestScore;
    this.opponentScore = gameState.ownerScore;
  }

  public handleGameStart(message: any) {
    // if (this.gameRunning) {
    //   return;
    // }
    this.gameRunning = true;
    // requestAnimationFrame(this.gameLoop);
      console.log('Starting AI game loop'); // DEBUG
  
    // setInterval statt requestAnimationFrame für Node.js
    const gameLoopInterval = setInterval(() => {
      if (!this.gameRunning) {
        clearInterval(gameLoopInterval);
        return;
      }
      this.gameLoop();
    }, 1000 / 60); // 60 FPS
  }

  private gameLoop = () => {
    if (!this.gameRunning) return;
    const timestamp = Date.now();
    // Nur alle X Millisekunden Paddle-Updates senden
    if (timestamp - this.lastPaddleUpdate >= this.paddleUpdateInterval) {
      this.lastPaddleUpdate = timestamp;
      this.getHandlePaddleMovement();
    }
    // if (this.gameRunning) {
    //   this.gameLoop();
    //   // requestAnimationFrame(this.gameLoop);
    // }
  };

  public handleRoomTerminated() {
    // console.warn('Room terminated, returning to lobby');
    this.stop();
    this.resetGame();
    // document.querySelector('.game-page')?.classList.add('hidden');
    // document.querySelector('.multiplayer-lobby')?.classList.remove('hidden');
    // alert('Room was terminated by server');
  }

  public handleGameOver(message: any) {
    console.log('Game over, stopping game loop');
    this.gameRunning = false;
    
    // Callback aufrufen für Server cleanup
    this.onGameEnd?.();
  }

  public handleOpponentDisconnected() {
    this.updateStatus('Opponent disconnected');
    setTimeout(() => {
      this.gameRunning = false;
      this.updateStatus('Game ended due to opponent disconnect');
    }, 2000);
  }

  public handleConnectionLost() {
    this.gameRunning = false;
    this.updateStatus('Connection lost. Trying to reconnect...');
  }

  // private draw() {
  //   if (!this.gameRunning) return;

  //   this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  //   this.ctx.fillStyle = 'black';
  //   this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

  //   // Orta çizgi
  //   this.ctx.strokeStyle = '#ffff00';
  //   this.ctx.setLineDash([10, 10]);
  //   this.ctx.beginPath();
  //   this.ctx.moveTo(this.canvas.width / 2, 0);
  //   this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
  //   this.ctx.stroke();
  //   this.ctx.setLineDash([]);

  //   // Paddle pozisyonları - ekran boyutuna göre ölçeklendir
  //   const scaleX = this.canvas.width / 800;
  //   const scaleY = this.canvas.height / 600;

  //   // Paddles
  //   const paddleRadius = 8;

  //   // Kendi paddle'ımız (sol tarafta player1, sağ tarafta player2)
  //   this.ctx.fillStyle = this.isPlayer1 ? '#ff00ff' : '#00ffff';
  //   const myPaddleX = this.isPlayer1 ? 10 * scaleX : this.canvas.width - 25 * scaleX;
  //   this.drawRoundedRect(
  //     myPaddleX,
  //     this.playerY * scaleY,
  //     this.paddleWidth * scaleX,
  //     this.paddleHeight * scaleY,
  //     paddleRadius
  //   );

  //   // Rakip paddle'ı
  //   this.ctx.fillStyle = this.isPlayer1 ? '#00ffff' : '#ff00ff';
  //   const opponentPaddleX = this.isPlayer1 ? this.canvas.width - 25 * scaleX : 10 * scaleX;
  //   this.drawRoundedRect(
  //     opponentPaddleX,
  //     this.opponentY * scaleY,
  //     this.paddleWidth * scaleX,
  //     this.paddleHeight * scaleY,
  //     paddleRadius
  //   );

  //   // Top
  //   this.ctx.fillStyle = '#ffff00';
  //   this.ctx.beginPath();
  //   this.ctx.arc(
  //     this.ballX * scaleX,
  //     this.ballY * scaleY,
  //     this.ballRadius * Math.min(scaleX, scaleY),
  //     0,
  //     Math.PI * 2
  //   );
  //   this.ctx.fill();

  //   // Skorları güncelle
  //   document.getElementById('score')!.textContent = this.playerScore.toString();
  //   document.getElementById('score2')!.textContent = this.opponentScore.toString();

  //   // this.animationId = requestAnimationFrame(() => this.draw());
  // }

  private getHandlePaddleMovement() {
    let moveP1: 'up' | 'down' | 'none' = 'none';
    let moveP2: 'up' | 'down' | 'none' = 'none';

    // sind immer player2
    if (this.lastPaddleUpdate - this.lastAIMove > 1000) {
      const gameState = {
        ballX: this.ballX,
        ballY: this.ballY,
        ballVX: this.ballVX,
        ballVY: this.ballVY,
        aiY: this.aiY,
        playerY: this.playerY,
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
        ballSpeed: this.ballSpeed,
        gameTime: performance.now(),
      };
      this.AITargetY = this.aiSystem.getTargetY(gameState);
      this.lastAIMove = this.lastPaddleUpdate;
    }
    const paddleTolerance = 20; // Toleranz um Zittern zu vermeiden
    
    if (Math.abs(this.aiY - this.AITargetY) > paddleTolerance) {
      if (this.aiY < this.AITargetY - paddleTolerance) {
        moveP2 = 'down'; // AI bewegt sich nach unten (größere Y-Werte)
      } else if (this.aiY > this.AITargetY + paddleTolerance) {
        moveP2 = 'up'; // AI bewegt sich nach oben (kleinere Y-Werte)
      }
    }
    let Payload: ClientToServerEvents['paddle_move'] = { moveP1, moveP2 };
    // Sadece hareket varsa server'a gönder
    this.socketManager?.paddleMove(Payload);
  }

  //   private drawRoundedRect(x: number, y: number, width: number, height: number, radius: number) {
  //     this.ctx.beginPath();
  //     this.ctx.moveTo(x + radius, y);
  //     this.ctx.lineTo(x + width - radius, y);
  //     this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  //     this.ctx.lineTo(x + width, y + height - radius);
  //     this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  //     this.ctx.lineTo(x + radius, y + height);
  //     this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  //     this.ctx.lineTo(x, y + radius);
  //     this.ctx.quadraticCurveTo(x, y, x + radius, y);
  //     this.ctx.closePath();
  //     this.ctx.fill();
  //   }

  //   private drawGameOver(winner: string) {
  //   this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  //   this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

  //   this.ctx.fillStyle = '#ffffff';
  //   this.ctx.font = 'bold 48px Arial';
  //   this.ctx.textAlign = 'center';
  //   this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 50);

  //   this.ctx.font = 'bold 36px Arial';
  //   this.ctx.fillText(`${winner} WON!`, this.canvas.width / 2, this.canvas.height / 2 + 20);

  //   this.ctx.font = '24px Arial';
  //   this.ctx.fillText(
  //     'Game will return to lobby in 5 seconds',
  //     this.canvas.width / 2,
  //     this.canvas.height / 2 + 80
  //   );

  //   // 5 saniye sonra lobby'e dön
  //   setTimeout(() => {
  //     this.resetGame();
  //     document.querySelector('.game-page')?.classList.add('hidden');
  //     document.querySelector('.multiplayer-lobby')?.classList.remove('hidden');
  //   }, 5000);
  // }

  private resetGame() {
    this.playerScore = 0;
    this.opponentScore = 0;
    this.playerY = 250;
    this.opponentY = 250;
    this.ballX = 400;
    this.ballY = 300;
    // document.getElementById('score')!.textContent = '0';
    // document.getElementById('score2')!.textContent = '0';
  }

  public pauseGame() {
    if (!this.gameRunning || this.isPaused) return;

    this.isPaused = true;
    this.gameRunning = false;
    // if (this.animationId) {
    //   cancelAnimationFrame(this.animationId);
    // }
    this.updateStatus('Game paused');
  }

  public resume() {
    if (!this.isPaused) return;

    this.isPaused = false;
    this.gameRunning = true;
    this.animationId = requestAnimationFrame(this.gameLoop);
    this.updateStatus('Game resumed');
  }

  public determineWinner(gameOverMessage: any): string {
    if (gameOverMessage.winner === 'owner') {
      return this.isPlayer1 ? 'YOU' : gameOverMessage.finalScore?.owner?.toString() || 'Opponent';
    } else {
      return this.isPlayer1 ? gameOverMessage.finalScore?.guest?.toString() || 'Opponent' : 'YOU';
    }
  }

  public stop() {
    this.gameRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}
