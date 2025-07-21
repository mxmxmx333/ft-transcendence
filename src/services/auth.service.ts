import User from '../models/user';

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
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  createUser(user: Omit<User, 'id' | 'created_at'>): User {
    const { nickname, email, password_hash } = user;
    const stmt = this.db.prepare(
      'INSERT INTO users (nickname, email, password_hash) VALUES (?, ?, ?)'
    );
    const info = stmt.run(nickname, email, password_hash);
    
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

  getUserByNickname(nickname: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE nickname = ?');
    return stmt.get(nickname);
  }

  getUserById(id: number): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  }
}