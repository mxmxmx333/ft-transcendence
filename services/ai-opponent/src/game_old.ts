import { HybridAISystem } from './hybrid_ai_system';

export enum Action {
  Up = 0,
  Stay = 1,
  Down = 2,
}

export interface Constants {
  readonly INITIAL_BALL_SPEED: number;
  //savedBallSpeed: number;
  readonly MAX_BALL_SPEED: number;
  readonly BALL_ACCELERATION: number;
  //ballSpeed: number;
  readonly aiSpeed: number;
  readonly aiErrorMargin: number;
  readonly paddleHeight: number;
  readonly paddleWidth: number;
  paddleCenter: number;
  readonly ballRadius: number;
  readonly winningScore: number;
  playableHeight: number;
}

export const DEFAULT_CONSTANTS: Constants = {
  INITIAL_BALL_SPEED: 5,
  MAX_BALL_SPEED: 18,
  BALL_ACCELERATION: 0.2,
  aiSpeed: 3,
  aiErrorMargin: 20,
  paddleHeight: 100,
  paddleWidth: 15,
  paddleCenter: 50,
  ballRadius: 10,
  winningScore: 10,
  playableHeight: 600,
};

export class PongGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameRunning = false;
  private animationId!: number;
  private playerScore = 0;
  private playerScore2 = 0;
  private isPaused = false;
  private gameOver = false;

  // Game state
  private playerY = 250;
  private aiY = 250;
  private ballX = 400;
  private ballY = 300;
  private ballVX = 5;
  private ballVY = 3;
  private upPressed = false;
  private downPressed = false;
  private lastAIMove = 0;
  private AITargetY = 0;

  // Constants
  private constants: Constants;
  private savedBallSpeed: number = 0;
  private ballSpeed: number = 0;
  private aiSystem!: HybridAISystem;

  constructor(canvas: HTMLCanvasElement, constants: Constants = DEFAULT_CONSTANTS) {
    this.canvas = canvas;
    this.constants = constants;
    this.constants.paddleCenter = this.constants.paddleHeight / 2;
    this.ctx = canvas.getContext('2d')!;
    this.savedBallSpeed = this.constants.INITIAL_BALL_SPEED;
    this.ballSpeed = this.constants.INITIAL_BALL_SPEED;
    this.aiSystem = new HybridAISystem(this.constants);
    this.init();
  }

  private init() {
    this.setupCanvas();
    this.setupControls();
    this.setupUI();
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
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.resizeCanvas(), 300);
    });
    this.constants.playableHeight = this.canvas.height - this.constants.paddleHeight;
  }

  private resizeCanvas() {
    this.setupCanvas();
    this.resetBall();
  }
  private setupControls() {
    document.removeEventListener('keydown', this.keyDownHandler);
    document.removeEventListener('keyup', this.keyUpHandler);

    // Keyboard controls
    this.keyDownHandler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') this.upPressed = true;
      else if (e.key === 'ArrowDown') this.downPressed = true;
    };

    this.keyUpHandler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') this.upPressed = false;
      if (e.key === 'ArrowDown') this.downPressed = false;
    };

    document.addEventListener('keydown', this.keyDownHandler);
    document.addEventListener('keyup', this.keyUpHandler);

    // Touch controls for mobile
    const upBtn = document.getElementById('up-btn');
    const downBtn = document.getElementById('down-btn');

    if (upBtn && downBtn) {
      // Touch events
      const handleTouchStart = (direction: 'up' | 'down') => (e: TouchEvent) => {
        e.preventDefault();
        if (direction === 'up') this.upPressed = true;
        else this.downPressed = true;
      };

      const handleTouchEnd = (direction: 'up' | 'down') => (e: TouchEvent) => {
        e.preventDefault();
        if (direction === 'up') this.upPressed = false;
        else this.downPressed = false;
      };

      upBtn.addEventListener('touchstart', handleTouchStart('up'));
      upBtn.addEventListener('touchend', handleTouchEnd('up'));
      downBtn.addEventListener('touchstart', handleTouchStart('down'));
      downBtn.addEventListener('touchend', handleTouchEnd('down'));

      // UpDown mod
      const checkOrientation = () => {
        const isPortrait = window.matchMedia('(orientation: portrait)').matches;
        const controls = document.querySelector('.mobile-controls');
        if (controls) {
          controls.classList.toggle('hidden', !isPortrait);
        }
      };

      checkOrientation();
      window.addEventListener('orientationchange', checkOrientation);
    }
  }

  private keyDownHandler: (e: KeyboardEvent) => void = () => {};
  private keyUpHandler: (e: KeyboardEvent) => void = () => {};

  private async setupUI() {
    const scoreDisplay = document.getElementById('score')!;
    const nicknameDisplay = document.getElementById('game-nick')!;
    const scoreDisplay2 = document.getElementById('score2')!;
    const nicknameDisplay2 = document.getElementById('game-nick2')!;
    nicknameDisplay2.textContent = 'AI';

    const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
    const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;

    try {
      const user = await this.fetchCurrentUser();
      if (user) {
        nicknameDisplay.textContent = user.nickname;
      }
    } catch (error) {
      console.error('Could not find the user:', error);
      nicknameDisplay.textContent = 'Player';
    }
    startBtn.addEventListener('click', () => {
      if (!this.gameRunning || this.gameOver) {
        this.resetGame();
        this.gameRunning = true;
        this.isPaused = false;
        this.gameOver = false;
        this.draw();
      } else if (this.isPaused) {
        this.isPaused = false;
        this.ballSpeed = this.savedBallSpeed;
      }
    });

    pauseBtn.addEventListener('click', () => {
      if (this.gameRunning && !this.isPaused) {
        this.isPaused = true;
        this.savedBallSpeed = this.ballSpeed;
      }
    });
  }
  private async fetchCurrentUser(): Promise<{ nickname: string } | null> {
    const token = localStorage.getItem('authToken');
    if (!token) return null;

    try {
      const response = await fetch('/api/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
          // 'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load profile!');
      }

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  private resetGame() {
    this.playerScore = 0;
    this.playerScore2 = 0;
    this.gameOver = false;
    document.getElementById('score')!.textContent = '0';
    document.getElementById('score2')!.textContent = '0';
    this.playerY = this.canvas.height / 2 - this.constants.paddleHeight / 2;
    this.aiY = this.canvas.height / 2 - this.constants.paddleHeight / 2;
    this.AITargetY = this.aiY;
    this.lastAIMove = 0;
    this.resetBall();

    const gameState = {
      ballX: this.ballX, ballY: this.ballY, ballVX: this.ballVX, ballVY: this.ballVY,
      aiY: this.aiY, playerY: this.playerY,
      canvasWidth: this.canvas.width, canvasHeight: this.canvas.height,
      ballSpeed: this.ballSpeed, gameTime: performance.now()
    };
    const aiAction = this.aiSystem.getAction(gameState);
    if (aiAction === Action.Up) {
      this.AITargetY = Math.max(0, this.aiY - 50);
    } else if (aiAction === Action.Down) {
      this.AITargetY = Math.min(this.canvas.height - this.constants.paddleHeight, this.aiY + 50);
    } else {
      this.AITargetY = this.aiY;
    }
  }

  private resetBall(scoredByFirstPlayer = true) {
    this.ballX = this.canvas.width / 2;
    this.ballY = this.canvas.height / 2;
    this.ballSpeed = scoredByFirstPlayer ? this.constants.INITIAL_BALL_SPEED : this.savedBallSpeed;

    const angle = (Math.random() * Math.PI) / 3 - Math.PI / 6;
    this.ballVX = this.ballSpeed * Math.cos(angle) * (scoredByFirstPlayer ? 1 : -1);
    this.ballVY = this.ballSpeed * Math.sin(angle);
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
      'The re-Game will start in 2 second',
      this.canvas.width / 2,
      this.canvas.height / 2 + 80
    );
    setTimeout(() => {
      this.resetGame();
    }, 2000);
  }

  private draw() {
    if (!this.gameRunning) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.isPaused && !this.gameOver) {
      // net
      this.ctx.strokeStyle = '#ffff00';
      this.ctx.setLineDash([10, 10]);
      this.ctx.beginPath();
      this.ctx.moveTo(this.canvas.width / 2, 0);
      this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      // paddles
      const paddleRadius = 8;
      this.ctx.fillStyle = '#ff00ff';
      this.drawRoundedRect(10, this.playerY, this.constants.paddleWidth, this.constants.paddleHeight, paddleRadius);

      this.ctx.fillStyle = '#00ffff';
      this.drawRoundedRect(
        this.canvas.width - 25,
        this.aiY,
        this.constants.paddleWidth,
        this.constants.paddleHeight,
        paddleRadius
      );

      // ball
      this.ctx.fillStyle = '#ffff00';
      this.ctx.beginPath();
      this.ctx.arc(this.ballX, this.ballY, this.constants.ballRadius, 0, Math.PI * 2);
      this.ctx.fill();

      this.updateGameState();
    } else if (this.gameOver) {
      this.drawGameOver(this.playerScore === this.constants.winningScore ? 'YOU' : 'AI');
    }

    this.animationId = requestAnimationFrame(() => this.draw());
  }

  private updateGameState() {
    if (this.isPaused || this.gameOver) return;

    // Ball movement
    this.ballX += this.ballVX;
    this.ballY += this.ballVY;

    // Paddle coll.
    const ballHitsPlayerPaddle =
      this.ballX - this.constants.ballRadius <= 25 &&
      this.ballY >= this.playerY &&
      this.ballY <= this.playerY + this.constants.paddleHeight;

    const ballHitsAIPaddle =
      this.ballX + this.constants.ballRadius >= this.canvas.width - 25 &&
      this.ballY >= this.aiY &&
      this.ballY <= this.aiY + this.constants.paddleHeight;

    // ball speed
    if (ballHitsPlayerPaddle || ballHitsAIPaddle) {
      this.ballSpeed = Math.min(this.ballSpeed + this.constants.BALL_ACCELERATION, this.constants.MAX_BALL_SPEED);
      const angle = (Math.random() * Math.PI) / 6 - Math.PI / 12; // -15° ile +15° arası

      const direction = ballHitsPlayerPaddle ? 1 : -1;

      this.ballVX = this.ballSpeed * Math.cos(angle) * direction;
      this.ballVY = this.ballSpeed * Math.sin(angle);
    }

    // Scores
    if (this.ballX - this.constants.ballRadius > this.canvas.width) {
      this.playerScore++;
      document.getElementById('score')!.textContent = this.playerScore.toString();
      if (this.playerScore >= this.constants.winningScore) {
        this.gameOver = true;
        this.aiSystem.onGameEnd(); // <-- Event an AI
        return;
      }
      this.aiSystem.onPlayerScore(); // <-- Event an AI
      this.resetBall(true);
      return;
    }

    if (this.ballX + this.constants.ballRadius < 0) {
      this.playerScore2++;
      document.getElementById('score2')!.textContent = this.playerScore2.toString();
      if (this.playerScore2 >= this.constants.winningScore) {
        this.gameOver = true;
        this.aiSystem.onGameEnd(); // <-- Event an AI
        return;
      }
      this.aiSystem.onAIScore(); // <-- Event an AI
      this.resetBall(false);
      return;
    }

    // Wall collision
    if (this.ballY - this.constants.ballRadius <= 0 || this.ballY + this.constants.ballRadius >= this.canvas.height) {
      this.ballVY *= -1;
    }

    // ai moves
    const now = Date.now();
    if (now - this.lastAIMove > 1000) {
      const gameState = {
        ballX: this.ballX,
        ballY: this.ballY,
        ballVX: this.ballVX,
        ballVY: this.ballVY,
        aiY: this.aiY,
        playerY: this.playerY,
        canvasWidth: this.canvas.width,
        canvasHeight: this.canvas.height,
        ballSpeed: this.ballSpeed,
        gameTime: performance.now() // oder eigene Zeitvariable
      };

      const aiAction = this.aiSystem.getAction(gameState);

      // AI bewegt Paddle gemäß Aktion
      if (aiAction === Action.Up) {
        this.AITargetY = Math.max(0, this.aiY - 50); // nach oben
      } 
      else if (aiAction === Action.Down) {
        this.AITargetY = Math.min(this.canvas.height - this.constants.paddleHeight, this.aiY + 50); // nach unten
      } 
      else {
        this.AITargetY = this.aiY; // bleiben
      }

      /*const dt = (this.canvas.width - this.paddleWidth - this.ballX) / this.ballVX;
      if (dt > 0){
        let futureY = this.ballY + this.ballVY * dt;
        const H = this.canvas.height;
        const period = 2 * H;
      
        // Reflect for wall bounces
        futureY = ((futureY % period) + period) % period;
        if (futureY > H) 
          futureY = period - futureY;   
        const errorMargin = (Math.random() - 0.5) * 100;
        this.AITargetY = futureY - (this.paddleHeight / 2) - errorMargin;
      }*/
      this.lastAIMove = now;
    }
    if (this.aiY < this.AITargetY) {
      this.aiY = Math.min(this.aiY + this.constants.aiSpeed, this.AITargetY, this.canvas.height - this.constants.paddleHeight);
    } else if (this.aiY > this.AITargetY) {
      this.aiY = Math.max(this.aiY - this.constants.aiSpeed, this.AITargetY, 0);
    }

    // Player moves
    if (this.upPressed) {
      this.playerY = Math.max(0, this.playerY - 10);
    }
    if (this.downPressed) {
      this.playerY = Math.min(this.canvas.height - this.constants.paddleHeight, this.playerY + 10);
    }
  }

  public start() {
    if (!this.gameRunning) {
      this.resetGame();
      this.gameRunning = true;
      this.draw();
    }
  }

  public stop() {
    if (this.gameRunning) {
      cancelAnimationFrame(this.animationId);
      this.gameRunning = false;
      document.removeEventListener('keydown', this.keyDownHandler);
      document.removeEventListener('keyup', this.keyUpHandler);
    }
  }
}
