import Fastify, { fastify } from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'path';
import cors from '@fastify/cors';
import proxy from '@fastify/http-proxy';
import dotenv from 'dotenv';
dotenv.config();

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const isDevelopment = process.env.NODE_ENV === 'development';


const upstreamUrl = process.env.GATEWAY_UPSTREAM;
if (!upstreamUrl) {
  throw new Error('GATEWAY_UPSTREAM environment variable is not set');
}

async function buildServer() {
  const server = Fastify({
    logger: {
      level: LOG_LEVEL,

      ...(process.env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: false,
              },
            },
          }
        : {}), // In Production füge nichts hinzu
    },
  });
  // CORS
  const publicRoot = isDevelopment
    ? path.join(__dirname, '../../../public')
    : path.join(__dirname, '../public');
    await server.register(fastifyStatic, {
        root: publicRoot,
        prefix: '/',
        wildcard: false,
    });
    // Proxy to the bakend service
    await server.register(proxy, {
        upstream: upstreamUrl || 'http://backend:3001',
        prefix: '/api',
        rewritePrefix: '/api',
        httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    });

    // Error handling
    server.setNotFoundHandler((request, reply) => {
        server.log.warn({url: request.url, method: request.method}, 'Not Found');
        reply.status(404).send({ error: 'Not Found' });
    });
    return server;
}

async function start() {
    const server = await buildServer();
    
    try {
        await server.listen({ port: 3000, host: '0.0.0.0' });
        server.log.info(`API Gateway running at http://localhost:3000`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

start();
