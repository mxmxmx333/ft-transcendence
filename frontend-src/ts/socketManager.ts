import { PongMultiplayer } from './multiPlayerGame';
import type { GameStartPayload, ServerToClientEvents } from './types/socket-interfaces';
import { io, Socket } from 'socket.io-client';

export class SocketManager {
  private static instance: SocketManager;
  private socket?: Socket;
  private gameInstance: PongMultiplayer | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingResolve: ((roomId: string) => void) | null = null;

  private constructor() {}

  public onGameStart: ((payload: GameStartPayload) => void) | null = null;

  public static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const token = localStorage.getItem('authToken');
      if (!token) return reject(new Error('No authentication token found'));

      this.socket = io({
        path: '/socket.io',              // match your proxy prefix
        auth: { token },
        transports: ['websocket'],       // optional: skip polling
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
      });
      this.socket.on('connect', () => {
        console.log('Socket connected:', this.socket?.id);
        this.reconnectAttempts = 0;
        resolve();
      });
      this.socket.on('connect_error', (error: Error) => reject(error));
      this.socket.on('disconnect', () => {
        console.warn('Socket disconnected');
        this.handleReconnection();
      });
      this.socket!.on('game_start', (message: ServerToClientEvents['game_start']) => {
        console.log('Game start received:', message);
        if (this.gameInstance) {
          this.gameInstance.handleGameStart(message);
        }
        if (this.onGameStart) {
          this.onGameStart(message);
        }
      });
      this.socket!.on('game_over', (message: ServerToClientEvents['game_over']) => {
        console.log('Game over:', message);
        this.gameInstance?.handleGameOver(message);
      });
      this.socket!.on(
        'game_aborted',
        (message: { message: ServerToClientEvents['game_aborted'] }) =>
          this.gameInstance?.handleRoomTerminated()
      );
      this.socket!.on('game_state', (state: ServerToClientEvents['game_state']) => {
        console.log('Game state update:', state);
      });
      this.socket!.on('joined_room', (data: ServerToClientEvents['joined_room']) => {
        console.log('Joined room:', data);
        if (this.pendingResolve) {
          this.pendingResolve(data.roomId);
          this.pendingResolve = null;
        }
      });
      this.socket!.on('join_error', (error: ServerToClientEvents['join_error']) => {
        console.error('Join error:', error.message);
        if (this.pendingResolve) {
          this.pendingResolve('');
          this.pendingResolve = null;
        }
      });
      this.socket!.on('create_error', (error: ServerToClientEvents['create_error']) => {
        console.error('Create error:', error.message);
        if (this.pendingResolve) {
          this.pendingResolve('');
          this.pendingResolve = null;
        }
      });
      this.socket!.on('room_created', (data: ServerToClientEvents['room_created']) => {
        console.log('Room created:', data);
        if (this.pendingResolve) {
          this.pendingResolve(data.roomId);
          this.pendingResolve = null;
        }
      });
    });
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
      if (!this.socket?.connected) {
        return reject(new Error('Socket not connected'));
      }

      const timeout = setTimeout(() => {
        reject(new Error('Room creation timeout'));
      }, 10_000);

      this.socket.once('room_created', (msg) => {
        clearTimeout(timeout);
        if (msg.success) {
          resolve(msg.roomId);
        } else {
          reject(new Error(msg.message ?? 'Unknown error'));
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
  public joinRoom(roomId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        return reject(new Error('Socket not connected'));
      }

      this.pendingResolve = resolve;

      this.socket.emit('join_room', { roomId });
      console.log('[Client] join_room emitted');
    });
  }
  public leaveRoom(): void {
    if (this.socket?.connected) {
      this.socket.emit('leave_room');
      console.log('[Client] leave_room emitted');
    } else {
      console.warn('Socket not connected, cannot leave room');
    }
  }
  public paddleMove(yPos: number): void {
    if (this.socket?.connected) {
      this.socket.emit('paddle_move', { yPos });
      console.log('[Client] paddle_move emitted with yPos:', yPos);
    } else {
      console.warn('Socket not connected, cannot send paddle move');
    }
  }
  public setGameInstance(gameInstance: PongMultiplayer): void {
    this.gameInstance = gameInstance;
    if (this.socket) {
      this.socket.on('game_start', (message: ServerToClientEvents['game_start']) => {
        this.gameInstance?.handleGameStart(message);
      });
      this.socket.on('game_over', (message: ServerToClientEvents['game_over']) => {
        this.gameInstance?.handleGameOver(message);
      });
      this.socket.on('game_aborted', () => {
        this.gameInstance?.handleRoomTerminated();
      });
    }
  }
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
      console.log('Socket disconnected');
    } else {
      console.warn('Socket already disconnected or not initialized');
    }
  }
  public isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
  public getSocket(): Socket | undefined {
    return this.socket;
  }
  public getSocketId(): string | undefined {
    return this.socket?.id;
  }
  public getGameInstance(): PongMultiplayer | null {
    return this.gameInstance;
  }
}
