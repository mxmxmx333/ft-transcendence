import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import bcrypt from 'bcryptjs'; // package.json'da bcryptjs 3.0.2 var
import jwt from '@fastify/jwt'; // package.json'da @fastify/jwt 9.1.0 var

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // JWT Plugin - Doğrudan import edilmiş sürümü kullanıyoruz
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'your-very-secure-secret-key-here' // .env'den alınması önerilir
  });

  // Bcryptjs - Fastify plugin yerine doğrudan decorate ediyoruz
  fastify.decorate('bcrypt', bcrypt);
};

// TypeScript tip tanımları
declare module 'fastify' {
  interface FastifyInstance {
    JWT: typeof jwt; // JWT tipi
    bcrypt: typeof bcrypt; // Bcrypt tipi
  }
}

export default fp(authPlugin, {
  name: 'auth-plugin' // Plugin için isim belirtiyoruz
});