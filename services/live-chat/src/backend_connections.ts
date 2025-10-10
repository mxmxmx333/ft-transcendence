import { FastifyRequest, FastifyReply } from 'fastify';
import { TournamentInfo } from './types/types';

export async function display_tournament_message(
  request: FastifyRequest<{ Body: TournamentInfo }>,
  reply: FastifyReply
) {
  const { playerA, playerB, timeToStart } = request.body;
  // process the request.
  reply.send(201);

  // catch reply.send(HTTP_ERR)
}

export async function profile_update(
  request: FastifyRequest<{ Body: TournamentInfo }>,
  reply: FastifyReply
) {
  const { playerA, playerB, timeToStart } = request.body;
  // process the request.
  reply.send(201);

  // catch reply.send(HTTP_ERR)
}
