export interface GameStartPayload {
  message: string;
  roomId: string;
  ballX: number;
  ballY: number;
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

export interface ServerToClientEvents {
  game_start: GameStartPayload;
  game_aborted: {
    message: string;
  };
  game_over: {
    winner: 'owner' | 'guest';
    finalScore: {
      owner: number;
      guest: number;
    };
    message: string;
  };
  game_state: {
    ballX: number;
    ballY: number;
    ballVX: number;
    ballVY: number;
    paddle1Y: number;
    paddle2Y: number;
    ownerScore: number;
    guestScore: number;
  };
  create_error: {
    message: string;
  };
  room_created: {
    roomId: string;
    success: boolean;
  };
  join_error: {
    message: string;
  };
  joined_room: {
    roomId: string;
    message: string;
    success: boolean;
  };
  room_error: {
    message: string;
  };
  game_pause_state: (isPaused: boolean) => void;
}

export interface ClientToServerEvents {
  create_room: {
    isSinglePlayer: boolean;
    isRemote: boolean;
  };
  join_room: {
    roomId: string;
  };
  leave_room: {};
  paddle_move: {
    moveP1: 'up' | 'down' | 'none';
    moveP2: 'up' | 'down' | 'none';
  };
  game_pause: (isPaused: boolean) => void;
  disconnect: {};
}
