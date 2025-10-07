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
