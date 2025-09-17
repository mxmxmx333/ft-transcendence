import { Socket } from 'socket.io';

// Multiplayer Interfaces
export interface Player {
  conn: Socket;
  id: string;
  nickname: string;
  score: number;
  paddleY: number;
  roomId?: string;
}

export interface PaddleMovePayload {
  paddle_move: {
    moveP1: 'up' | 'down' | 'none';
    moveP2: 'up' | 'down' | 'none';
  };
}

export interface CreateRoomPayload {
  create_room: {
    isSinglePlayer: boolean;
    isRemote: boolean;
  };
}

export interface GameRoom {
  id: string;
  gameType: 'single' | 'multi' | 'remote';
  owner: Player | null;
  guest: Player | null;
  ownerMovement: 'up' | 'down' | 'none';
  guestMovement: 'up' | 'down' | 'none';
  gameState: {
    ballX: number;
    ballY: number;
    ballVX: number;
    ballVY: number;
    lastUpdate: number;
  };
  isPrivate: boolean;
  gameLoop?: NodeJS.Timeout;
}

export interface AuthPayload {
  id: string;
  nickname: string;
}

export const activeConnections = new Map<string, Socket>();
export const gameRooms: Record<string, GameRoom> = {};
export const waitingPlayers: Player[] = [];
