import { Server } from 'http';
import { SocketManager } from './socketManager.js';
import { ClientToServerEvents, ServerToClientEvents } from './types/socket-interfaces.js';

export class PongGame {
  public isSinglePlayer = false;
  public isRemote = false;
  private lastTimeStamp = 0;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameRunning = false;
  private animationId!: number;
  private isPlayer1 = false;
  private roomId: string | null = null;
  private opponentNickname = '';
  private myNickname = 'Player';
  private socketManager?: SocketManager;

  // TODO: Fix Lobby message (w/s, up/down )

  // TODO: fix Game Over (on reset game)
  
  // Constants - normalized for 800x600
  private paddleHeight = 100;
  private paddleWidth = 15;
  private ballRadius = 10;
  private readonly winningScore = 10;

  // Variables scaled to canvas size
  private playerY = 250;
  private opponentY = 250;
  private ballX = 400;
  private ballY = 300;
  private playerScore = 0;
  private opponentScore = 0;
  private isPaused = false;

  // Controls
  private upPressed = false;
  private downPressed = false;
  private wPressed = false;
  private sPressed = false;

  private canvasSizeRatio = 1;
  private canvasSizeRatioX = 1;
  private canvasSizeRatioY = 1;

  // game loop
  private lastPaddleUpdate = 0;
  private paddleUpdateInterval = 50; // ms
  constructor(canvas: HTMLCanvasElement, socketManager: SocketManager) {
    console.log('Initializing Pong Game');
    this.socketManager = socketManager;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.init();
  }

  public async init() {
    this.setupCanvas();
    this.setupControls();
    this.setupSocketListeners();
    this.setupUI();
  }

  private setupSocketListeners() {
    const socket = this.socketManager;
    console.log('Setting up socket listeners');
  }

  private setupCanvas() {
    const aspectRatio = 16 / 9;
    const maxWidth = 800;
    const maxHeight = 600;

    const container = this.canvas.parentElement;
    const containerWidth = container?.clientWidth || maxWidth;
    const containerHeight = container?.clientHeight || maxHeight;

    let width = Math.min(containerWidth, maxWidth);
    let height = width / aspectRatio;

    if (height > containerHeight) {
      height = containerHeight;
      width = height * aspectRatio;
    }

    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.canvasSizeRatioX = this.canvas.width / maxWidth;
    this.canvasSizeRatioY = this.canvas.height / maxHeight;
    this.canvasSizeRatio = Math.min(this.canvasSizeRatioX, this.canvasSizeRatioY);
    this.paddleHeight = 100 * this.canvasSizeRatioY;
    this.paddleWidth = 15 * this.canvasSizeRatioX;
    this.ballRadius = 10 * this.canvasSizeRatio;

    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas() {
    this.setupCanvas();
  }

  private setupControls() {
    // Keyboard
    const keyDownHandler = (e: KeyboardEvent) => {
    if (e.key === 'w' || e.key === 'W') this.wPressed = true;
    else if (e.key === 's' || e.key === 'S') this.sPressed = true;
    if (e.key === 'ArrowUp') this.upPressed = true;
    else if (e.key === 'ArrowDown') this.downPressed = true;
    };

    const keyUpHandler = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W') this.wPressed = false;
      if (e.key === 's' || e.key === 'S') this.sPressed = false;
      if (e.key === 'ArrowUp') this.upPressed = false;
      if (e.key === 'ArrowDown') this.downPressed = false;
    };

    document.addEventListener('keydown', keyDownHandler);
    document.addEventListener('keyup', keyUpHandler);

    // Mobile controls - sadece kendi oyuncusu için
    const upBtn = document.getElementById('up-btn');
    const downBtn = document.getElementById('down-btn');

    if (upBtn && downBtn) {
      upBtn.addEventListener('touchstart', () => {
        if (this.isPlayer1) this.wPressed = true;
        else this.upPressed = true;
      });
      upBtn.addEventListener('touchend', () => {
        if (this.isPlayer1) this.wPressed = false;
        else this.upPressed = false;
      });
      downBtn.addEventListener('touchstart', () => {
        if (this.isPlayer1) this.sPressed = true;
        else this.downPressed = true;
      });
      downBtn.addEventListener('touchend', () => {
        if (this.isPlayer1) this.sPressed = false;
        else this.downPressed = false;
      });
    }
  }

