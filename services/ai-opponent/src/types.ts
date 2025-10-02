import { SocketManager } from './socketManager';
import { PongGame } from './game';

export enum Action {
  Up = 0,
  Stay = 1,
  Down = 2,
}

export interface Constants {
  readonly INITIAL_BALL_SPEED: number;
  //savedBallSpeed: number;
  readonly MAX_BALL_SPEED: number;
  readonly BALL_ACCELERATION: number;
  //ballSpeed: number;
  readonly aiSpeed: number;
  readonly aiErrorMargin: number;
  readonly paddleHeight: number;
  readonly paddleWidth: number;
  paddleCenter: number;
  readonly ballRadius: number;
  readonly winningScore: number;
  playableHeight: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

export const DEFAULT_CONSTANTS: Constants = {
  INITIAL_BALL_SPEED: 5,
  MAX_BALL_SPEED: 18,
  BALL_ACCELERATION: 0.2,
  aiSpeed: 3,
  aiErrorMargin: 20,
  paddleHeight: 100,
  paddleWidth: 15,
  paddleCenter: 50,
  ballRadius: 10,
  winningScore: 10,
  playableHeight: 600,
  canvasWidth: 800,
  canvasHeight: 600,
};

export interface GameState {
  ballX: number;
  ballY: number;
  ballVX: number; // HINZUFÜGEN
  ballVY: number; // HINZUFÜGEN
  paddle1Y: number;
  paddle2Y: number;
  ownerScore: number;
  guestScore: number;
}

// Improved Neural Network with better architecture
export interface GameStateNN {
  ballX: number;
  ballY: number;
  ballVX: number;
  ballVY: number;
  aiY: number;
  playerY: number;
  canvasWidth: number;
  canvasHeight: number;
  ballSpeed: number;
  gameTime: number;
}

export interface Experience {
  state: number[];
  targetY: number;
  reward: number;
  nextState: number[];
  done: boolean;
  priority: number;
}

export interface GameStatePG {
  ballX: number;
  ballY: number;
  ballVX: number;
  ballVY: number;
  aiY: number;
  playerY: number;
  canvasWidth: number;
  canvasHeight: number;
  ballSpeed: number;
  gameTime: number;
}

export interface AIInstance {
  socketManager: SocketManager;
  game: PongGame;
  createdAt: number;
}

// Interface for AI model data
export interface SerializedWeights {
  weights1: number[][];
  weights2: number[][];
  weights3: number[][];
  bias1: number[];
  bias2: number[];
  bias3: number[];
  epsilon: number;
  gameCount: number;
  winCount: number;
  totalReward: number;
}

export interface PerformanceStats {
  winRate: number;
  averageReward: number;
  recentGames: number[];
  lastGameTimestamp: number;
}

export interface AIModelFile {
  timestamp: string;
  weightsData: SerializedWeights;
  performanceStats: PerformanceStats;
}
