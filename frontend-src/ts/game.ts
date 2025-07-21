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
    
    // Constants
    private readonly INITIAL_BALL_SPEED = 5;
    private readonly MAX_BALL_SPEED = 18;
    private readonly BALL_ACCELERATION = 0.2;
    private ballSpeed = this.INITIAL_BALL_SPEED;
    private readonly aiSpeed = 1;
    private readonly aiErrorMargin = 20;
    private readonly paddleHeight = 100;
    private readonly paddleWidth = 15;
    private readonly ballRadius = 10;
    private readonly winningScore = 10;
    
    constructor(canvas: HTMLCanvasElement) { // Client parametresini kaldırdık
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.init();
    }

    private init() {
        this.setupCanvas();
        this.setupControls();
        this.setupUI();
    }

private setupCanvas() {
    // Sabit en-boy oranı (16:9) koruyarak canvas boyutlandırma
    const aspectRatio = 16 / 9;
    const maxWidth = 800;
    const maxHeight = 600;
    
    // Container boyutlarını al
    const container = this.canvas.parentElement;
    const containerWidth = container?.clientWidth || maxWidth;
    const containerHeight = container?.clientHeight || maxHeight;
    
    // Boyutları hesapla
    let width = Math.min(containerWidth, maxWidth);
    let height = width / aspectRatio;
    
    if (height > containerHeight) {
        height = containerHeight;
        width = height * aspectRatio;
    }
    
    // Canvas boyutlarını ayarla
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    
    // Yeniden boyutlandırma için event listener
    window.addEventListener("resize", () => this.resizeCanvas());
    window.addEventListener("orientationchange", () => {
        setTimeout(() => this.resizeCanvas(), 300);
    });
}

