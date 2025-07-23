import { JWT } from '@fastify/jwt';

declare module 'fastify' {
  interface FastifyRequest {
    jwtVerify(): Promise<{ id: string; email: string }>;
  }
  interface FastifyInstance {
    jwt: JWT;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string }; 
    user: {
      id: string;
      email: string;
    }
  }
}