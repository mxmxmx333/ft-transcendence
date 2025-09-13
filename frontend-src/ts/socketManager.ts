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
      console.log('Creating new SocketManager instance');
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const token = localStorage.getItem('authToken');
      if (!token) return reject(new Error('No authentication token found'));

      // SERVER URL'i düzelt!
      this.socket = io({
        path: '/socket.io',
        auth: { token },
        transports: ['websocket'],
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
      });

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

      // Game event listeners
      this.socket.on('game_start', (payload: ServerToClientEvents['game_start']) => {
        console.log('Game start received:', payload);
        console.log('Game Instance true;: ', this.gameInstance !== null);
        this.gameInstance?.handleGameStart(payload);
        if (this.onGameStart) {
          this.onGameStart(payload);
        }
      });
      this.socket.on('game_over', (message: ServerToClientEvents['game_over']) => {
        console.log('Game over:', message);
        
        let winner = '';
        if (this.gameInstance) {
          winner = this.gameInstance.determineWinner(message);
        }
        
        this.gameInstance?.handleGameOver({...message, winner});
      });

      this.socket.on('game_aborted', (message: { message: string }) => {
        console.log('Game aborted:', message);
        this.gameInstance?.handleRoomTerminated();
      });

      this.socket.on('game_state', (state: ServerToClientEvents['game_state']) => {
        // Console log'u kaldır - çok spam yapıyor
        // console.log('Game state update:', state);
        this.gameInstance?.updateFromServer(state);
      });

      // Room event listeners
      this.socket.on('joined_room', (data: ServerToClientEvents['joined_room']) => {
        console.log('Joined room:', data);
        if (this.pendingResolve) {
          this.pendingResolve(data.roomId);
          this.pendingResolve = null;
        }
      });

      this.socket.on('join_error', (error: ServerToClientEvents['join_error']) => {
        console.error('Join error:', error.message);
        alert(`Join error: ${error.message}`);
        if (this.pendingResolve) {
          this.pendingResolve('');
          this.pendingResolve = null;
        }
      });

      this.socket.on('create_error', (error: ServerToClientEvents['create_error']) => {
        console.error('Create error:', error.message);
        alert(`Create error: ${error.message}`);
        if (this.pendingResolve) {
          this.pendingResolve('');
          this.pendingResolve = null;
        }
      });

      this.socket.on('room_created', (data: ServerToClientEvents['room_created']) => {
        console.log('Room created:', data);
        // Room oluşturuldu mesajını göster
        document.getElementById('lobby-status')!.textContent =
          `Room created: ${data.roomId}. Waiting for opponent...`;
        if (this.pendingResolve) {
          this.pendingResolve(data.roomId);
          this.pendingResolve = null;
        }
      });

      // Paddle güncellemeleri için listener
      this.socket.on('paddle_update', (data: { playerId: string; yPos: number }) => {
        if (this.gameInstance) {
          this.gameInstance.updateOpponentPaddle(data.yPos);
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

      this.pendingResolve = resolve;

      const timeout = setTimeout(() => {
        this.pendingResolve = null;
        reject(new Error('Room creation timeout'));
      }, 10_000);

      this.socket.once('room_created', () => {
        clearTimeout(timeout);
      });

      this.socket.once('create_error', () => {
        clearTimeout(timeout);
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

      const timeout = setTimeout(() => {
        this.pendingResolve = null;
        reject(new Error('Join room timeout'));
      }, 10_000);

      this.socket.once('joined_room', () => {
        clearTimeout(timeout);
      });

      this.socket.once('join_error', () => {
        clearTimeout(timeout);
      });

      this.socket.emit('join_room', { roomId });
      console.log('[Client] join_room emitted for room:', roomId);
    });
  }

  public leaveRoom(): void {
    if (this.socket?.connected) {
      this.socket.emit('leave_room');
      console.log('[Client] leave_room emitted');
    }
  }

  public paddleMove(yPos: number): void {
    if (this.socket?.connected) {
      console.log('Paddle move:', yPos);
      this.socket.emit('paddle_move', { yPos });
      // Console log'u kaldır - çok spam yapıyor
    }
  }

  public setGameInstance(gameInstance: PongMultiplayer): void {
    console.log('Setting game instance:', gameInstance);
    this.gameInstance = gameInstance;
    console.log('Game instance set:', this.gameInstance);
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
      console.log('Socket disconnected');
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
