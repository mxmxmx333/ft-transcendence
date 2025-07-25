import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import bcrypt from 'bcryptjs';
import jwt from '@fastify/jwt';

const authPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'your-very-secure-secret-key-here', // We'll use .env for this
  });

  // Bcryptjs - plugin could be used.
  fastify.decorate('bcrypt', bcrypt);
};

declare module 'fastify' {
  interface FastifyInstance {
    JWT: typeof jwt; // JWT type
    bcrypt: typeof bcrypt; // Bcrypt type
  }
}

export default fp(authPlugin, {
  name: 'auth-plugin',
});
