import db from './db';

export default class refreshTokenController {
  private db: any;
  constructor(fastify: any) {
    if (!fastify.db) {
      throw new Error('Database not initialized');
    }
    this.db = fastify.db;
    this.initializeDatabase();
  }
  private initializeDatabase() {
    this.db.connect();
  }
}
