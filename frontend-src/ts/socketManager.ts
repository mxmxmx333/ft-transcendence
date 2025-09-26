import { PongGame } from './multiPlayerGame';
import type { GameStartPayload, ServerToClientEvents, ClientToServerEvents } from './types/socket-interfaces';
import { io, Socket } from 'socket.io-client';

export class SocketManager {
  private static instance: SocketManager;
  private socket?: Socket;
  private gameInstance: PongGame | null = null;
  
  // Reconnection settings
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 1000;
  private readonly roomOperationTimeout = 10_000;
  
  // Room operation handling
  private pendingResolve: ((roomId: string) => void) | null = null;

  private constructor() {}

  public onGameStart: ((payload: GameStartPayload) => void) | null = null;

  public static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      console.log('Creating new SocketManager instance');
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        return reject(new Error('No authentication token found'));
      }

      this.socket = this.createSocket(token);
      this.setupConnectionListeners(resolve, reject);
      this.setupGameEventListeners();
      this.setupRoomEventListeners();
    });
  }

  private createSocket(token: string): Socket {
    return io({
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      secure: true,
      rejectUnauthorized: false,
      withCredentials: true,
      upgrade: true,
      rememberUpgrade: true,
    });
  }

  private setupConnectionListeners(resolve: () => void, reject: (error: Error) => void): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
      resolve();
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('Connection error:', error);
      reject(error);
    });

    this.socket.on('disconnect', () => {
      console.warn('Socket disconnected');
      this.handleReconnection();
    });

    this.socket.on('error', (error: any) => {
      console.error('Socket error:', error);
    });
  }

  private setupGameEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('game_start', (payload: ServerToClientEvents['game_start']) => {
      console.log('Game start received:', payload);
      this.gameInstance?.handleGameStart(payload);
      this.onGameStart?.(payload);
    });

    this.socket.on('game_over', (message: ServerToClientEvents['game_over']) => {
      console.log('Game over:', message);
      this.gameInstance?.handleGameOver({ ...message });
    });

    this.socket.on('game_aborted', (message: { message: string }) => {
      console.log('Game aborted:', message);
      this.gameInstance?.handleRoomTerminated();
    });

    this.socket.on('game_state', (state: ServerToClientEvents['game_state']) => {
      this.gameInstance?.updateFromServer(state);
    });
  }

  private setupRoomEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('joined_room', (data: ServerToClientEvents['joined_room']) => {
      console.log('Joined room:', data);
      this.resolvePendingOperation(data.roomId);
    });

    this.socket.on('join_error', (error: ServerToClientEvents['join_error']) => {
      console.error('Join error:', error.message);
      alert(`Join error: ${error.message}`);
      this.resolvePendingOperation('');
    });

    this.socket.on('create_error', (error: ServerToClientEvents['create_error']) => {
      console.error('Create error:', error.message);
      alert(`Create error: ${error.message}`);
      this.resolvePendingOperation('');
    });

    this.socket.on('room_created', (data: ServerToClientEvents['room_created']) => {
      console.log('Room created:', data);
      this.updateLobbyStatus(`Room created: ${data.roomId}. Waiting for opponent...`);
      this.resolvePendingOperation(data.roomId);
    });
  }

  private resolvePendingOperation(roomId: string): void {
    if (this.pendingResolve) {
      this.pendingResolve(roomId);
      this.pendingResolve = null;
    }
  }

  private updateLobbyStatus(message: string): void {
    const statusElement = document.getElementById('lobby-status');
    if (statusElement) {
      statusElement.textContent = message;
    }
  }

  private handleReconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.warn(`Reconnecting... Attempt ${this.reconnectAttempts}`);
      setTimeout(() => {
        this.socket?.connect();
      }, this.reconnectDelay);
    } else {
      console.error('Max reconnection attempts reached. Please refresh the page.');
      this.gameInstance?.handleConnectionLost();
    }
  }

  public createRoom(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.isSocketReady()) {
        return reject(new Error('Socket not connected'));
      }

      this.pendingResolve = resolve;
      const timeout = this.setupRoomOperationTimeout(reject, 'Room creation timeout');

      this.socket!.once('room_created', () => clearTimeout(timeout));
      this.socket!.once('create_error', () => clearTimeout(timeout));

      const roomConfig = {
        isSinglePlayer: this.gameInstance?.isSinglePlayer ?? false,
        isRemote: this.gameInstance?.isRemote ?? false
      };

      this.socket!.emit('create_room', roomConfig);
      console.log('[Client] create_room emitted');
    });
  }

  public joinRoom(roomId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.isSocketReady()) {
        return reject(new Error('Socket not connected'));
      }

      this.pendingResolve = resolve;
      const timeout = this.setupRoomOperationTimeout(reject, 'Join room timeout');

      this.socket!.once('joined_room', () => clearTimeout(timeout));
      this.socket!.once('join_error', () => clearTimeout(timeout));

      this.socket!.emit('join_room', { roomId });
      console.log('[Client] join_room emitted for room:', roomId);
    });
  }

  private isSocketReady(): boolean {
    return this.socket?.connected ?? false;
  }

  private setupRoomOperationTimeout(reject: (error: Error) => void, errorMessage: string): NodeJS.Timeout {
    return setTimeout(() => {
      this.pendingResolve = null;
      reject(new Error(errorMessage));
    }, this.roomOperationTimeout);
  }

  public leaveRoom(): void {
    if (this.isSocketReady()) {
      this.socket!.emit('leave_room');
      console.log('[Client] leave_room emitted');
    }
  }

  public paddleMove(payload: ClientToServerEvents['paddle_move']): void {
    if (this.isSocketReady()) {
      this.socket!.emit('paddle_move', payload);
    }
  }

  public setGameInstance(gameInstance: PongGame): void {
    console.log('Setting game instance');
    this.gameInstance = gameInstance;
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
      console.log('Socket disconnected');
    }
  }

  // Getter methods
  public isConnected(): boolean {
    return this.isSocketReady();
  }

  public getSocket(): Socket | undefined {
    return this.socket;
  }

  public getSocketId(): string | undefined {
    return this.socket?.id;
  }

  public getGameInstance(): PongGame | null {
    return this.gameInstance;
  }
}
