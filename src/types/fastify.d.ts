import { JWT } from '@fastify/jwt';

declare module 'fastify' {
  interface FastifyRequest {
    jwtVerify(): Promise<{ id: string; email: string }>; // Özelleştirilmiş tip
  }
  interface FastifyInstance {
    jwt: JWT;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string }; // Payload tipi
    user: {
      id: string;
      email: string;
    } // User tipi
  }
}