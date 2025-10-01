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

export interface GameStartPayload {
  message: string;
  roomId: string;
  ballX: number;
  ballY: number;
  ballVX: number;
  ballVY: number;
  paddle1Y: number;
  paddle2Y: number;
  ownerScore: number;
  guestScore: number;
  owner: {
    id: string;
    nickname: string;
  };
  guest: {
    id: string;
    nickname: string;
  };
  isOwner: boolean;
  success: boolean;
}

export interface PaddleMovePayload {
 
    moveP1: 'up' | 'down' | 'none';
    moveP2: 'up' | 'down' | 'none';
}

export interface CreateRoomPayload {
  create_room: {
    isSinglePlayer: boolean;
    isRemote: boolean;
  };
  create_tournament_room: {}; // No additional data needed
}

export interface GameRoom {
  id: string;
  gameType: 'single' | 'local' | 'remote' | 'tournament';
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


export interface TournamentRoom {
  id: string;
  owner: Player | null;
  players: Player[];
  lostPlayers: Player[];
  lastWinner: Player | null;
  gameRoom: GameRoom | null;
}

export interface AuthPayload {
  id: string;
  nickname: string;
}

export const activeConnections = new Map<string, Socket>();
export const gameRooms: Record<string, GameRoom> = {};
export const waitingPlayers: Player[] = [];
export const tournamentRooms: Record<string, TournamentRoom> = {};
