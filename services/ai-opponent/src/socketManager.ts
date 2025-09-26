import { io, Socket } from 'socket.io-client';
import { PongGame } from './game';
import type { GameStartPayload, ServerToClientEvents } from './socket-interfaces';
import type { ClientToServerEvents } from './socket-interfaces';
import { apiGatewayUpstream } from './server';

export class SocketManager {
  // private static instance: SocketManager;
  private socket?: Socket;
  private gameInstance: PongGame | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingResolve: ((roomId: string) => void) | null = null;

  constructor(private readonly roomId?: string) {
    // Socket wird in connect() erstellt
  }

  public onGameStart: ((payload: GameStartPayload) => void) | null = null;

  public connect(): void {
    if (this.socket?.connected) {
      console.log('[SocketManager] Already connected');
      return;
    }
    this.createSocket();
    this.setupEventListeners();
    this.socket!.connect();
  }

  private createSocket(): void {
    this.socket = io(apiGatewayUpstream || 'https://localhost:3000', {
      path: '/socket.io',
      transports: ['websocket'],
      autoConnect: false,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      rejectUnauthorized: false,
      secure: true,
      withCredentials: true,
      upgrade: true,
      rememberUpgrade: true,
    });
  }

  private setupEventListeners(): void {
    if (!this.socket) return;
    this.setupConnectionEvents();
    this.setupGameEvents();
    this.setupRoomEvents();
  }

  private setupConnectionEvents(): void {
    this.socket!.on('connect', () => {
      console.log('[SocketManager] Connected:', this.socket?.id);
      this.reconnectAttempts = 0;
      
      // Auto-join room wenn roomId vorhanden
      if (this.roomId) {
        this.socket!.emit('join_room', { roomId: this.roomId });
        console.log('[SocketManager] Auto-joining room:', this.roomId);
      }
    });

    this.socket!.on('connect_error', (error: Error) => {
      console.error('[SocketManager] Connection error:', error);
    });

    this.socket!.on('disconnect', () => {
      console.warn('[SocketManager] Disconnected');
      this.handleReconnection();
    });
  }

  private setupGameEvents(): void {
    this.socket!.on('game_start', (payload: ServerToClientEvents['game_start']) => {
      console.log('[SocketManager] Game start received:', payload);
      this.gameInstance?.handleGameStart(payload);
      this.onGameStart?.(payload);
    });

    this.socket!.on('game_over', (message: ServerToClientEvents['game_over']) => {
      console.log('[SocketManager] Game over:', message);
      const winner = this.gameInstance?.determineWinner(message) || '';
      this.gameInstance?.handleGameOver({ ...message, winner });
    });

    this.socket!.on('game_aborted', (message: { message: string }) => {
      console.log('[SocketManager] Game aborted:', message);
      this.gameInstance?.handleRoomTerminated();
    });

    this.socket!.on('game_state', (state: ServerToClientEvents['game_state']) => {
      this.gameInstance?.updateFromServer(state);
    });
  }

  private setupRoomEvents(): void {
    this.socket!.on('joined_room', (data: ServerToClientEvents['joined_room']) => {
      console.log('[SocketManager] Joined room:', data);
      this.resolvePendingPromise(data.roomId);
    });

    this.socket!.on('join_error', (error: ServerToClientEvents['join_error']) => {
      console.error('[SocketManager] Join error:', error.message);
      this.resolvePendingPromise('');
    });

    this.socket!.on('create_error', (error: ServerToClientEvents['create_error']) => {
      console.error('[SocketManager] Create error:', error.message);
      this.resolvePendingPromise('');
    });

    this.socket!.on('room_created', (data: ServerToClientEvents['room_created']) => {
      console.log('[SocketManager] Room created:', data);
      this.resolvePendingPromise(data.roomId);
    });
  }

  private resolvePendingPromise(roomId: string): void {
    if (this.pendingResolve) {
      this.pendingResolve(roomId);
      this.pendingResolve = null;
    }
  }

  private handleReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SocketManager] Max reconnection attempts reached');
      this.gameInstance?.handleConnectionLost();
      return;
    }

    this.reconnectAttempts++;
    console.warn(`[SocketManager] Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    setTimeout(() => {
      this.socket?.connect();
    }, this.reconnectDelay);
  }

  public createRoom(): Promise<string> {
    return this.executeRoomAction(
      'create_room',
      {
        isSinglePlayer: this.gameInstance?.isSinglePlayer ?? false,
        isRemote: this.gameInstance?.isRemote ?? false
      },
      'Room creation timeout'
    );
  }

  public joinRoom(roomId: string): Promise<string> {
    return this.executeRoomAction(
      'join_room',
      { roomId },
      'Join room timeout'
    );
  }

  private executeRoomAction(
    action: 'create_room' | 'join_room',
    payload: any,
    timeoutMessage: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        return reject(new Error('Socket not connected'));
      }

      this.pendingResolve = resolve;

      const timeout = setTimeout(() => {
        this.pendingResolve = null;
        reject(new Error(timeoutMessage));
      }, 10_000);

      // Setup one-time cleanup listeners
      const cleanup = () => clearTimeout(timeout);
      this.socket.once('room_created', cleanup);
      this.socket.once('joined_room', cleanup);
      this.socket.once('create_error', cleanup);
      this.socket.once('join_error', cleanup);

      this.socket.emit(action, payload);
      console.log(`[SocketManager] ${action} emitted:`, payload);
    });
  }

  public leaveRoom(): void {
    if (!this.socket?.connected) {
      console.warn('[SocketManager] Cannot leave room - not connected');
      return;
    }
    
    this.socket.emit('leave_room');
    console.log('[SocketManager] Leave room emitted');
  }

  public paddleMove(payload: ClientToServerEvents['paddle_move']): void {
    if (!this.socket?.connected) return;
    
    this.socket.emit('paddle_move', payload);
    // console.log('[SocketManager] Paddle move:', payload);
  }

  public setGameInstance(gameInstance: PongGame): void {
    console.log('[SocketManager] Setting game instance');
    this.gameInstance = gameInstance;
  }

  public disconnect(): void {
    if (!this.socket) {
      console.log('[SocketManager] Already disconnected');
      return;
    }

    this.socket.disconnect();
    this.socket = undefined;
    this.gameInstance = null;
    this.pendingResolve = null;
    console.log('[SocketManager] Disconnected and cleaned up');
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

  public getGameInstance(): PongGame | null {
    return this.gameInstance;
  }
}
