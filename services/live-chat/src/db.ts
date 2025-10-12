import fp from 'fastify-plugin';
import Database from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

// @max
const dbPath = process.env.LIVECHAT_DB_DIR || path.join(__dirname, '../database/pongChat.db');

export default fp(
  async (fastify) => {
    try {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });

      console.log(`Database path: ${dbPath}`);

      const db = new Database(dbPath, { verbose: console.log });

      // db.exec(`DROP TABLE messages`);
      // db.exec(`DROP TABLE unread_counter`);
      // db.exec(`DROP TABLE lc_friendships`);
      // db.exec(`DROP TABLE lc_requests`);
    

      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nickname TEXT UNIQUE,
          avatar TEXT DEFAULT 'default',
          created_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'NOW'))
        )`
      );

      // (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW'))
      // takes current date and converts it to text, also adding milliseconds
      db.exec(`
		CREATE TABLE IF NOT EXISTS messages (
		conversation_id INTEGER NOT NULL REFERENCES lc_friendships(id) ON DELETE CASCADE,
		sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		message TEXT NOT NULL,
		created_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'NOW'))
		)`);

      db.exec(`
		CREATE TABLE IF NOT EXISTS tournament_msgs (
		receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		message TEXT NOT NULL,
		created_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'NOW'))
		)`);

      db.exec(`
		CREATE TABLE IF NOT EXISTS tournament_unread_counter (
		receiver_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
		amount INTEGER NOT NULL
		)`);

      db.exec(`
		CREATE TABLE IF NOT EXISTS unread_counter (
		conversation_id INTEGER NOT NULL REFERENCES lc_friendships(id) ON DELETE CASCADE,
		receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		amount INTEGER NOT NULL,
		UNIQUE (conversation_id, receiver_id)
		)`);

      // CREATE INDEX will create an indexed and ordered tree (or whatev it's called)
      // for faster look ups. Basically it will use binary search instead going through every row one by one
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_messages ON messages(conversation_id, created_at DESC)`
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_tournament_msgs ON tournament_msgs(receiver_id, created_at DESC)`
      );

      // WAL (Write-Ahead Logging) allows reads while writes, default mode blocks everything on write(INSERT)
      // This will create a file 'dbName'-wal -> pong.db-wal
      // Then all writes goes in -wal file and all reads read from both files
      // When it reaches default checkpoint (specific size i think) it merges with the main db
      // So it's IMPORTANT to always keep db file and -wal file together (When moving, copying etc..)
      // To force full merge, run -> PRAGMA wal_checkpoint(FULL); note: it will block whole db
      // It will create also -shm file -> shared memory, sql manages it on its own, it has some metadata there
      db.exec(`PRAGMA journal_mode = WAL`);

      // UNIQUE already creates an INDEX so no need to use CREATE INDEX
      // Friendships and blocks are together cause they depend on each other
      // and both need to be checked before sending a message
      db.exec(`
		CREATE TABLE IF NOT EXISTS lc_friendships (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		user1_blocked BOOLEAN DEFAULT false,
		user2_blocked BOOLEAN DEFAULT false,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE (user1_id, user2_id),
		CHECK (user1_id < user2_id)
		)`);

      db.exec(`
		CREATE TABLE IF NOT EXISTS lc_requests (
		receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		status TEXT NOT NULL DEFAULT 'not viewed',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`);

      fastify.decorate('db', db);
    } catch (err) {
      console.error('Error loading DB', err);
      throw err;
    }
  },
  {
    name: 'database-connector',
  }
);

declare module 'fastify' {
  interface FastifyInstance {
    db: Database.Database;
  }
}
