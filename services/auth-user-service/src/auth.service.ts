import User from './user';

// ENVIRONMENT VARIABLES
import * as dotenv from 'dotenv';

dotenv.config();

// AUTHENTICATION SERVICE
export default class AuthService {
  private db: any;
  constructor(fastify: any) {
    if (!fastify.db) {
      throw new Error('Database not initialized');
    }
    this.db = fastify.db;
    this.initializeDatabase();
  }

  private initializeDatabase() {
    // Updated users table with avatar column
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        avatar TEXT DEFAULT 'default',
        status TEXT DEFAULT 'online',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Friendships table for managing friend relationships
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS friendships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_id INTEGER NOT NULL,
        addressee_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'declined', 'blocked')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(requester_id, addressee_id)
      )
    `);

    // Game statistics table for tracking user game history
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_statistics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        games_lost INTEGER DEFAULT 0,
        last_game_date DATETIME,
        total_score INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Add trigger to update updated_at timestamp
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_users_timestamp 
      AFTER UPDATE ON users
      BEGIN
        UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_friendships_timestamp 
      AFTER UPDATE ON friendships
      BEGIN
        UPDATE friendships SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
  }

  // ======= EXISTING USER METHODS =======
  createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): User {
    const { nickname, email, password_hash, avatar = 'default', status = 'online' } = user;
    const stmt = this.db.prepare(
      'INSERT INTO users (nickname, email, password_hash, avatar, status) VALUES (?, ?, ?, ?, ?)'
    );
    const info = stmt.run(nickname, email, password_hash, avatar, status);

    // Create initial game statistics for the user
    const gameStatsStmt = this.db.prepare('INSERT INTO game_statistics (user_id) VALUES (?)');
    gameStatsStmt.run(info.lastInsertRowid);

    const newUser = this.getUserById(info.lastInsertRowid);
    if (!newUser) {
      throw new Error('Failed to create user');
    }
    return newUser;
  }

  getUserByEmail(email: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email);
  }

  getUserProfile(userId: number, currentUserId: number): any {
    try {
      const userStmt = this.db.prepare(
        'SELECT id, nickname, email, avatar, status, created_at FROM users WHERE id = ?'
      );
      const user = userStmt.get(userId);

      if (!user) {
        return null;
      }

      // Friend durumunu kontrol et
      const friendshipStmt = this.db.prepare(`
      SELECT status as friendship_status 
      FROM friendships 
      WHERE (requester_id = ? AND addressee_id = ?) 
         OR (requester_id = ? AND addressee_id = ?)
    `);
      const friendship = friendshipStmt.get(currentUserId, userId, userId, currentUserId);

      // Game istatistiklerini getir
      const statsStmt = this.db.prepare('SELECT * FROM game_statistics WHERE user_id = ?');
      const stats = statsStmt.get(userId);

      return {
        ...user,
        friendship_status: friendship ? friendship.friendship_status : 'none',
        game_stats: stats || {
          games_played: 0,
          games_won: 0,
          games_lost: 0,
          total_score: 0,
        },
      };
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  getUserByIdPublic(userId: number): any {
    try {
      const stmt = this.db.prepare(`
      SELECT id, nickname, avatar, status, created_at 
      FROM users 
      WHERE id = ?
    `);
      return stmt.get(userId);
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return null;
    }
  }

  getUserByNickname(nickname: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE nickname = ?');
    return stmt.get(nickname);
  }

  getUserById(id: number): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  }

  // ======= NEW PROFILE UPDATE METHODS =======
  updateUserAvatar(userId: number, avatar: string): boolean {
    const stmt = this.db.prepare('UPDATE users SET avatar = ? WHERE id = ?');
    const info = stmt.run(avatar, userId);
    return info.changes > 0;
  }

  updateUserNickname(userId: number, nickname: string): boolean {
    try {
      const stmt = this.db.prepare('UPDATE users SET nickname = ? WHERE id = ?');
      const info = stmt.run(nickname, userId);
      return info.changes > 0;
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Nickname already exists');
      }
      throw error;
    }
  }

  updateUserStatus(userId: number, status: string): boolean {
    const stmt = this.db.prepare('UPDATE users SET status = ? WHERE id = ?');
    const info = stmt.run(status, userId);
    return info.changes > 0;
  }

  // ======= FRIEND SYSTEM METHODS =======
  sendFriendRequest(requesterId: number, addresseeId: number): boolean {
    try {
      // Check if relationship already exists
      const existingStmt = this.db.prepare(
        'SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)'
      );
      const existing = existingStmt.get(requesterId, addresseeId, addresseeId, requesterId);

      if (existing) {
        throw new Error('Friendship relationship already exists');
      }

      const stmt = this.db.prepare(
        'INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, ?)'
      );
      const info = stmt.run(requesterId, addresseeId, 'pending');
      return info.changes > 0;
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        throw error;
      }
      throw new Error('Failed to send friend request');
    }
  }

  respondToFriendRequest(friendshipId: number, response: 'accepted' | 'declined'): boolean {
    try {
      // Önce friendship'in var olduğunu kontrol et
      const checkStmt = this.db.prepare('SELECT * FROM friendships WHERE id = ?');
      const friendship = checkStmt.get(friendshipId);

      if (!friendship) {
        throw new Error('Friendship not found');
      }

      const stmt = this.db.prepare('UPDATE friendships SET status = ? WHERE id = ?');
      const info = stmt.run(response, friendshipId);

      if (info.changes === 0) {
        throw new Error('No friendship found to update');
      }

      return info.changes > 0;
    } catch (error: any) {
      console.error('Error responding to friend request:', error);
      throw new Error(`Failed to respond to friend request: ${error.message}`);
    }
  }

  getFriends(userId: number): any[] {
    const stmt = this.db.prepare(`
      SELECT 
        u.id, u.nickname, u.avatar, u.status,
        f.status as friendship_status, f.created_at as friends_since
      FROM friendships f
      JOIN users u ON (
        CASE 
          WHEN f.requester_id = ? THEN u.id = f.addressee_id
          ELSE u.id = f.requester_id
        END
      )
      WHERE (f.requester_id = ? OR f.addressee_id = ?) 
      AND f.status = 'accepted'
      ORDER BY f.created_at DESC
    `);
    return stmt.all(userId, userId, userId);
  }

  getFriendRequests(userId: number): any[] {
    const stmt = this.db.prepare(`
      SELECT 
        f.id as friendship_id,
        u.id, u.nickname, u.avatar,
        f.created_at as request_date,
        f.status
      FROM friendships f
      JOIN users u ON u.id = f.requester_id
      WHERE f.addressee_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `);
    return stmt.all(userId);
  }

  searchUsers(searchTerm: string, currentUserId: number): any[] {
    const stmt = this.db.prepare(`
      SELECT 
        u.id, u.nickname, u.avatar, u.status,
        CASE 
          WHEN f.id IS NOT NULL THEN f.status
          ELSE 'none'
        END as friendship_status
      FROM users u
      LEFT JOIN friendships f ON (
        (f.requester_id = u.id AND f.addressee_id = ?) OR
        (f.requester_id = ? AND f.addressee_id = u.id)
      )
      WHERE u.nickname LIKE ? AND u.id != ?
      ORDER BY u.nickname
      LIMIT 20
    `);
    return stmt.all(currentUserId, currentUserId, `%${searchTerm}%`, currentUserId);
  }

  removeFriend(userId: number, friendId: number): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM friendships 
      WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
      AND status = 'accepted'
    `);
    const info = stmt.run(userId, friendId, friendId, userId);
    return info.changes > 0;
  }

  // ======= GAME STATISTICS METHODS =======
  getUserGameStats(userId: number): any {
    const stmt = this.db.prepare('SELECT * FROM game_statistics WHERE user_id = ?');
    return stmt.get(userId);
  }

  updateGameStats(userId: number, won: boolean, score: number): boolean {
    const stmt = this.db.prepare(`
      UPDATE game_statistics 
      SET games_played = games_played + 1,
          games_won = games_won + ?,
          games_lost = games_lost + ?,
          total_score = total_score + ?,
          last_game_date = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `);
    const info = stmt.run(won ? 1 : 0, won ? 0 : 1, score, userId);
    return info.changes > 0;
  }

  // ======= UTILITY METHODS =======
  getAvailableAvatars(): string[] {
    return [
      'default',
      'robot',
      'alien',
      'ninja',
      'pirate',
      'wizard',
      'knight',
      'astronaut',
      'viking',
      'samurai',
      'cyberpunk',
      'steampunk',
    ];
  }
}
