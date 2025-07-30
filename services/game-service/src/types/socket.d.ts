import type { Player, GameRoom, AuthPayload } from './index';

declare module 'socket.io' {
  interface Socket {
    user?: AuthPayload;
    room?: GameRoom;
    player?: Player;
  }
}
export {};
// This file extends the Socket.IO Socket interface to include custom properties
