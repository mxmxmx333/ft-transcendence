"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const authPlugin = async (fastify) => {
    await fastify.register(jwt_1.default, {
        secret: process.env.JWT_SECRET || 'your-very-secure-secret-key-here' // We'll use .env for this
    });
    // Bcryptjs - plugin could be used.
    fastify.decorate('bcrypt', bcryptjs_1.default);
};
exports.default = (0, fastify_plugin_1.default)(authPlugin, {
    name: 'auth-plugin'
});
//# sourceMappingURL=auth.js.map