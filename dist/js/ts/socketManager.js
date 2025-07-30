import { io } from 'socket.io-client';
export class SocketManager {
    constructor() {
        this.gameInstance = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.pendingResolve = null;
        this.onGameStart = null;
    }
    static getInstance() {
        if (!SocketManager.instance) {
            SocketManager.instance = new SocketManager();
        }
        return SocketManager.instance;
    }
    connect() {
        return new Promise((resolve, reject) => {
            const token = localStorage.getItem('authToken');
            if (!token)
                return reject(new Error('No authentication token found'));
            this.socket = io(`https://${window.location.hostname}:3000`, {
                path: '/socket.io',
                auth: { token },
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: this.reconnectDelay,
            });
            this.socket.on('connect', () => {
                var _a;
                console.log('Socket connected:', (_a = this.socket) === null || _a === void 0 ? void 0 : _a.id);
                this.reconnectAttempts = 0;
                resolve();
            });
            this.socket.on('connect_error', (error) => reject(error));
            this.socket.on('disconnect', () => {
                console.warn('Socket disconnected');
                this.handleReconnection();
            });
            this.socket.on('game_start', (message) => {
                console.log('Game start received:', message);
                if (this.gameInstance) {
                    this.gameInstance.handleGameStart(message);
                }
                if (this.onGameStart) {
                    this.onGameStart(message);
                }
            });
            this.socket.on('game_over', (message) => {
                var _a;
                console.log('Game over:', message);
                (_a = this.gameInstance) === null || _a === void 0 ? void 0 : _a.handleGameOver(message);
            });
            this.socket.on('game_aborted', (message) => { var _a; return (_a = this.gameInstance) === null || _a === void 0 ? void 0 : _a.handleRoomTerminated(); });
            this.socket.on('game_state', (state) => {
                console.log('Game state update:', state);
            });
            this.socket.on('joined_room', (data) => {
                console.log('Joined room:', data);
                if (this.pendingResolve) {
                    this.pendingResolve(data.roomId);
                    this.pendingResolve = null;
                }
            });
            this.socket.on('join_error', (error) => {
                console.error('Join error:', error.message);
                if (this.pendingResolve) {
                    this.pendingResolve('');
                    this.pendingResolve = null;
                }
            });
            this.socket.on('create_error', (error) => {
                console.error('Create error:', error.message);
                if (this.pendingResolve) {
                    this.pendingResolve('');
                    this.pendingResolve = null;
                }
            });
            this.socket.on('room_created', (data) => {
                console.log('Room created:', data);
                if (this.pendingResolve) {
                    this.pendingResolve(data.roomId);
                    this.pendingResolve = null;
                }
            });
        });
    }
    handleReconnection() {
        var _a;
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.warn(`Reconnecting... Attempt ${this.reconnectAttempts}`);
            setTimeout(() => {
                var _a;
                (_a = this.socket) === null || _a === void 0 ? void 0 : _a.connect();
            }, this.reconnectDelay);
        }
        else {
            console.error('Max reconnection attempts reached. Please refresh the page.');
            (_a = this.gameInstance) === null || _a === void 0 ? void 0 : _a.handleConnectionLost();
        }
    }
    createRoom() {
        return new Promise((resolve, reject) => {
            var _a;
            if (!((_a = this.socket) === null || _a === void 0 ? void 0 : _a.connected)) {
                return reject(new Error('Socket not connected'));
            }
            const timeout = setTimeout(() => {
                reject(new Error('Room creation timeout'));
            }, 10000);
            this.socket.once('room_created', (msg) => {
                var _a;
                clearTimeout(timeout);
                if (msg.success) {
                    resolve(msg.roomId);
                }
                else {
                    reject(new Error((_a = msg.message) !== null && _a !== void 0 ? _a : 'Unknown error'));
                }
            });
            this.socket.once('create_error', (err) => {
                clearTimeout(timeout);
                reject(new Error(err.message));
            });
            this.socket.emit('create_room');
            console.log('[Client] create_room emitted');
        });
    }
    joinRoom(roomId) {
        return new Promise((resolve, reject) => {
            var _a;
            if (!((_a = this.socket) === null || _a === void 0 ? void 0 : _a.connected)) {
                return reject(new Error('Socket not connected'));
            }
            this.pendingResolve = resolve;
            this.socket.emit('join_room', { roomId });
            console.log('[Client] join_room emitted');
        });
    }
    leaveRoom() {
        var _a;
        if ((_a = this.socket) === null || _a === void 0 ? void 0 : _a.connected) {
            this.socket.emit('leave_room');
            console.log('[Client] leave_room emitted');
        }
        else {
            console.warn('Socket not connected, cannot leave room');
        }
    }
    paddleMove(yPos) {
        var _a;
        if ((_a = this.socket) === null || _a === void 0 ? void 0 : _a.connected) {
            this.socket.emit('paddle_move', { yPos });
            console.log('[Client] paddle_move emitted with yPos:', yPos);
        }
        else {
            console.warn('Socket not connected, cannot send paddle move');
        }
    }
    setGameInstance(gameInstance) {
        this.gameInstance = gameInstance;
        if (this.socket) {
            this.socket.on('game_start', (message) => {
                var _a;
                (_a = this.gameInstance) === null || _a === void 0 ? void 0 : _a.handleGameStart(message);
            });
            this.socket.on('game_over', (message) => {
                var _a;
                (_a = this.gameInstance) === null || _a === void 0 ? void 0 : _a.handleGameOver(message);
            });
            this.socket.on('game_aborted', () => {
                var _a;
                (_a = this.gameInstance) === null || _a === void 0 ? void 0 : _a.handleRoomTerminated();
            });
        }
    }
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = undefined;
            console.log('Socket disconnected');
        }
        else {
            console.warn('Socket already disconnected or not initialized');
        }
    }
    isConnected() {
        var _a, _b;
        return (_b = (_a = this.socket) === null || _a === void 0 ? void 0 : _a.connected) !== null && _b !== void 0 ? _b : false;
    }
    getSocket() {
        return this.socket;
    }
    getSocketId() {
        var _a;
        return (_a = this.socket) === null || _a === void 0 ? void 0 : _a.id;
    }
    getGameInstance() {
        return this.gameInstance;
    }
}
//# sourceMappingURL=socketManager.js.map