private resizeCanvas() {
    this.setupCanvas(); // Aynı mantıkla yeniden boyutlandır
    this.resetBall();
}
    private setupControls() {
        // Remove previous event listeners
        document.removeEventListener("keydown", this.keyDownHandler);
        document.removeEventListener("keyup", this.keyUpHandler);

        // Keyboard controls
        this.keyDownHandler = (e: KeyboardEvent) => {
            if (e.key === "ArrowUp") this.upPressed = true;
            else if (e.key === "ArrowDown") this.downPressed = true;
        };

        this.keyUpHandler = (e: KeyboardEvent) => {
            if (e.key === "ArrowUp") this.upPressed = false;
            if (e.key === "ArrowDown") this.downPressed = false;
        };

        document.addEventListener("keydown", this.keyDownHandler);
        document.addEventListener("keyup", this.keyUpHandler);

        // Touch controls for mobile
        const upBtn = document.getElementById("up-btn");
    const downBtn = document.getElementById("down-btn");

    if (upBtn && downBtn) {
        // Touch event'leri
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

        upBtn.addEventListener("touchstart", handleTouchStart('up'));
        upBtn.addEventListener("touchend", handleTouchEnd('up'));
        downBtn.addEventListener("touchstart", handleTouchStart('down'));
        downBtn.addEventListener("touchend", handleTouchEnd('down'));

        // Dikey mod için kontrolleri göster/gizle
        const checkOrientation = () => {
            const isPortrait = window.matchMedia("(orientation: portrait)").matches;
            const controls = document.querySelector(".mobile-controls");
            if (controls) {
                controls.classList.toggle("hidden", !isPortrait);
            }
        };

        checkOrientation();
        window.addEventListener("orientationchange", checkOrientation);
    }

    }

    private keyDownHandler: (e: KeyboardEvent) => void = () => {};
    private keyUpHandler: (e: KeyboardEvent) => void = () => {};

    private async setupUI() {
        const scoreDisplay = document.getElementById("score")!;
        const nicknameDisplay = document.getElementById("game-nick")!;
        const scoreDisplay2 = document.getElementById("score2")!;
        const nicknameDisplay2 = document.getElementById("game-nick2")!;
        nicknameDisplay2.textContent = "AI";


        const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
        const pauseBtn = document.getElementById("pause-btn") as HTMLButtonElement;

         try {
            // Database'den kullanıcı bilgilerini çek
            const user = await this.fetchCurrentUser();
            if (user) {
                nicknameDisplay.textContent = user.nickname;
            }
        } catch (error) {
            console.error("Kullanıcı bilgileri yüklenemedi:", error);
            nicknameDisplay.textContent = "Player";
        }
        startBtn.addEventListener("click", () => {
            if (!this.gameRunning || this.gameOver) {
                this.resetGame();
                this.gameRunning = true;
                this.isPaused = false;
                this.gameOver = false;
                this.draw();
            } else if (this.isPaused) {
                this.isPaused = false;
            }
        });

        pauseBtn.addEventListener("click", () => {
            if (this.gameRunning && !this.isPaused) {
                this.isPaused = true;
            }
        });
    }
    private async fetchCurrentUser(): Promise<{nickname: string} | null> {
        const token = localStorage.getItem('authToken');
        if (!token) return null;

        try {
            const response = await fetch('http://localhost:3000/api/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Profil bilgileri alınamadı');
            }

            return await response.json();
        } catch (error) {
            console.error("Kullanıcı bilgisi çekme hatası:", error);
            return null;
        }
    }

    private resetGame() {
        this.playerScore = 0;
        this.playerScore2 = 0;
        this.gameOver = false;
        document.getElementById("score")!.textContent = "0";
        document.getElementById("score2")!.textContent = "0";
        this.playerY = this.canvas.height / 2 - this.paddleHeight / 2;
        this.aiY = this.canvas.height / 2 - this.paddleHeight / 2;
        this.resetBall();
    }

 private resetBall(scoredByFirstPlayer = true) {
    this.ballX = this.canvas.width / 2;
    this.ballY = this.canvas.height / 2;
    this.ballSpeed = this.INITIAL_BALL_SPEED; // Hızı sıfırla
    
    const angle = (Math.random() * Math.PI/3) - Math.PI/6; // -30° ile +30° arası
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
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = "#ffffff";
        this.ctx.font = "bold 48px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText("GAME OVER", this.canvas.width/2, this.canvas.height/2 - 50);
        
        this.ctx.font = "bold 36px Arial";
        this.ctx.fillText(`${winner} WON`, this.canvas.width/2, this.canvas.height/2 + 20);
        
        this.ctx.font = "24px Arial";
        this.ctx.fillText("The re-Game will start in 1 second", this.canvas.width/2, this.canvas.height/2 + 80);
        setTimeout(() => {
        this.resetGame();
    }, 1000);
    }

    private draw() {
        if (!this.gameRunning) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.isPaused && !this.gameOver) {
            // Draw middle line
            this.ctx.strokeStyle = "#ffff00";
            this.ctx.setLineDash([10, 10]);
            this.ctx.beginPath();
            this.ctx.moveTo(this.canvas.width / 2, 0);
            this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            // Draw paddles
            const paddleRadius = 8;
            this.ctx.fillStyle = "#ff00ff";
            this.drawRoundedRect(10, this.playerY, this.paddleWidth, this.paddleHeight, paddleRadius);

            this.ctx.fillStyle = "#00ffff";
            this.drawRoundedRect(this.canvas.width - 25, this.aiY, this.paddleWidth, this.paddleHeight, paddleRadius);

            // Draw ball
            this.ctx.fillStyle = "#ffff00";
            this.ctx.beginPath();
            this.ctx.arc(this.ballX, this.ballY, this.ballRadius, 0, Math.PI * 2);
            this.ctx.fill();

            // Update game state
            this.updateGameState();
        } else if (this.gameOver) {
            this.drawGameOver(this.playerScore === this.winningScore ? "YOU" : "AI");
        }

        this.animationId = requestAnimationFrame(() => this.draw());
    }

    private updateGameState() {
    if (this.isPaused || this.gameOver) return;

    // Ball movement
    this.ballX += this.ballVX;
    this.ballY += this.ballVY;

    // Paddle çarpışma kontrolü
    const ballHitsPlayerPaddle = 
        this.ballX - this.ballRadius <= 25 && 
        this.ballY >= this.playerY && 
        this.ballY <= this.playerY + this.paddleHeight;

    const ballHitsAIPaddle = 
        this.ballX + this.ballRadius >= this.canvas.width - 25 && 
        this.ballY >= this.aiY && 
        this.ballY <= this.aiY + this.paddleHeight;

    // Paddle çarpışmalarında top hızını artır
    if (ballHitsPlayerPaddle || ballHitsAIPaddle) {
        this.ballSpeed = Math.min(this.ballSpeed + this.BALL_ACCELERATION, this.MAX_BALL_SPEED);
        const angle = (Math.random() * Math.PI/6) - Math.PI/12; // -15° ile +15° arası
        
        // Yönü belirle (player paddle'a çarptıysa sağa, AI paddle'a çarptıysa sola)
        const direction = ballHitsPlayerPaddle ? 1 : -1;
        
        this.ballVX = this.ballSpeed * Math.cos(angle) * direction;
        this.ballVY = this.ballSpeed * Math.sin(angle);
    }

    // Score handling
    if (this.ballX - this.ballRadius > this.canvas.width) {
        this.playerScore++;
        document.getElementById("score")!.textContent = this.playerScore.toString();
        if (this.playerScore >= this.winningScore) {
            this.gameOver = true;
            return;
        }
        this.resetBall(true);
        return;
    }

    if (this.ballX + this.ballRadius < 0) {
        this.playerScore2++;
        document.getElementById("score2")!.textContent = this.playerScore2.toString();
        if (this.playerScore2 >= this.winningScore) {
            this.gameOver = true;
            return;
        }
        this.resetBall(false);
        return;
    }

    // Wall collision
    if ((this.ballY - this.ballRadius <= 0) || (this.ballY + this.ballRadius >= this.canvas.height)) {
        this.ballVY *= -1;
    }

    // AI movement
    if (this.ballY > this.aiY + this.paddleHeight / 2 + this.aiErrorMargin) {
        this.aiY = Math.min(this.aiY + this.aiSpeed, this.canvas.height - this.paddleHeight);
    } else if (this.ballY < this.aiY + this.paddleHeight / 2 - this.aiErrorMargin) {
        this.aiY = Math.max(this.aiY - this.aiSpeed, 0);
    }

    // Player movement
    if (this.upPressed) {
        this.playerY = Math.max(0, this.playerY - 10);
    }
    if (this.downPressed) {
        this.playerY = Math.min(this.canvas.height - this.paddleHeight, this.playerY + 10);
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
            document.removeEventListener("keydown", this.keyDownHandler);
            document.removeEventListener("keyup", this.keyUpHandler);
        }
    }
}