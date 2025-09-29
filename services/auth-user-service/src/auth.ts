import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import  vaultClient from './vault-client'; 
dotenv.config();


type CoreClaims =
{
  sub: string;      // Subject (user ID)
  nickname: string; // User's nickname
};

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('vauth', {
    sign: async (payload: CoreClaims) => {
      return fastify.jwt.sign(payload);
    },
    verify: async (token: string) => {
      return fastify.jwt.verify(token);
    },
  });
  // Bcryptjs - plugin could be used.
  fastify.decorate('bcrypt', bcrypt);
};

declare module 'fastify' {
  interface FastifyInstance {
    vauth: {
      sign: (payload: CoreClaims) => Promise<string>;
      verify: (token: string) => Promise<CoreClaims>;
    }
  }
}

export default fp(authPlugin, {
  name: 'auth-plugin',
});
