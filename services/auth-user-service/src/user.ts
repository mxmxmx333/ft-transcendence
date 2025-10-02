export default interface User {
  id?: number;
  nickname: string;
  email: string;
  password_hash: string;
  avatar?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GameStatistics {
  id?: number;
  user_id: number;
  games_played: number;
  games_won: number;
  games_lost: number;
  last_game_date?: string;
  total_score: number;
  created_at?: string;
  updated_at?: string;
}

export interface Friendship {
  id?: number;
  requester_id: number;
  addressee_id: number;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  created_at?: string;
  updated_at?: string;
}

export interface FriendInfo {
  id: number;
  nickname: string;
  avatar: string;
  status: string;
  friendship_status: string;
  friends_since?: string;
}

export interface FriendRequest {
  friendship_id: number;
  id: number;
  nickname: string;
  avatar: string;
  request_date: string;
  status: string;
}

export interface UserSearchResult {
  id: number;
  nickname: string;
  avatar: string;
  status: string;
  friendship_status: string;
}
