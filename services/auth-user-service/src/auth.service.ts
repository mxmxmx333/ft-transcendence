import User from './user';
import * as fs from 'fs';
import * as path from 'path';
import MatchHistory from './user';
import GameStatistics from './user';
import UserProfileWithHistory from './user';

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
        auth_method TEXT NOT NULL,
        nickname TEXT UNIQUE,
        email TEXT UNIQUE,
        password_hash TEXT,
        external_id INTEGER UNIQUE,
        totp_secret TEXT,
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
      status TEXT NOT NULL DEFAULT 'pending',
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
    const { nickname, auth_method, email, password_hash, external_id, totp_secret, avatar = 'default', status = 'online' } = user;
    const stmt = this.db.prepare(
      'INSERT INTO users (nickname, auth_method, email, password_hash, external_id, totp_secret, avatar, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(nickname, auth_method, email, password_hash, external_id, totp_secret, avatar, status);

    // Create initial game statistics for the user
    const gameStatsStmt = this.db.prepare('INSERT INTO game_statistics (user_id) VALUES (?)');
    gameStatsStmt.run(info.lastInsertRowid);

    const newUser = this.getUserById(info.lastInsertRowid);
    if (!newUser) {
      throw new Error('Failed to create user');
    }
    return newUser;
  }

  setNickname(id: number, nickname: string) {
    const stmt = this.db.prepare('UPDATE users SET nickname = ? WHERE id = ?');
    const info = stmt.run(nickname, id);

    const user = this.getUserById(id);
    if (!user) {
      throw new Error('Pretty sure this can never happen');
    }

    return user;
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

  getUserByExternalId(id: number): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE auth_method = \'remote\' AND external_id = ?');
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

  // ======= GAME STATISTICS & MATCH HISTORY METHODS =======

  getUserMatchHistory(userId: number, limit: number = 50): any[] {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          mh.*,
          CASE 
            WHEN mh.player1_id = ? THEN p2.nickname 
            ELSE p1.nickname 
          END as opponent_nickname,
          CASE 
            WHEN mh.player1_id = ? THEN p2.avatar 
            ELSE p1.avatar 
          END as opponent_avatar,
          CASE 
            WHEN mh.player1_id = ? THEN mh.player1_score 
            ELSE mh.player2_score 
          END as my_score,
          CASE 
            WHEN mh.player1_id = ? THEN mh.player2_score 
            ELSE mh.player1_score 
          END as opponent_score,
          CASE 
            WHEN mh.winner_id = ? THEN 'won'
            ELSE 'lost'
          END as result
        FROM match_history mh
        LEFT JOIN users p1 ON p1.id = mh.player1_id
        LEFT JOIN users p2 ON p2.id = mh.player2_id
        WHERE mh.player1_id = ? OR mh.player2_id = ?
        ORDER BY mh.played_at DESC
        LIMIT ?
      `);
      
      return stmt.all(userId, userId, userId, userId, userId, userId, userId, limit);
    } catch (error) {
      console.error('Failed to get match history:', error);
      return [];
    }
  }

  getUserGameStats(userId: number): any {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          COUNT(*) as games_played,
          SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as games_won,
          SUM(CASE 
            WHEN winner_id != ? AND winner_id IS NOT NULL THEN 1 
            ELSE 0 
          END) as games_lost,
          SUM(CASE 
            WHEN player1_id = ? THEN player1_score 
            ELSE player2_score 
          END) as total_score,
          MAX(played_at) as last_game_date
        FROM match_history 
        WHERE player1_id = ? OR player2_id = ?
      `);
      
      const stats = stmt.get(userId, userId, userId, userId, userId);
      
      const gamesPlayed = stats.games_played || 0;
      const gamesWon = stats.games_won || 0;
      const gamesLost = stats.games_lost || 0;
      
      return {
        user_id: userId,
        games_played: gamesPlayed,
        games_won: gamesWon,
        games_lost: gamesLost,
        win_rate: gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0,
        avg_score: gamesPlayed > 0 ? Math.round((stats.total_score || 0) / gamesPlayed) : 0,
        total_score: stats.total_score || 0,
        last_game_date: stats.last_game_date
      };
    } catch (error) {
      console.error('Failed to get game stats:', error);
      return {
        user_id: userId,
        games_played: 0,
        games_won: 0,
        games_lost: 0,
        win_rate: 0,
        avg_score: 0,
        total_score: 0
      };
    }
  }

  saveMatchResult(matchData: any): boolean {
    try {
      console.log('🎯 Internal match result received:', matchData);

      const player1Id = matchData.player1_id ? parseInt(matchData.player1_id) : null;
      const player2Id = matchData.player2_id ? parseInt(matchData.player2_id) : null;
      const winnerId = matchData.winner_id ? parseInt(matchData.winner_id) : null;

      if (!player1Id) {
        console.error('player1_id is required');
        return false;
      }

      const stmt = this.db.prepare(`
        INSERT INTO match_history 
        (player1_id, player2_id, winner_id, player1_score, player2_score, 
        game_type, room_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        player1Id,
        player2Id,
        winnerId,
        matchData.player1_score || 0,
        matchData.player2_score || 0,
        matchData.game_type || 'single',
        matchData.room_id || null
      );

      console.log('Match result saved with ID:', result.lastInsertRowid);
      return true;
    } catch (error) {
      console.error('Failed to save match result:', error);
      return false;
    }
  }

  // ======= UTILITY METHODS =======
 getAvailableAvatars(userId: number): string[] {
  const staticAvatars = ['default', 'default1'];
  
  try {
    const uploadsDir = path.join(__dirname, '../../uploads/avatars');
    console.log('📂 Checking avatars directory:', uploadsDir);
    
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      console.log('📁 Files found:', files);
      
      // ✅ FIX: Sadece bu kullanıcıya ait custom avatarları göster
      const customAvatars = files
        .filter(file => {
          const isUserAvatar = file.startsWith(`custom_${userId}_`);
          const hasValidExtension = /\.(jpg|png|gif|webp)$/i.test(file);
          return isUserAvatar && hasValidExtension;
        })
        .map(file => file.replace(/\.(jpg|png|gif|webp)$/i, ''));
      
      console.log('🎨 User custom avatars:', customAvatars);
      return [...staticAvatars, ...customAvatars, 'upload'];
    }
  } catch (error) {
    console.error('❌ Error reading custom avatars:', error);
  }
  
  return [...staticAvatars, 'upload'];
}

//TESTING
async processAndSaveAvatar(
  userId: number, 
  fileBuffer: Buffer, 
  mimeType: string
): Promise<string> {
  try {
    // Uploads dizinini oluştur
    const uploadsDir = path.join(__dirname, '../../uploads/avatars');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Önceki custom avatarı temizle
    const user = this.getUserById(userId);
    if (user?.avatar && user.avatar.startsWith('custom_')) {
      this.cleanupUserAvatars(uploadsDir, user.avatar);
    }

    // ✅ Dosya adını doğru oluştur
    const extension = this.getFileExtension(mimeType);
    const filename = `custom_${userId}_${Date.now()}${extension}`;
    const filePath = path.join(uploadsDir, filename);

    // Resmi kaydet
    await this.processImage(fileBuffer, filePath, mimeType);

    // ✅ Database'de avatar alanını güncelle - SADECE FILENAME
    const avatarUrl = filename.replace(extension, ''); // Extension'sız
    const updateStmt = this.db.prepare('UPDATE users SET avatar = ? WHERE id = ?');
    updateStmt.run(avatarUrl, userId);

    console.log('✅ Avatar saved:', avatarUrl);
    return avatarUrl;

  } catch (error) {
    console.error('❌ Error processing avatar:', error);
    throw new Error('Failed to process avatar');
  }
}
private cleanupUserAvatars(uploadsDir: string, currentAvatar: string): void {
  try {
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      files.forEach(file => {
        // Sadece eski custom avatarları sil
        if (file.startsWith('custom_') && !file.includes(currentAvatar)) {
          const filePath = path.join(uploadsDir, file);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('🗑️ Deleted old avatar:', file);
          }
        }
      });
    }
  } catch (error) {
    console.error('Error cleaning up old avatars:', error);
  }
}

private getFileExtension(mimeType: string): string {
  const extensions: { [key: string]: string } = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp'
  };
  return extensions[mimeType] || '.jpg';
}

private async processImage(buffer: Buffer, outputPath: string, mimeType: string): Promise<void> {
  try {
    // Sharp kütüphanesi kullan (eğer yüklüyse)
    try {
      const sharp = require('sharp');
      await sharp(buffer)
        .resize(200, 200, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 80 })
        .toFile(outputPath);
    } catch (sharpError) {
      // Sharp yoksa, basitçe dosyayı kaydet
      console.log('Sharp not available, saving original file');
      fs.writeFileSync(outputPath, buffer);
    }
  } catch (error) {
    // Fallback: dosyayı olduğu gibi kaydet
    fs.writeFileSync(outputPath, buffer);
  }
}

async deleteUserAvatar(userId: number): Promise<boolean> {
  try {
    const user = this.getUserById(userId);
    if (!user?.avatar || !user.avatar.startsWith('custom_')) {
      return false;
    }

    const avatarToDelete = user.avatar; // ✅ Type-safe değişken

    // Uploads dizininden avatarı sil
    const uploadsDir = path.join(__dirname, '../../uploads/avatars');
    
    if (!fs.existsSync(uploadsDir)) {
      console.warn('Uploads directory does not exist');
      return false;
    }

    const files = fs.readdirSync(uploadsDir);
    
    files.forEach(file => {
      if (file.includes(avatarToDelete)) { // ✅ Artık undefined olamaz
        const filePath = path.join(uploadsDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('🗑️ Deleted avatar:', file);
        }
      }
    });

    // Database'de default avatar'a dön
    const updateStmt = this.db.prepare('UPDATE users SET avatar = ? WHERE id = ?');
    const info = updateStmt.run('default', userId);

    return info.changes > 0;

  } catch (error) {
    console.error('Error deleting avatar:', error);
    return false;
  }
}

}
