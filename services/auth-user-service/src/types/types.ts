import { Socket } from 'socket.io';

export interface AuthPayload {
  id: string;
  nickname: string;
}

export interface UserChatInfo {
  socket: Socket;
  activeChatID: number | null;
  currentTargetID: number;
  invitations: { sent: number[]; received: number[] };
}
