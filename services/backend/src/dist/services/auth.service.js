"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class AuthService {
    db;
    constructor(fastify) {
        if (!fastify.db) {
            throw new Error('Database not initialized');
        }
        this.db = fastify.db;
        this.initializeDatabase();
    }
    initializeDatabase() {
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
    createUser(user) {
        const { nickname, email, password_hash } = user;
        const stmt = this.db.prepare('INSERT INTO users (nickname, email, password_hash) VALUES (?, ?, ?)');
        const info = stmt.run(nickname, email, password_hash);
        const newUser = this.getUserById(info.lastInsertRowid);
        if (!newUser) {
            throw new Error('Failed to create user');
        }
        return newUser;
    }
    getUserByEmail(email) {
        const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
        return stmt.get(email);
    }
    getUserByNickname(nickname) {
        const stmt = this.db.prepare('SELECT * FROM users WHERE nickname = ?');
        return stmt.get(nickname);
    }
    getUserById(id) {
        const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
        return stmt.get(id);
    }
}
exports.default = AuthService;
// YOU CAN USE THIS EXPORTED CLASS FOR USER MANAGEMENT.
//# sourceMappingURL=auth.service.js.map