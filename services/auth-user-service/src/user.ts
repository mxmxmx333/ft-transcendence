export default interface User {
  id?: number;
  auth_method: string;
  nickname: string | null;
  email: string | null;
  password_hash: string | null;
  external_id: number | null;
  totp_secret: string | null;
  avatar?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface sendUserEvent {
  id: number;
  nickname: string | null;
  avatar: string | null;
}

export interface MatchHistory {
  id?: number;
  player1_id: number;
  player2_id?: number;
  winner_id?: number;
  player1_score: number;
  player2_score: number;
  game_type: 'singleplayer' | 'local' | 'remote' | 'tournament';
  game_mode?: string;
  room_id?: string;
  played_at?: string;

  opponent_nickname?: string;
  opponent_avatar?: string;
  my_score?: number;
  opponent_score?: number;
  result?: 'won' | 'lost';
}

export interface GameStatistics {
  id?: number;
  user_id: number;
  games_played: number;
  games_won: number;
  games_lost: number;
  win_rate?: number;
  avg_score?: number;
  last_game_date?: string;
  total_score: number;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfileWithHistory {
  id: number;
  nickname: string;
  avatar: string;
  status: string;
  game_stats: GameStatistics;
  recent_matches: MatchHistory[]; // LETZTE 10 MATCHES
  friendship_status?: string;
}

export interface MatchResultBody {
  player1_id: number;
  player2_id?: number;
  winner_id?: number;
  player1_score: number;
  player2_score: number;
  game_type: 'singleplayer' | 'local' | 'remote' | 'tournament';
  room_id?: string;
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
