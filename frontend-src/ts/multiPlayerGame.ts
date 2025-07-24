import { SocketManager } from './socketManager.js';

export class PongMultiplayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameRunning = false;
  private animationId!: number;
  private isPlayer1 = false;
  private roomId: string | null = null;
  private opponentNickname = 'Opponent';

  // Game state
  private playerY = 250;
  private opponentY = 250;
  private ballX = 400;
  private ballY = 300;
  private playerScore = 0;
  private opponentScore = 0;
  private upPressed = false;
  private downPressed = false;

  // Constants
  private readonly paddleHeight = 100;
  private readonly paddleWidth = 15;
  private readonly ballRadius = 10;
  private readonly winningScore = 10;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.init();
  }

  public async init() {
    this.setupCanvas();
    this.setupControls();
    await this.setupMultiplayerConnection();
    this.setupSocketListeners();
    this.setupUI();
  }

  private setupSocketListeners() {
    const socket = SocketManager.getInstance();
    socket.onGameStart = (msg) => {
      console.log('Game start triggered', msg);
      this.handleGameStart(msg);
      this.startGame();
    };
  }

  private startGame() {
    if (!this.gameRunning) {
      this.gameRunning = true;
      this.draw();
    }
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

    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas() {
    this.setupCanvas();
  }

  private setupControls() {
    // Keyboard
    const keyDownHandler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') this.upPressed = true;
      else if (e.key === 'ArrowDown') this.downPressed = true;
    };

    const keyUpHandler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') this.upPressed = false;
      if (e.key === 'ArrowDown') this.downPressed = false;
    };

    document.addEventListener('keydown', keyDownHandler);
    document.addEventListener('keyup', keyUpHandler);

    // Mobile
    const upBtn = document.getElementById('up-btn');
    const downBtn = document.getElementById('down-btn');

    if (upBtn && downBtn) {
      upBtn.addEventListener('touchstart', () => (this.upPressed = true));
      upBtn.addEventListener('touchend', () => (this.upPressed = false));
      downBtn.addEventListener('touchstart', () => (this.downPressed = true));
      downBtn.addEventListener('touchend', () => (this.downPressed = false));
    }
  }

  private async setupMultiplayerConnection() {
    try {
      const socketManager = SocketManager.getInstance();
      await socketManager.connect();
      this.gameRunning = true;
      this.draw();
    } catch (error) {
      console.error('Connection failed:', error);
      this.updateStatus('Connection failed. Please try again.');
    }
  }

  private async setupUI() {
    try {
      const response = await fetch('/api/profile', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const user = await response.json();
        document.getElementById('game-nick')!.textContent = user.nickname;
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      document.getElementById('game-nick')!.textContent = 'Player';
    }

    document.getElementById('game-nick2')!.textContent = 'Waiting...';
  }

  private updateStatus(message: string) {
    const statusElement = document.getElementById('game-status');
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  public updateFromServer(gameState: any) {
    this.ballX = gameState.ballX;
    this.ballY = gameState.ballY;
    this.playerScore = gameState.player1Score;
    this.opponentScore = gameState.player2Score;

    if (this.isPlayer1) {
      this.opponentY = gameState.paddle2Y;
    } else {
      this.opponentY = gameState.paddle1Y;
    }
  }

  public handleGameStart(message: any) {
    console.log('Game start received:', message);

    if (this.gameRunning) this.stop();

    this.isPlayer1 = message.isPlayer1;
    this.roomId = message.roomId;
    this.opponentNickname = message.opponent;

    document.getElementById('game-nick2')!.textContent = this.opponentNickname;
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
    this.drawGameOver(
      message.winner === (this.isPlayer1 ? 'player1' : 'player2') ? 'YOU' : this.opponentNickname
    );
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

    // mid
    this.ctx.strokeStyle = '#ffff00';
    this.ctx.setLineDash([10, 10]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width / 2, 0);
    this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // paddles
    const paddleRadius = 8;
    this.ctx.fillStyle = this.isPlayer1 ? '#ff00ff' : '#00ffff';
    const playerPaddleX = this.isPlayer1 ? 10 : this.canvas.width - 25;
    this.drawRoundedRect(
      playerPaddleX,
      this.playerY,
      this.paddleWidth,
      this.paddleHeight,
      paddleRadius
    );

    this.ctx.fillStyle = this.isPlayer1 ? '#00ffff' : '#ff00ff';
    const opponentPaddleX = this.isPlayer1 ? this.canvas.width - 25 : 10;
    this.drawRoundedRect(
      opponentPaddleX,
      this.opponentY,
      this.paddleWidth,
      this.paddleHeight,
      paddleRadius
    );

    // ball
    this.ctx.fillStyle = '#ffff00';
    this.ctx.beginPath();
    this.ctx.arc(this.ballX, this.ballY, this.ballRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // player paddle
    if (this.upPressed) {
      this.playerY = Math.max(0, this.playerY - 5);
    }
    if (this.downPressed) {
      this.playerY = Math.min(this.canvas.height - this.paddleHeight, this.playerY + 5);
    }

    // Important!! paddle possition for server!
    SocketManager.getInstance().sendPaddlePosition(this.playerY);

    // scores
    document.getElementById('score')!.textContent = this.playerScore.toString();
    document.getElementById('score2')!.textContent = this.opponentScore.toString();

    this.animationId = requestAnimationFrame(() => this.draw());
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
    this.ctx.fillText(`${winner} WON`, this.canvas.width / 2, this.canvas.height / 2 + 20);

    this.ctx.font = '24px Arial';
    this.ctx.fillText(
      'Click start to play again',
      this.canvas.width / 2,
      this.canvas.height / 2 + 80
    );

    this.canvas.onclick = () => {
      this.canvas.onclick = null;
      this.resetGame();
    };
  }

  private resetGame() {
    this.playerScore = 0;
    this.opponentScore = 0;
    document.getElementById('score')!.textContent = '0';
    document.getElementById('score2')!.textContent = '0';
    this.playerY = this.canvas.height / 2 - this.paddleHeight / 2;
    this.gameRunning = true;
    this.draw();
  }

  public start() {
    this.gameRunning = true;
    this.draw();
  }

  public stop() {
    this.gameRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    SocketManager.getInstance().disconnect();
  }
}
