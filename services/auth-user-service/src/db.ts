import fp from 'fastify-plugin';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export default fp(
  async (fastify) => {
    try {
      const dbPath = path.join(process.cwd(), 'database', 'pong.db');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      console.log(`Database path: ${dbPath}`);

      // ---->  unneccessairy because better-sqlite3 creates the file if it doesn't exist
      //
      // if (!fs.existsSync(dbPath)) {
      //   fs.writeFileSync(dbPath, '');
      //   console.log('New Database created at:', dbPath);
      // }

      const db = new Database(dbPath, { verbose: console.debug });

      db.exec(`
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

      db.exec(`
		CREATE TABLE IF NOT EXISTS match_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		player1_id INTEGER NOT NULL,
		player2_id INTEGER,
		winner_id INTEGER,
		player1_score INTEGER NOT NULL,
		player2_score INTEGER DEFAULT 0,
		game_type TEXT NOT NULL,
		room_id TEXT,
		played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (player1_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (player2_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE SET NULL
		);

		CREATE INDEX IF NOT EXISTS idx_match_history_player1 ON match_history(player1_id);
		CREATE INDEX IF NOT EXISTS idx_match_history_player2 ON match_history(player2_id);
		CREATE INDEX IF NOT EXISTS idx_match_history_played_at ON match_history(played_at);
	`);

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
