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

export interface GameRoom {
  id: string;
  owner: Player | null;
  guest: Player | null;
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