  private async setupUI() {
    try {
      const response = await fetch('/api/profile', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          // 'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const user = await response.json();
        this.myNickname = user.nickname;
        if (!this.isRemote && !this.isSinglePlayer) this.myNickname = 'Player1';
        document.getElementById('game-nick')!.textContent = this.myNickname;
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      document.getElementById('game-nick')!.textContent = 'Player';
    }

    // document.getElementById('game-nick2')!.textContent = 'Waiting...';
  }

  private updateStatus(message: string) {
    const statusElement = document.getElementById('lobby-status');
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  public updateFromServer(gameState: ServerToClientEvents['game_state']) {
    this.ballX = gameState.ballX * this.canvasSizeRatioX;
    this.ballY = gameState.ballY * this.canvasSizeRatioY;
    if (this.isPlayer1) {
      this.playerY = gameState.paddle1Y * this.canvasSizeRatioY;
      this.opponentY = gameState.paddle2Y * this.canvasSizeRatioY;
      this.playerScore = gameState.ownerScore;
      this.opponentScore = gameState.guestScore;
    } else {
      this.playerY = gameState.paddle2Y * this.canvasSizeRatioY;
      this.opponentY = gameState.paddle1Y * this.canvasSizeRatioY;
      this.playerScore = gameState.guestScore;
      this.opponentScore = gameState.ownerScore;
    }
    console.debug(`game_state received: ${gameState}`)
    this.draw();
  }

  public handleGameStart(message: any) {
    console.log('Game start received:', message);
    console.log('Is Owner:', message.isOwner);
    console.log('Owner info:', message.owner);
    console.log('Guest info:', message.guest);
    console.log('Message.owner.nickname:', message.owner.nickname);
    console.log('Message.guest.nickname:', message.guest.nickname);

    if (this.gameRunning) this.stop();

    this.isPlayer1 = message.isOwner;
    this.roomId = message.roomId;
    if (message.isOwner) {
      this.opponentNickname = message.guest.nickname;
    } else {
      this.opponentNickname = message.owner.nickname;
    }
    document.getElementById('game-nick2')!.textContent = this.opponentNickname;

    console.log(`I am ${this.isPlayer1 ? 'Player 1 (Owner)' : 'Player 2 (Guest)'}`);
    console.log(`My opponent is: ${this.opponentNickname}`);

    const gameNick1 = document.getElementById('game-nick');
    const gameNick2 = document.getElementById('game-nick2');

    if (gameNick1 && gameNick2) {
      if (this.isPlayer1) {
        gameNick1.textContent = this.myNickname; // myNickname left
        gameNick2.textContent = this.opponentNickname; // Opponent right
      } else {
        gameNick1.textContent = this.opponentNickname; // Opponent left
        gameNick2.textContent = this.myNickname; // myNickname right
      }
      
      console.log(`UI updated: ${gameNick1.textContent} vs ${gameNick2.textContent}`);
      console.log(`I am: ${this.myNickname}, Opponent: ${this.opponentNickname}`);
    } else {
      console.error('Could not find game-nick elements!');
    }

    // Kontrol bilgisini göster
    this.updateStatus(
      `You are Player ${this.isPlayer1 ? '1 (W/S keys)' : '2 (Arrow keys)'}. Game starting!`
    );

    // To-Do: set Countdown timer before starting

    // Sayfa geçişi
    document.querySelector('.multiplayer-lobby')?.classList.add('hidden');
    document.querySelector('.game-page')?.classList.remove('hidden');

    this.start();
  }

  public handleRoomTerminated() {
    console.warn('Room terminated, returning to lobby');
    this.stop();
    document.querySelector('.game-page')?.classList.add('hidden');
    document.querySelector('.multiplayer-lobby')?.classList.remove('hidden');
    alert('Room was terminated by server');
  }

  public handleGameOver(message: any) {
    this.gameRunning = false;
    console.log('Game over message:', message);
    let winner =
      message.winner === 'owner'
        ? this.isPlayer1
          ? 'YOU'
          : this.opponentNickname
        : this.isPlayer1
          ? this.opponentNickname
          : 'YOU';
    if (!this.isRemote && !this.isSinglePlayer) {
      if (winner === 'YOU') {
        winner = 'Player1';
      } else {
        winner = 'Player2';
      }
    }
    console.log('Game over. Winner:', winner);
    console.log(`myNickname = ${this.myNickname}, opponentNick = ${this.opponentNickname}`);
    this.drawGameOver(winner);
  }

  public matchEnd(message: any) {
    this.gameRunning = false;
    console.log('Match end message:', message);
    let winner =
      message.winner === 'owner'
        ? this.isPlayer1
          ? 'YOU'
          : this.opponentNickname
        : this.isPlayer1
          ? this.opponentNickname
          : 'YOU';
    if (!this.isRemote && !this.isSinglePlayer) {
      if (winner === 'YOU') {
        winner = 'Player1';
      } else {
        winner = 'Player2';
      }
    }
    console.log('Match ended. Winner:', winner);
    console.log(`myNickname = ${this.myNickname}, opponentNick = ${this.opponentNickname}`);
    this.drawMatchOver(winner);
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

  private draw() {
    if (!this.gameRunning) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Center line
    this.ctx.strokeStyle = '#ffff00';
    this.ctx.setLineDash([10, 10]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width / 2, 0);
    this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Paddle pozisyonları - ekran boyutuna göre ölçeklendir
    // const scaleX = this.canvas.width / 800;
    // const scaleY = this.canvas.height / 600;

    // Paddles
    const paddleRadius = 8 * this.canvasSizeRatio;

    // Kendi paddle'ımız (sol tarafta player1, sağ tarafta player2)
    this.ctx.fillStyle = this.isPlayer1 ? '#ff00ff' : '#00ffff';
    const myPaddleX = this.isPlayer1 ? 10 * this.canvasSizeRatioX : this.canvas.width - 25 * this.canvasSizeRatioX;
    this.drawRoundedRect(
      myPaddleX,
      this.playerY,
      this.paddleWidth,
      this.paddleHeight,
      paddleRadius
    );

    // Rakip paddle'ı
    this.ctx.fillStyle = this.isPlayer1 ? '#00ffff' : '#ff00ff';
    const opponentPaddleX = this.isPlayer1 ? this.canvas.width - 25 * this.canvasSizeRatioX : 10 * this.canvasSizeRatioX;
    this.drawRoundedRect(
      opponentPaddleX,
      this.opponentY,
      this.paddleWidth,
      this.paddleHeight,
      paddleRadius
    );

    // Top
    this.ctx.fillStyle = '#ffff00';
    this.ctx.beginPath();
    this.ctx.arc(
      this.ballX,
      this.ballY,
      this.ballRadius,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Skorları güncelle
    document.getElementById('score')!.textContent = this.playerScore.toString();
    document.getElementById('score2')!.textContent = this.opponentScore.toString();

    // this.animationId = requestAnimationFrame(() => this.draw());
  }

  private handlePaddleMovement() {
    let moveP1: 'up' | 'down' | 'none' = 'none';
    let moveP2: 'up' | 'down' | 'none' = 'none';
    if (this.wPressed && !this.sPressed) {
      moveP1 = 'up';
    } else if (this.sPressed && !this.wPressed) {
      moveP1 = 'down';
    } else {
      moveP1 = 'none';
    }

    // Player 2 - Ok tuşları
    if (this.upPressed && !this.downPressed) {
      moveP2 = 'up';
    } else if (this.downPressed && !this.upPressed) {
      moveP2 = 'down';
    } else {
      moveP2 = 'none';
    }
    let Payload: ClientToServerEvents['paddle_move'] = {
      moveP1,
      moveP2,
    };
    // Sadece hareket varsa server'a gönder
    this.socketManager?.paddleMove(Payload);
  }

  private drawRoundedRect(x: number, y: number, width: number, height: number, radius: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawGameOver(winner: string) {
  this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

  this.ctx.fillStyle = '#ffffff';
  this.ctx.font = 'bold 48px Arial';
  this.ctx.textAlign = 'center';
  this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 50);

  this.ctx.font = 'bold 36px Arial';
  this.ctx.fillText(`${winner} WON!`, this.canvas.width / 2, this.canvas.height / 2 + 20);

  this.ctx.font = '24px Arial';
  this.ctx.fillText(
    'Game will return to lobby in 5 seconds',
    this.canvas.width / 2,
    this.canvas.height / 2 + 80
  );

  // 5 saniye sonra lobby'e dön
  setTimeout(() => {
    this.resetGame();
    document.querySelector('.game-page')?.classList.add('hidden');
    document.querySelector('.multiplayer-lobby')?.classList.remove('hidden');
  }, 5000);
}

  private drawMatchOver(winner: string) {
  this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

  this.ctx.fillStyle = '#ffffff';
  this.ctx.font = 'bold 48px Arial';
  this.ctx.textAlign = 'center';
  this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 50);

  this.ctx.font = 'bold 36px Arial';
  this.ctx.fillText(`${winner} WON!`, this.canvas.width / 2, this.canvas.height / 2 + 20);

  this.ctx.font = '24px Arial';
  this.ctx.fillText(
    'Next Match will start in 5 seconds',
    this.canvas.width / 2,
    this.canvas.height / 2 + 80
  );

  // 5 saniye sonra lobby'e dön
  setTimeout(() => {
    this.resetGame();
    document.querySelector('.game-page')?.classList.add('hidden');
    document.querySelector('.multiplayer-lobby')?.classList.remove('hidden');
  }, 5000);
}

  private resetGame() {
    this.playerScore = 0;
    this.opponentScore = 0;
    this.playerY = 250;
    this.opponentY = 250;
    this.ballX = 400;
    this.ballY = 300;
    document.getElementById('score')!.textContent = '0';
    document.getElementById('score2')!.textContent = '0';
  }

  public start() {
    if (this.gameRunning) {
      console.warn('Game is already running');
      return;
    }
    this.gameRunning = true;
    this.lastTimeStamp = performance.now();
    this.animationId = requestAnimationFrame(this.gameLoop);
  }

public startGame() {
    if (this.gameRunning && !this.isPaused) {
      console.warn('Game is already running');
      return;
    }
    
    if (this.isPaused) {
      this.resume();
    } else {
      this.start();
    }
  }

  public pauseGame() {
    if (!this.gameRunning || this.isPaused) return;
    
    this.isPaused = true;
    this.gameRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.updateStatus('Game paused');
  }

  public resume() {
    if (!this.isPaused) return;
    
    this.isPaused = false;
    this.gameRunning = true;
    this.lastTimeStamp = performance.now();
    this.animationId = requestAnimationFrame(this.gameLoop);
    this.updateStatus('Game resumed');
  }

  private gameLoop = (timestamp: number) => {
    if (!this.gameRunning) return;
    if (timestamp - this.lastPaddleUpdate >= this.paddleUpdateInterval) {
      this.lastPaddleUpdate = timestamp;

      this.handlePaddleMovement();
    }
    if (this.gameRunning) {
      requestAnimationFrame(this.gameLoop);
    }
  };

  public stop() {
    this.gameRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}
