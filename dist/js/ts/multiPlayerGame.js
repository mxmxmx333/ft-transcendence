var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { SocketManager } from './socketManager.js';
export class PongMultiplayer {
    constructor(canvas) {
        this.gameRunning = false;
        this.isPlayer1 = false;
        this.roomId = null;
        this.opponentNickname = 'Opponent';
        // Game state
        this.playerY = 250;
        this.opponentY = 250;
        this.ballX = 400;
        this.ballY = 300;
        this.playerScore = 0;
        this.opponentScore = 0;
        this.upPressed = false;
        this.downPressed = false;
        // Constants
        this.paddleHeight = 100;
        this.paddleWidth = 15;
        this.ballRadius = 10;
        this.winningScore = 10;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.init();
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            this.setupCanvas();
            this.setupControls();
            yield this.setupMultiplayerConnection();
            this.setupSocketListeners();
            this.setupUI();
        });
    }
    setupSocketListeners() {
        const socket = SocketManager.getInstance();
        socket.onGameStart = (msg) => {
            console.log('Game start triggered', msg);
            this.handleGameStart(msg);
            this.startGame();
        };
    }
    startGame() {
        if (!this.gameRunning) {
            this.gameRunning = true;
            this.draw();
        }
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
    }
    resizeCanvas() {
        this.setupCanvas();
    }
    setupControls() {
        // Keyboard
        const keyDownHandler = (e) => {
            if (e.key === 'ArrowUp')
                this.upPressed = true;
            else if (e.key === 'ArrowDown')
                this.downPressed = true;
        };
        const keyUpHandler = (e) => {
            if (e.key === 'ArrowUp')
                this.upPressed = false;
            if (e.key === 'ArrowDown')
                this.downPressed = false;
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
    setupMultiplayerConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const socketManager = SocketManager.getInstance();
                yield socketManager.connect();
                this.gameRunning = true;
                this.draw();
            }
            catch (error) {
                console.error('Connection failed:', error);
                this.updateStatus('Connection failed. Please try again.');
            }
        });
    }
    setupUI() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield fetch('/api/profile', {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('authToken')}`,
                        'Content-Type': 'application/json',
                    },
                });
                if (response.ok) {
                    const user = yield response.json();
                    document.getElementById('game-nick').textContent = user.nickname;
                }
            }
            catch (error) {
                console.error('Failed to fetch user profile:', error);
                document.getElementById('game-nick').textContent = 'Player';
            }
            document.getElementById('game-nick2').textContent = 'Waiting...';
        });
    }
    updateStatus(message) {
        const statusElement = document.getElementById('game-status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }
    updateFromServer(gameState) {
        this.ballX = gameState.ballX;
        this.ballY = gameState.ballY;
        this.playerScore = gameState.player1Score;
        this.opponentScore = gameState.player2Score;
        if (this.isPlayer1) {
            this.opponentY = gameState.paddle2Y;
        }
        else {
            this.opponentY = gameState.paddle1Y;
        }
    }
    handleGameStart(message) {
        var _a, _b;
        console.log('Game start received:', message);
        if (this.gameRunning)
            this.stop();
        this.isPlayer1 = message.isPlayer1;
        this.roomId = message.roomId;
        this.opponentNickname = message.opponent;
        document.getElementById('game-nick2').textContent = this.opponentNickname;
        (_a = document.querySelector('.multiplayer-lobby')) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
        (_b = document.querySelector('.game-page')) === null || _b === void 0 ? void 0 : _b.classList.remove('hidden');
        this.start();
    }
    handleRoomTerminated() {
        var _a, _b;
        console.warn('Room terminated, returning to lobby');
        this.stop();
        (_a = document.querySelector('.game-page')) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
        (_b = document.querySelector('.multiplayer-lobby')) === null || _b === void 0 ? void 0 : _b.classList.remove('hidden');
        alert('Room was terminated by server');
    }
    handleGameOver(message) {
        this.gameRunning = false;
        this.drawGameOver(message.winner === (this.isPlayer1 ? 'player1' : 'player2') ? 'YOU' : this.opponentNickname);
    }
    handleOpponentDisconnected() {
        this.updateStatus('Opponent disconnected');
        setTimeout(() => {
            this.gameRunning = false;
            this.updateStatus('Game ended due to opponent disconnect');
        }, 2000);
    }
    handleConnectionLost() {
        this.gameRunning = false;
        this.updateStatus('Connection lost. Trying to reconnect...');
    }
    draw() {
        if (!this.gameRunning)
            return;
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
        this.drawRoundedRect(playerPaddleX, this.playerY, this.paddleWidth, this.paddleHeight, paddleRadius);
        this.ctx.fillStyle = this.isPlayer1 ? '#00ffff' : '#ff00ff';
        const opponentPaddleX = this.isPlayer1 ? this.canvas.width - 25 : 10;
        this.drawRoundedRect(opponentPaddleX, this.opponentY, this.paddleWidth, this.paddleHeight, paddleRadius);
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
        SocketManager.getInstance().paddleMove(this.playerY);
        // scores
        document.getElementById('score').textContent = this.playerScore.toString();
        document.getElementById('score2').textContent = this.opponentScore.toString();
        this.animationId = requestAnimationFrame(() => this.draw());
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
        this.ctx.fillText('Click start to play again', this.canvas.width / 2, this.canvas.height / 2 + 80);
        this.canvas.onclick = () => {
            this.canvas.onclick = null;
            this.resetGame();
        };
    }
    resetGame() {
        this.playerScore = 0;
        this.opponentScore = 0;
        document.getElementById('score').textContent = '0';
        document.getElementById('score2').textContent = '0';
        this.playerY = this.canvas.height / 2 - this.paddleHeight / 2;
        this.gameRunning = true;
        this.draw();
    }
    start() {
        this.gameRunning = true;
        this.draw();
    }
    stop() {
        this.gameRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        SocketManager.getInstance().disconnect();
    }
}
//# sourceMappingURL=multiPlayerGame.js.map