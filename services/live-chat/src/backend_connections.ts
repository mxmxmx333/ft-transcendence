import { FastifyRequest, FastifyReply } from 'fastify';
import { onRecordTournamentMessage, onUpdateUserInfo } from './io.handler';
import { sendUserEvent } from './types/types';

export async function display_tournament_message(request: FastifyRequest<{ Body: {msg: string, user1_id: number, user2_id: number }}>, reply: FastifyReply)
{
  const { msg, user1_id, user2_id } = request.body;
  
    onRecordTournamentMessage(msg, user1_id);
    onRecordTournamentMessage(msg, user2_id);
    
    reply.status(201).send();

}

export async function updateUserInfo(request: FastifyRequest<{ Body: sendUserEvent }>, reply: FastifyReply)
{
  const updated = request.body;
  
  try {
    onUpdateUserInfo(updated);
    reply.status(201).send();
  }
  catch (error) {
		console.error("[DB] Error: ", error);
    reply.status(500).send();
	}
}