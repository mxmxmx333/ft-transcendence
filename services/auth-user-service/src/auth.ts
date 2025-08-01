import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import bcrypt from 'bcryptjs';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
dotenv.config();

// Ensure JWT_SECRET is set in the environment variables
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in the environment variables');
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'our-very-secret', // We'll use .env for this
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
