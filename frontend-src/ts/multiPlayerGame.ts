import { Server } from 'http';
import { SocketManager } from './socketManager';
import { ClientToServerEvents, ServerToClientEvents } from './types/socket-interfaces';
import { gamePage, navigateTo, newgamePage, showPage } from './router';
import { time } from 'console';

export class PongGame {
  public isSinglePlayer = false;
  public isRemote = false;
  private lastTimeStamp = 0;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  gameRunning = false;
  private animationId!: number;
  private isPlayer1 = false;
  private roomId: string | null = null;
  private opponentNickname = '';
  private myNickname = 'Player';
  private socketManager?: SocketManager;

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
  // I added mobile drag controls pls dont remove.
  private isDragging = false;
  private touchStartY = 0;
  private touchCurrentY = 0;

  private canvasSizeRatio = 1;
  private canvasSizeRatioX = 1;
  private canvasSizeRatioY = 1;

  // game loop
  private lastPaddleUpdate = 0;
  private paddleUpdateInterval = 50; // ms
  constructor(canvas: HTMLCanvasElement, socketManager: SocketManager) {
    // console.log('Initializing Pong Game');
    this.socketManager = socketManager;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.init();
  }

  public async init() {
    this.setupCanvas();
    this.setupControls();
    this.setupMobileControls(); // newly added for mobile controls.
    this.setupSocketListeners();
    this.setupGameControls(); // newly added for start-pause functionality
  }

  private setupSocketListeners() {
    const socket = this.socketManager?.getSocket();
    if (!socket) return;
    // console.log('Setting up socket listeners');
    socket.on('game_pause_state', (isPaused: boolean) => {
      // console.log('Game pause state:', isPaused);
      if (isPaused) {
        this.pauseGame();
      } else {
        this.resume();
      }
    });
  }

  private setupCanvas() {
    // Canvas boyutlarını CSS'e bırak, sadece pixel ratio'yu güncelle
    this.updateCanvasSize();
    
    // Resize observer ekle
    this.setupResizeObserver();
}

private updateCanvasSize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.updateScalingFactors();
}

private updateScalingFactors() {
    const baseWidth = 800;
    const baseHeight = 600;
    
    this.canvasSizeRatioX = this.canvas.width / baseWidth;
    this.canvasSizeRatioY = this.canvas.height / baseHeight;
    this.canvasSizeRatio = Math.min(this.canvasSizeRatioX, this.canvasSizeRatioY);
    
    this.paddleHeight = 100 * this.canvasSizeRatioY;
    this.paddleWidth = 15 * this.canvasSizeRatioX;
    this.ballRadius = 10 * this.canvasSizeRatio;
}

private setupResizeObserver() {
    const resizeObserver = new ResizeObserver(() => {
        this.updateCanvasSize();
        if (this.gameRunning) this.draw();
    });
    
    resizeObserver.observe(this.canvas);
}

