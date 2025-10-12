import { FastifyRequest, FastifyReply } from 'fastify';
import { TournamentInfo } from './types/types';
import { onRecordTournamentMessage } from './io.handler';

export async function display_tournament_message(request: FastifyRequest<{ Body: {msg: string, user1_id: number, user2_id: number }}>, reply: FastifyReply)
{
  const { msg, user1_id, user2_id } = request.body;
  
    onRecordTournamentMessage(msg, user1_id);
    onRecordTournamentMessage(msg, user2_id);
    
    reply.send(201);

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
