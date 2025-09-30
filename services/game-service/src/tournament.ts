import { Player, GameRoom, tournamentRooms } from './types/types';
import { io } from './server';
import { startGame, abortGame } from './game';

export function startTournament(roomId: string) {
    const room = tournamentRooms[roomId];
    if (!room) {
        console.error(`[Server] TournamentRoom ${roomId} not found`);
        return;
    }
    console.log(`[Server] Starting tournament in room ${roomId}`);
    for (const player of room.players) {
        if (player == room.owner) continue;
        try {
            const gameroom: GameRoom = {
                id: roomId,
                gameType: 'tournament',
                owner: room.lastWinner ? room.lastWinner : room.owner,
                guest: player,
                ownerMovement: 'none',
                guestMovement: 'none',
                gameState: {
                    ballX: 400,
                    ballY: 300,
                    ballVX: 5 * (Math.random() > 0.5 ? 1 : -1),
                    ballVY: 3 * (Math.random() > 0.5 ? 1 : -1),
                    lastUpdate: Date.now(),
                },
                isPrivate: true,
            };
            room.gameRoom = gameroom;            
        }
        catch (error) {
            console.error(`[Server] Error starting game between ${room.lastWinner ? room.lastWinner.id : room.owner?.id} and ${player.id}:`, error);
            continue;
            // To-Do: error handling
        }
        if (!room.gameRoom) {
            console.error(`[Server] GameRoom not created for players ${room.lastWinner ? room.lastWinner.id : room.owner?.id} and ${player.id}`);
            continue;
        }
        startGame(room.gameRoom);
        const winner = room.gameRoom.owner!.score >= 10 ? 'owner' : 'guest';
        const winnerPlayer = winner === 'owner' ? room.gameRoom.owner : room.gameRoom.guest;
        room.lastWinner = winnerPlayer;
    }

    try {
        io.to(room.id).emit('tournament_winner', {winner: room.lastWinner?.id, message: `Tournament over! ${room.lastWinner?.nickname} wins!`});
    } catch (error) {
        console.log(`[Server] Tournament winner broadcast failed for room ${room.id}:`, error);
    }
}


