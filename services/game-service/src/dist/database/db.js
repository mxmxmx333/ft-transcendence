"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
exports.default = (0, fastify_plugin_1.default)(async (fastify) => {
    try {
        const dbPath = path_1.default.join(process.cwd(), 'pong.db');
        console.log(`Veritabanı yolu: ${dbPath}`);
        if (!fs_1.default.existsSync(dbPath)) {
            fs_1.default.writeFileSync(dbPath, '');
            console.log('Yeni veritabanı dosyası oluşturuldu');
        }
        const db = new better_sqlite3_1.default(dbPath, { verbose: console.log });
        db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        fastify.decorate('db', db);
    }
    catch (err) {
        console.error('Error loading DB', err);
        throw err;
    }
}, {
    name: 'database-connector'
});
//# sourceMappingURL=db.js.map