import { Player, GameRoom, tournamentRooms, TournamentRoom, gameRooms } from './types/types';
import { io } from './server';
import { startGame, abortGame } from './game';

export function startTournament(roomId: string) {
    const room = tournamentRooms[roomId];
    if (!room) {
        console.error(`[Server] TournamentRoom ${roomId} not found`);
        return;
    }
    console.log(`[Server] Starting tournament in room ${roomId}`);

    startMatch(room);
}

function startMatch(room: TournamentRoom) {
    if (!room) {
        console.error(`[Server] TournamentRoom not found`);
        return;
    }
    if (room.players.length < 1) {
        console.log(`[Server] Tournament in room ${room.id} finished - no more players left`);
        try {
            io.to(room.id).emit('tournament_winner', {winner: room.lastWinner?.id, message: `Tournament over! ${room.lastWinner?.nickname} wins!`});
        } catch (error) {
            console.log(`[Server] Tournament over broadcast failed for room ${room.id}:`, error);
        }
        delete tournamentRooms[room.id];
        return;
    }
    console.log(`[Server] Starting matches for tournament in room ${room.id} with ${room.players.length} players`);
    
    console.debug(`[Server] players: ${room.players.map(p => p.nickname).join(', ')}`);

    let owner: Player | null = null;
    let guest: Player | null = null;

    if (room.lastWinner) {
        owner = room.lastWinner;
        guest = room.players[0];
        room.players = room.players.slice(1);
    }
    else {
        owner = room.players[0];
        guest = room.players[1];
        room.players = room.players.slice(2);
    }
    console.debug(`[Server] players: ${room.players.map(p => p.nickname).join(', ')}`);
    console.log(`[Server] Starting match between ${owner.nickname} and ${guest.nickname} in tournament room ${room.id}`);
    try {
        const gameroom: GameRoom = {
            id: room.id,
            gameType: 'tournament',
            owner: owner,
            guest: guest,
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
        gameRooms[gameroom.id] = gameroom;      
    }
    catch (error) {
        console.error(`[Server] Error preparing game between ${owner.nickname} and ${guest.nickname}:`, error);
        return;
        // To-Do: error handling (disconnection)
    }
    if (!room.gameRoom) {
        console.error(`[Server] GameRoom not created for players ${owner.nickname} and ${guest.nickname}`);
        return;
    }
    try {
        io.to(room.id).emit('tournament_match_start');
        console.log(`[Server] Tournament match start broadcasted for room ${room.id}`);
    } catch (error) {
        console.log(`[Server] Tournament match start broadcast failed for room ${room.id}:`, error);
    }
    startGame(room.gameRoom);
}

export function handleTournamentGameEnd(room: GameRoom, winner: string) {
    if (room.gameType !== 'tournament' || !tournamentRooms[room.id]) {
        console.error(`[Server] handleTournamentGameEnd called for non-tournament room ${room.id}`);
        return;
    }
    const tournamentRoom = tournamentRooms[room.id];
    let winnerPlayer: Player | null = null;
    let loserPlayer: Player | null = null;

    if (winner === 'owner') {
        winnerPlayer = room.owner;
        loserPlayer = room.guest;
    } else if (winner === 'guest') {
        winnerPlayer = room.guest;
        loserPlayer = room.owner;
    } else {
        console.error(`[Server] Invalid winner identifier ${winner} in room ${room.id}`);
        return;
    }

    if (!winnerPlayer || !loserPlayer) {
        console.error(`[Server] Winner or loser player not found in room ${room.id}`);
        return;
    }

    console.log(`[Server] Tournament match in room ${room.id} ended. Winner: ${winnerPlayer.nickname}, Loser: ${loserPlayer.nickname}`);

    // Verlierer zur Liste der ausgeschiedenen Spieler hinzufügen
    tournamentRoom.lostPlayers.push(loserPlayer);

    // Gewinner als letzten Gewinner setzen
    tournamentRoom.lastWinner = winnerPlayer;

    // GameRoom zurücksetzen
    tournamentRoom.gameRoom = null;

    try {
        io.to(tournamentRoom.id).emit('tournament_match_end', {
            winner: winnerPlayer.id,
            loser: loserPlayer.id,
            message: `${winnerPlayer.nickname} won against ${loserPlayer.nickname}!`
        });
    } catch (error) {
        console.log(`[Server] Tournament match ended broadcast failed for room ${tournamentRoom.id}:`, error);
    }
    // startMatch(tournamentRoom);

    // ✅ Nächstes Match nach kurzer Pause starten
    setTimeout(() => {
        startMatch(tournamentRoom!);
    }, 2000);
}
