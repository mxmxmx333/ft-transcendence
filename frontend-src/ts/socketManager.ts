import { PongGame } from './multiPlayerGame';
import type { GameStartPayload, ServerToClientEvents, ClientToServerEvents } from './types/socket-interfaces';
import { io, Socket } from 'socket.io-client';

export class SocketManager {
  private static instance: SocketManager;
  private socket?: Socket;
  private gameInstance: PongGame | null = null;
  
  private isConnecting = false;
  private connectionPromise: Promise<void> | null = null;

  // Reconnection settings
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 1000;
  private readonly roomOperationTimeout = 10000;
  
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

  private hasActiveConnection(): boolean {
    return this.socket?.connected ?? false;
  }

  public async ensureConnection(): Promise<void> {
    if (this.hasActiveConnection()) {
      console.log('Socket already connected');
      return Promise.resolve();
    }
    if (this.isConnecting && this.connectionPromise) {
      console.log('Connection already in progress');
      return this.connectionPromise;
    }
    
    this.isConnecting = true;
    this.connectionPromise = this.performConnection();
    try {
      await this.connectionPromise;
    } finally {
      this.isConnecting = false;
      this.connectionPromise = null;
    }
  }

  private performConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        return reject(new Error('No authentication token found'));
      }

      if (this.socket) {
        this.socket.disconnect();
        this.socket = undefined;
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

    this.setupTournamentEventListeners();
  }

  private setupGameEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('game_start', (payload: ServerToClientEvents['game_start']) => {
      console.log('Game start received:', payload);
      console.debug('[Game] this.gameInstance:', this.gameInstance);
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

  private setupTournamentEventListeners(): void {
  if (!this.socket) return;

  this.socket.on('tournament_room_created', (data: any) => {
    console.log('Tournament room created:', data);
    this.resolvePendingOperation(data.roomId);
  });

  this.socket.on('joined_tournament_room', (data: any) => {
    console.log('Joined tournament room:', data);
    this.resolvePendingOperation(data.roomId);
  });

  this.socket.on('tournament_players_updated', (data: any) => {
    console.log('Tournament players updated:', data);
    // Router function aufrufen
    if ((window as any).updateTournamentPlayers) {
      (window as any).updateTournamentPlayers(data.players);
    }
  });

  this.socket.on('tournament_error', (error: any) => {
    console.error('Tournament error:', error);
    alert(`Tournament error: ${error.message}`);
  });

  this.socket.on('tournament_started', (data: any) => {
    console.log('Tournament started:', data);
    // Game start logic hier
  });

  this.socket.on('tournament_match_start', (data: any) => {
    console.log('Tournament match starting:', data);
    //in router
    if ((window as any).handleTournamentMatchStart) {
      (window as any).handleTournamentMatchStart(data);
    }
  });

  this.socket.on('tournament_match_end', (data: any) => {
    console.log('Tournament match ended:', data);
    // in multiplayer
    this.gameInstance?.matchEnd(data);
    //in router
    if ((window as any).handleTournamentMatchEnd) {
      (window as any).handleTournamentMatchEnd(data);
    }
  });

  this.socket.on('tournament_winner', (data: any) => {
    console.log('Tournament winner:', data);
    if ((window as any).handleTournamentEnd) {
      (window as any).handleTournamentEnd(data);
    }
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

  public async createTournament(): Promise<string> {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      if (!this.hasActiveConnection()) {
        return reject(new Error('Socket not connected'));
      }

      this.pendingResolve = resolve;
      const timeout = this.setupRoomOperationTimeout(reject, 'Room creation timeout');

      this.socket!.once('room_created', () => clearTimeout(timeout));
      this.socket!.once('create_error', () => clearTimeout(timeout));

      this.socket!.emit('create_tournament_room');
      console.log('[Client] create_tournament_room emitted');
    });
  }

  public async joinTournament(roomId: string): Promise<string> {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      if (!this.hasActiveConnection()) {
        return reject(new Error('Socket not connected'));
      }

      this.pendingResolve = resolve;
      const timeout = this.setupRoomOperationTimeout(reject, 'Join room timeout');

      this.socket!.once('joined_tournament_room', () => clearTimeout(timeout));
      this.socket!.once('join_tournament_error', () => clearTimeout(timeout));

      this.socket!.emit('join_tournament_room', { roomId });
      console.log('[Client] join_tournament emitted for room:', roomId);
    });
  }

  public async startTournament(tournamentId: string): Promise<void> {
    await this.ensureConnection();
    this.socket!.emit('start_tournament', { roomId: tournamentId });
    console.log('[Client] start_tournament emitted for tournament:', tournamentId);
  }

  public async leaveTournament(): Promise<void> {
    if (this.hasActiveConnection()) {
      // Tournament ID aus UI holen
      const tournamentId = document.getElementById('current-tournament-id')?.textContent;
      if (tournamentId && tournamentId !== '-') {
        this.socket!.emit('leave_tournament', { roomId: tournamentId });
        console.log('[Client] leave_tournament emitted for:', tournamentId);
      }
    }
  }

  public async createRoom(): Promise<string> {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      if (!this.hasActiveConnection()) {
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

  public async joinRoom(roomId: string): Promise<string> {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      if (!this.hasActiveConnection()) {
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

  private setupRoomOperationTimeout(reject: (error: Error) => void, errorMessage: string): NodeJS.Timeout {
    return setTimeout(() => {
      this.pendingResolve = null;
      reject(new Error(errorMessage));
    }, this.roomOperationTimeout);
  }

  public async leaveRoom(): Promise<void> {
    if (this.hasActiveConnection()) {
      this.socket!.emit('leave_room');
      console.log('[Client] leave_room emitted');
    }
  }

  public async paddleMove(payload: ClientToServerEvents['paddle_move']): Promise<void> {
    if (this.hasActiveConnection()) {
      this.socket!.emit('paddle_move', payload);
    } else {
      console.warn('Cannot send paddle move: no active connection');
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
    this.isConnecting = false;
    this.connectionPromise = null;
  }

  // Getter methods
  public isConnected(): boolean {
    return this.hasActiveConnection();
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
