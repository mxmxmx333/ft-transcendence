var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class PongGame {
    constructor(canvas) {
        this.gameRunning = false;
        this.playerScore = 0;
        this.playerScore2 = 0;
        this.isPaused = false;
        this.gameOver = false;
        // Game state
        this.playerY = 250;
        this.aiY = 250;
        this.ballX = 400;
        this.ballY = 300;
        this.ballVX = 5;
        this.ballVY = 3;
        this.upPressed = false;
        this.downPressed = false;
        // Constants
        this.INITIAL_BALL_SPEED = 5;
        this.savedBallSpeed = this.INITIAL_BALL_SPEED;
        this.MAX_BALL_SPEED = 18;
        this.BALL_ACCELERATION = 0.2;
        this.ballSpeed = this.INITIAL_BALL_SPEED;
        this.aiSpeed = 1;
        this.aiErrorMargin = 20;
        this.paddleHeight = 100;
        this.paddleWidth = 15;
        this.ballRadius = 10;
        this.winningScore = 10;
        this.keyDownHandler = () => { };
        this.keyUpHandler = () => { };
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.init();
    }
    init() {
        this.setupCanvas();
        this.setupControls();
        this.setupUI();
    }
    setupCanvas() {
        const aspectRatio = 16 / 9;
        const maxWidth = 800;
        const maxHeight = 600;
        const container = this.canvas.parentElement;
        const containerWidth = (container === null || container === void 0 ? void 0 : container.clientWidth) || maxWidth;
        const containerHeight = (container === null || container === void 0 ? void 0 : container.clientHeight) || maxHeight;
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
    }
    resizeCanvas() {
        this.setupCanvas();
        this.resetBall();
    }
    setupControls() {
        document.removeEventListener('keydown', this.keyDownHandler);
        document.removeEventListener('keyup', this.keyUpHandler);
        // Keyboard controls
        this.keyDownHandler = (e) => {
            if (e.key === 'ArrowUp')
                this.upPressed = true;
            else if (e.key === 'ArrowDown')
                this.downPressed = true;
        };
        this.keyUpHandler = (e) => {
            if (e.key === 'ArrowUp')
                this.upPressed = false;
            if (e.key === 'ArrowDown')
                this.downPressed = false;
        };
        document.addEventListener('keydown', this.keyDownHandler);
        document.addEventListener('keyup', this.keyUpHandler);
        // Touch controls for mobile
        const upBtn = document.getElementById('up-btn');
        const downBtn = document.getElementById('down-btn');
        if (upBtn && downBtn) {
            // Touch events
            const handleTouchStart = (direction) => (e) => {
                e.preventDefault();
                if (direction === 'up')
                    this.upPressed = true;
                else
                    this.downPressed = true;
            };
            const handleTouchEnd = (direction) => (e) => {
                e.preventDefault();
                if (direction === 'up')
                    this.upPressed = false;
                else
                    this.downPressed = false;
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
    setupUI() {
        return __awaiter(this, void 0, void 0, function* () {
            const scoreDisplay = document.getElementById('score');
            const nicknameDisplay = document.getElementById('game-nick');
            const scoreDisplay2 = document.getElementById('score2');
            const nicknameDisplay2 = document.getElementById('game-nick2');
            nicknameDisplay2.textContent = 'AI';
            const startBtn = document.getElementById('start-btn');
            const pauseBtn = document.getElementById('pause-btn');
            try {
                const user = yield this.fetchCurrentUser();
                if (user) {
                    nicknameDisplay.textContent = user.nickname;
                }
            }
            catch (error) {
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
                }
                else if (this.isPaused) {
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
        });
    }
    fetchCurrentUser() {
        return __awaiter(this, void 0, void 0, function* () {
            const token = localStorage.getItem('authToken');
            if (!token)
                return null;
            try {
                const response = yield fetch('/api/profile', {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });
                if (!response.ok) {
                    throw new Error('Failed to load profile!');
                }
                return yield response.json();
            }
            catch (error) {
                return null;
            }
        });
    }
    resetGame() {
        this.playerScore = 0;
        this.playerScore2 = 0;
        this.gameOver = false;
        document.getElementById('score').textContent = '0';
        document.getElementById('score2').textContent = '0';
        this.playerY = this.canvas.height / 2 - this.paddleHeight / 2;
        this.aiY = this.canvas.height / 2 - this.paddleHeight / 2;
        this.resetBall();
    }
    resetBall(scoredByFirstPlayer = true) {
        this.ballX = this.canvas.width / 2;
        this.ballY = this.canvas.height / 2;
        this.ballSpeed = scoredByFirstPlayer ? this.INITIAL_BALL_SPEED : this.savedBallSpeed;
        const angle = (Math.random() * Math.PI) / 3 - Math.PI / 6;
        this.ballVX = this.ballSpeed * Math.cos(angle) * (scoredByFirstPlayer ? 1 : -1);
        this.ballVY = this.ballSpeed * Math.sin(angle);
    }
    drawRoundedRect(x, y, width, height, radius) {
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
    drawGameOver(winner) {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.font = 'bold 36px Arial';
        this.ctx.fillText(`${winner} WON`, this.canvas.width / 2, this.canvas.height / 2 + 20);
        this.ctx.font = '24px Arial';
        this.ctx.fillText('The re-Game will start in 2 second', this.canvas.width / 2, this.canvas.height / 2 + 80);
        setTimeout(() => {
            this.resetGame();
        }, 2000);
    }
    draw() {
        if (!this.gameRunning)
            return;
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
            this.drawRoundedRect(10, this.playerY, this.paddleWidth, this.paddleHeight, paddleRadius);
            this.ctx.fillStyle = '#00ffff';
            this.drawRoundedRect(this.canvas.width - 25, this.aiY, this.paddleWidth, this.paddleHeight, paddleRadius);
            // ball
            this.ctx.fillStyle = '#ffff00';
            this.ctx.beginPath();
            this.ctx.arc(this.ballX, this.ballY, this.ballRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.updateGameState();
        }
        else if (this.gameOver) {
            this.drawGameOver(this.playerScore === this.winningScore ? 'YOU' : 'AI');
        }
        this.animationId = requestAnimationFrame(() => this.draw());
    }
    updateGameState() {
        if (this.isPaused || this.gameOver)
            return;
        // Ball movement
        this.ballX += this.ballVX;
        this.ballY += this.ballVY;
        // Paddle coll.
        const ballHitsPlayerPaddle = this.ballX - this.ballRadius <= 25 &&
            this.ballY >= this.playerY &&
            this.ballY <= this.playerY + this.paddleHeight;
        const ballHitsAIPaddle = this.ballX + this.ballRadius >= this.canvas.width - 25 &&
            this.ballY >= this.aiY &&
            this.ballY <= this.aiY + this.paddleHeight;
        // ball speed
        if (ballHitsPlayerPaddle || ballHitsAIPaddle) {
            this.ballSpeed = Math.min(this.ballSpeed + this.BALL_ACCELERATION, this.MAX_BALL_SPEED);
            const angle = (Math.random() * Math.PI) / 6 - Math.PI / 12; // -15° ile +15° arası
            const direction = ballHitsPlayerPaddle ? 1 : -1;
            this.ballVX = this.ballSpeed * Math.cos(angle) * direction;
            this.ballVY = this.ballSpeed * Math.sin(angle);
        }
        // Scores
        if (this.ballX - this.ballRadius > this.canvas.width) {
            this.playerScore++;
            document.getElementById('score').textContent = this.playerScore.toString();
            if (this.playerScore >= this.winningScore) {
                this.gameOver = true;
                return;
            }
            this.resetBall(true);
            return;
        }
        if (this.ballX + this.ballRadius < 0) {
            this.playerScore2++;
            document.getElementById('score2').textContent = this.playerScore2.toString();
            if (this.playerScore2 >= this.winningScore) {
                this.gameOver = true;
                return;
            }
            this.resetBall(false);
            return;
        }
        // Wall collision
        if (this.ballY - this.ballRadius <= 0 || this.ballY + this.ballRadius >= this.canvas.height) {
            this.ballVY *= -1;
        }
        // basic ai moves
        if (this.ballY > this.aiY + this.paddleHeight / 2 + this.aiErrorMargin) {
            this.aiY = Math.min(this.aiY + this.aiSpeed, this.canvas.height - this.paddleHeight);
        }
        else if (this.ballY < this.aiY + this.paddleHeight / 2 - this.aiErrorMargin) {
            this.aiY = Math.max(this.aiY - this.aiSpeed, 0);
        }
        // Player moves
        if (this.upPressed) {
            this.playerY = Math.max(0, this.playerY - 10);
        }
        if (this.downPressed) {
            this.playerY = Math.min(this.canvas.height - this.paddleHeight, this.playerY + 10);
        }
    }
    start() {
        if (!this.gameRunning) {
            this.resetGame();
            this.gameRunning = true;
            this.draw();
        }
    }
    stop() {
        if (this.gameRunning) {
            cancelAnimationFrame(this.animationId);
            this.gameRunning = false;
            document.removeEventListener('keydown', this.keyDownHandler);
            document.removeEventListener('keyup', this.keyUpHandler);
        }
    }
}
//# sourceMappingURL=game.js.map