//Commented out for testing resize'in canvas I temporarily left css to handle it.
  // private setupCanvas() {
  //   const aspectRatio = 16 / 9;
  //   const maxWidth = 800;
  //   const maxHeight = 600;

  //   const container = this.canvas.parentElement;
  //   const containerWidth = container?.clientWidth || maxWidth;
  //   const containerHeight = container?.clientHeight || maxHeight;

  //   let width = Math.min(containerWidth, maxWidth);
  //   let height = width / aspectRatio;

  //   if (height > containerHeight) {
  //     height = containerHeight;
  //     width = height * aspectRatio;
  //   }

  //   this.canvas.width = width;
  //   this.canvas.height = height;
  //   this.canvas.style.width = `${width}px`;
  //   this.canvas.style.height = `${height}px`;

  //   this.canvasSizeRatioX = this.canvas.width / maxWidth;
  //   this.canvasSizeRatioY = this.canvas.height / maxHeight;
  //   this.canvasSizeRatio = Math.min(this.canvasSizeRatioX, this.canvasSizeRatioY);
  //   this.paddleHeight = 100 * this.canvasSizeRatioY;
  //   this.paddleWidth = 15 * this.canvasSizeRatioX;
  //   this.ballRadius = 10 * this.canvasSizeRatio;

  //   window.addEventListener('resize', () => this.resizeCanvas());
  // }

  // private resizeCanvas() {
  //   this.setupCanvas();
  // }

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
  }

  // New returning new game page
  private returnToNewGamePage() {
    if (document.querySelector('.game-page')?.classList.contains('hidden')) {
      console.log('Game page already hidden, not returning to new game page');
      return;
    }
    navigateTo('/game');
    showPage(newgamePage);
  }
  // till here

  // Mobile controls
  private setupMobileControls() {
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.isDragging = true;
      this.touchStartY = e.touches[0].clientY;
      this.touchCurrentY = this.touchStartY;
    });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!this.isDragging) return;
      this.touchCurrentY = e.touches[0].clientY;

      const deltaY = this.touchCurrentY - this.touchStartY;
      const sensitivity = 2;

      if (Math.abs(deltaY) > 5) {
        if (deltaY < 0) {
          // Up
          if (this.isPlayer1) this.wPressed = true;
          else this.upPressed = true;
        } else {
          // Down
          if (this.isPlayer1) this.sPressed = true;
          else this.downPressed = true;
        }
      }
    });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.isDragging = false;
      this.wPressed = false;
      this.sPressed = false;
      this.upPressed = false;
      this.downPressed = false;
    });
  }
  // till here mobile controls.

  // Start-Pause Button controls
  private setupGameControls() {
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');

    if (startBtn) {
      startBtn.addEventListener('click', () => this.startGame());
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => this.pauseGame());
    }
  }
  // till here start-pause btns

  private updateStatus(message: string | null) {
    if (!message) return (document.getElementById('game-status')?.remove());
    // console.log(`[Status] ${message}`);

    let statusElement = document.getElementById('game-status');
    // console.log('statusElement:', statusElement);

    if (!statusElement) {
      const gameArea = document.querySelector('.game-page');
      if (gameArea) {
        statusElement = document.createElement('div');
        statusElement.id = 'game-status';
        statusElement.style.cssText = `
          position: absolute; 
          top: 10px; 
          left: 50%; 
          transform: translateX(-50%); 
          color: white; 
          font-size: 18px; 
          font-weight: bold; 
          z-index: 100;
          background: rgba(0,0,0,0.7);
          padding: 10px 20px;
          border-radius: 5px;
        `;
        gameArea.appendChild(statusElement);
        // console.log('Status element created');
      } else {
        console.warn('No game area found to create status element');
        return;
      }
    }
    statusElement.textContent = message;
  }

  public updateFromServer(gameState: ServerToClientEvents['game_state']) {
    this.ballX = gameState.ballX * this.canvasSizeRatioX;
    this.ballY = gameState.ballY * this.canvasSizeRatioY;

    if (this.isPlayer1) {
      // Owner (Player 1)
      this.playerY = gameState.paddle1Y * this.canvasSizeRatioY;
      this.opponentY = gameState.paddle2Y * this.canvasSizeRatioY;
      this.playerScore = gameState.ownerScore;
      this.opponentScore = gameState.guestScore;
    } else {
      // Guest (Player 2)
      this.playerY = gameState.paddle2Y * this.canvasSizeRatioY;
      this.opponentY = gameState.paddle1Y * this.canvasSizeRatioY;
      this.playerScore = gameState.guestScore;
      this.opponentScore = gameState.ownerScore;
    }
    console.debug(`game_state received: ${gameState}`);
    this.draw();
  }

  public handleGameStart(message: any) {
    // console.log('Game start received:', message);
    // console.log('Canvas element:', this.canvas);
    // console.log('Is Owner:', message.isOwner);
    // console.log('Owner info:', message.owner);
    // console.log('Guest info:', message.guest);
    // console.log('Message.owner.nickname:', message.owner.nickname);
    // console.log('Message.guest.nickname:', message.guest.nickname);

    if (this.countdownInterval) {
      // console.log('Countdown already running, ignoring duplicate game start');
      return;
    }

    if (this.gameRunning) {
      // console.log('Game already running, stopping first');
      this.stop();
    }

    // Test: Prüfe Socket Listener
    const socket = this.socketManager?.getSocket();
    console.debug('Socket listeners:', socket?.listeners('game_state'));
    console.debug('Socket connected:', socket?.connected);

    if (this.gameRunning) this.stop();
    this.gameRunning = false;

    if (!this.canvas || !this.ctx) {
      console.error('Canvas or context not available for game start');
      return;
    }

    // Ensure canvas is visible
    this.canvas.style.display = 'block';
    this.canvas.style.visibility = 'visible';

    // console.log('Canvas visibility set to visible');

    this.isPlayer1 = message.isOwner;
    this.roomId = message.roomId;

    if (message.isOwner) {
      this.myNickname = message.owner.nickname;
      this.opponentNickname = message.guest.nickname;
    } else {
      this.myNickname = message.guest.nickname;
      this.opponentNickname = message.owner.nickname;
    }
    document.getElementById('game-nick')!.textContent = message.owner.nickname;
    document.getElementById('game-nick2')!.textContent = message.guest.nickname;

    // console.log(`I am ${this.isPlayer1 ? 'Player 1 (Owner)' : 'Player 2 (Guest)'}`);
    // console.log(`My nickname: ${this.myNickname}`);
    // console.log(`Opponent nickname: ${this.opponentNickname}`);
    // console.log('Owner nickname (left):', message.owner.nickname);
    // console.log('Guest nickname (right):', message.guest.nickname);

    // Kontrol bilgisini göster
    this.updateStatus(
      `You are playing on the ${this.isPlayer1 ? 'left with W/S keys' : 'right with arrow keys'}. Game starting!`
    );

    // Sayfa geçişi
    //   document.querySelector('.multiplayer-lobby')?.classList.add('hidden');
    //   document.querySelector('.game-page')?.classList.remove('hidden');
    navigateTo('/game');
    showPage(gamePage);

    this.startCountdown();
  }

  private countdownInterval?: NodeJS.Timeout;

  private startCountdown() {
    if (this.countdownInterval) {
      // console.log('Countdown already active');
      return;
    }
    let countdown = 5;
    this.announce_match(this.myNickname, this.opponentNickname);

    // Clear any existing countdown
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    this.countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        this.updateStatus(`Game starting in ${countdown} seconds...`);
      } else {
        this.updateStatus('Game started! Good luck!');
        clearInterval(this.countdownInterval!);
        this.countdownInterval = undefined;

        if (!this.gameRunning) {
          // console.log('Starting game after countdown');
          // this.gameRunning = true;
          this.start();
        } else {
          // console.log('Game already running, skipping start');
        }
      }
    }, 1000);
  }

  private announce_match(owner: string, guest: string) {
    this.updateStatus(`Next Match: ${owner} vs ${guest}`);
    // console.log('Tournament match announcement:', { owner, guest });
    // alert(`Next Match: ${owner} vs ${guest}`);
    // Optional: Clear the message after a few seconds
    // setTimeout(() => {
    //   this.updateStatus('');
    // }, 3000);
  }

  public handleRoomTerminated() {
    console.warn('Room terminated, returning to lobby');
    this.stop();
    this.returnToNewGamePage();
    alert('Room was terminated by server');
  }

  public handleGameOver(message: any) {
    this.gameRunning = false;
    // console.log('Game over message:', message);
    // console.log('Game over. Winner:', message.winner);
    // console.log(`myNickname = ${this.myNickname}, opponentNick = ${this.opponentNickname}`);
    this.drawGameOver(message.winner);
  }

  public matchEnd(message: any) {
    this.gameRunning = false;
    // console.log('Match end message:', message);
    // console.log('Winner:', message.winnerName);
    this.drawMatchOver(message.winnerName);
  }

  public handleOpponentDisconnected() {
    this.updateStatus('Opponent disconnected');
    setTimeout(() => {
      this.gameRunning = false;
      this.updateStatus('Game ended due to opponent disconnect');
      this.returnToNewGamePage();
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

    const paddleRadius = 8 * this.canvasSizeRatio;

    // Kendi paddle'ımız
    this.ctx.fillStyle = this.isPlayer1 ? '#ff00ff' : '#00ffff';
    const myPaddleX = this.isPlayer1
      ? 10 * this.canvasSizeRatioX
      : this.canvas.width - 25 * this.canvasSizeRatioX;
    this.drawRoundedRect(
      myPaddleX,
      this.playerY,
      this.paddleWidth,
      this.paddleHeight,
      paddleRadius
    );

    // Rakip paddle'ı
    this.ctx.fillStyle = this.isPlayer1 ? '#00ffff' : '#ff00ff';
    const opponentPaddleX = this.isPlayer1
      ? this.canvas.width - 25 * this.canvasSizeRatioX
      : 10 * this.canvasSizeRatioX;
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
    this.ctx.arc(this.ballX, this.ballY, this.ballRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // SKORLARI GÜNCELLE - Sol: Ben, Sağ: Rakip
    if (this.isPlayer1) {
      // Owner: kendi skor solda, rakip sağda
      document.getElementById('score')!.textContent = this.playerScore.toString();
      document.getElementById('score2')!.textContent = this.opponentScore.toString();
    } else {
      // Guest: kendi skor sağda, rakip solda
      document.getElementById('score')!.textContent = this.opponentScore.toString();
      document.getElementById('score2')!.textContent = this.playerScore.toString();
    }
  }

  private handlePaddleMovement() {
    // console.debug('Handling paddle movement');
    if (this.isPaused) {
      return;
    }
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
      this.returnToNewGamePage();
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
    this.updateStatus(null)
    this.gameRunning = true;
    this.lastTimeStamp = performance.now();
    this.lastPaddleUpdate = performance.now();
    this.animationId = requestAnimationFrame(this.gameLoop);
    // console.log('Game started');
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
    this.socketManager?.setGamePauseState(true);
    setTimeout(() => this.updateStatus(null), 1000);
  }

  public resume() {
    if (!this.isPaused) return;

    this.isPaused = false;
    this.gameRunning = true;
    this.lastTimeStamp = performance.now();
    this.animationId = requestAnimationFrame(this.gameLoop);
    this.updateStatus('Game resumed');
    this.socketManager?.setGamePauseState(false);
    setTimeout(() => this.updateStatus(null), 1000); 
  }

  private gameLoop = (timestamp: number) => {
    // console.debug(`Game loop running: ${this.gameRunning}`);
    if (!this.gameRunning) return;
    if (timestamp - this.lastPaddleUpdate >= this.paddleUpdateInterval) {
      this.lastPaddleUpdate = timestamp;

      this.handlePaddleMovement();
    }
    if (!this.isPaused) {
      if (timestamp - this.lastPaddleUpdate >= this.paddleUpdateInterval) {
        this.lastPaddleUpdate = timestamp;
        this.handlePaddleMovement();
      }
    }
    if (this.gameRunning) {
      requestAnimationFrame(this.gameLoop);
    }
  };

  public stop() {
    this.gameRunning = false;
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = undefined;
      // console.log('Countdown stopped');
    }
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}
