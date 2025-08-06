import { SocketManager } from './socketManager.js';

export class PongMultiplayer {
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
  // Game state
  private playerY = 250;
  private opponentY = 250;
  private ballX = 400;
  private ballY = 300;
  private playerScore = 0;
  private opponentScore = 0;

  // Controls
  private upPressed = false;
  private downPressed = false;
  private wPressed = false;
  private sPressed = false;

  // Constants
  private readonly paddleHeight = 100;
  private readonly paddleWidth = 15;
  private readonly ballRadius = 10;
  private readonly winningScore = 10;

  constructor(canvas: HTMLCanvasElement, socketManager: SocketManager) {
    console.log('Initializing PongMultiplayer');
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

    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas() {
    this.setupCanvas();
  }

  private setupControls() {
    // Keyboard
    const keyDownHandler = (e: KeyboardEvent) => {
      if (this.isPlayer1) {
        console.log('Player 1 controls');
        // Player 1 uses W/S
        if (e.key === 'w' || e.key === 'W') this.wPressed = true;
        else if (e.key === 's' || e.key === 'S') this.sPressed = true;
      } else {
        console.log('Player 2 controls');
        // Player 2 uses Arrow Keys
        if (e.key === 'ArrowUp') this.upPressed = true;
        else if (e.key === 'ArrowDown') this.downPressed = true;
      }
    };

    const keyUpHandler = (e: KeyboardEvent) => {
      if (this.isPlayer1) {
        if (e.key === 'w' || e.key === 'W') this.wPressed = false;
        if (e.key === 's' || e.key === 'S') this.sPressed = false;
      } else {
        if (e.key === 'ArrowUp') this.upPressed = false;
        if (e.key === 'ArrowDown') this.downPressed = false;
      }
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
        document.getElementById('game-nick')!.textContent = user.nickname;
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

  public updateFromServer(gameState: any) {
    this.ballX = gameState.ballX;
    this.ballY = gameState.ballY;
    
    if (this.isPlayer1) {
      this.playerScore = gameState.ownerScore;
      this.opponentScore = gameState.guestScore;
      this.opponentY = gameState.paddle2Y;
    } else {
      this.playerScore = gameState.guestScore;
      this.opponentScore = gameState.ownerScore;
      this.opponentY = gameState.paddle1Y;
    }
    this.draw();
  }

  public updateOpponentPaddle(yPos: number) {
    this.opponentY = yPos;
  }

  public handleGameStart(message: any) {
  console.log('Game start received:', message);
  console.log('Is Player 1:', message.isPlayer1);
  console.log('Owner info:', message.owner);
  console.log('Guest info:', message.guest);
  console.log('Message.owner.nickname:', message.owner.nickname);
  console.log('Message.guest.nickname:', message.guest.nickname);
  if (this.gameRunning) this.stop();

  this.isPlayer1 = message.owner.nickname === this.myNickname;
  this.roomId = message.roomId;
  this.opponentNickname = message.guest.nickname;
  document.getElementById('game-nick2')!.textContent = this.opponentNickname;

  // DEBUG: Hangi oyuncu olduğunu ve nicknameleri kontrol et
  console.log(`I am ${this.isPlayer1 ? 'Player 1 (Owner)' : 'Player 2 (Guest)'}`);
  console.log(`My opponent is: ${this.opponentNickname}`);

  // UI güncellemeleri - BU KISIM ÇOK ÖNEMLİ
  const gameNick1 = document.getElementById('game-nick');
  const gameNick2 = document.getElementById('game-nick2');
  
  if (gameNick1 && gameNick2) {
    if (this.isPlayer1) {
      // Ben owner'ım, sol tarafta benim ismim olacak
      gameNick1.textContent = message.owner.nickname;
      gameNick2.textContent = message.guest.nickname;
      console.log(`Set nicknames: ${message.owner.nickname} vs ${message.guest.nickname}`);
    } else {
      // Ben guest'im, ama UI'da kendi ismimi sol tarafa koyalım
      gameNick1.textContent = message.guest.nickname;
      gameNick2.textContent = message.owner.nickname;
      console.log(`Set nicknames: ${message.guest.nickname} vs ${message.owner.nickname}`);
    }
  } else {
    console.error('Could not find game-nick elements!');
  }

  // Kontrol bilgisini göster
  this.updateStatus(`You are Player ${this.isPlayer1 ? '1 (W/S keys)' : '2 (Arrow keys)'}. Game starting!`);

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
    const winner = message.winner === 'owner' ? 
      (this.isPlayer1 ? 'YOU' : this.opponentNickname) : 
      (this.isPlayer1 ? this.opponentNickname : 'YOU');
    this.drawGameOver(winner);
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

    // Orta çizgi
    this.ctx.strokeStyle = '#ffff00';
    this.ctx.setLineDash([10, 10]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width / 2, 0);
    this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Paddle pozisyonları - ekran boyutuna göre ölçeklendir
    const scaleX = this.canvas.width / 800;
    const scaleY = this.canvas.height / 600;

    // Paddles
    const paddleRadius = 8;
    
    // Kendi paddle'ımız (sol tarafta player1, sağ tarafta player2)
    this.ctx.fillStyle = this.isPlayer1 ? '#ff00ff' : '#00ffff';
    const myPaddleX = this.isPlayer1 ? 10 * scaleX : (this.canvas.width - 25 * scaleX);
    this.drawRoundedRect(
      myPaddleX,
      this.playerY * scaleY,
      this.paddleWidth * scaleX,
      this.paddleHeight * scaleY,
      paddleRadius
    );

    // Rakip paddle'ı
    this.ctx.fillStyle = this.isPlayer1 ? '#00ffff' : '#ff00ff';
    const opponentPaddleX = this.isPlayer1 ? (this.canvas.width - 25 * scaleX) : 10 * scaleX;
    this.drawRoundedRect(
      opponentPaddleX,
      this.opponentY * scaleY,
      this.paddleWidth * scaleX,
      this.paddleHeight * scaleY,
      paddleRadius
    );

    // Top
    this.ctx.fillStyle = '#ffff00';
    this.ctx.beginPath();
    this.ctx.arc(this.ballX * scaleX, this.ballY * scaleY, this.ballRadius * Math.min(scaleX, scaleY), 0, Math.PI * 2);
    this.ctx.fill();

    // Skorları güncelle
    document.getElementById('score')!.textContent = this.playerScore.toString();
    document.getElementById('score2')!.textContent = this.opponentScore.toString();

    this.animationId = requestAnimationFrame(() => this.draw());
  }

  private handlePaddleMovement(deltaTime: number) {
    let moved = false;
    const speedPxPerSecond = 300; // px/s
    const moveSpeed = speedPxPerSecond * (deltaTime / 1000);
    if (this.isPlayer1) {
      // Player 1 - W/S tuşları
      if (this.wPressed) {
        const newY = Math.max(0, this.playerY - moveSpeed);
        if (newY !== this.playerY) {
          this.playerY = newY;
          moved = true;
        }
      }
      if (this.sPressed) {
        const newY = Math.min(600 - this.paddleHeight, this.playerY + moveSpeed);
        if (newY !== this.playerY) {
          this.playerY = newY;
          moved = true;
        }
      }
    } else {
      // Player 2 - Ok tuşları
      if (this.upPressed) {
        const newY = Math.max(0, this.playerY - moveSpeed);
        if (newY !== this.playerY) {
          this.playerY = newY;
          moved = true;
        }
      }
      if (this.downPressed) {
        const newY = Math.min(600 - this.paddleHeight, this.playerY + moveSpeed);
        if (newY !== this.playerY) {
          this.playerY = newY;
          moved = true;
        }
      }
    }
    // Sadece hareket varsa server'a gönder
    if (moved) {
      this.socketManager?.paddleMove(this.playerY);
    }
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
    this.animationId = requestAnimationFrame((this.gameLoop));
  }

  private gameLoop = (timestamp: number) => {
    if (!this.gameRunning) return;
    const deltaTime = timestamp - this.lastTimeStamp;
    this.lastTimeStamp = timestamp;

    // Her frame'de server'a paddle pozisyonunu gönder
    this.handlePaddleMovement(deltaTime);

    // Oyun durumunu güncelle
    this.draw();

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