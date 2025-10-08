import { Player, GameRoom, tournamentRooms, TournamentRoom, gameRooms } from './types/types';
import { io } from './server';
import { startGame, abortGame } from './game';
import { deleteRoom } from './room';
import { abort } from 'process';

export function startTournament(roomId: string) {
    const room = tournamentRooms[roomId];
    if (!room) {
        console.error(`[Server] TournamentRoom ${roomId} not found`);
        deleteRoom(roomId);
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
        deleteRoom(room.id);
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
    
    room.owner = owner;        // Aktuelle Match-Teilnehmer
    room.guest = guest;
    room.ownerMovement = 'none';
    room.guestMovement = 'none';
    room.matchCount += 1;
    room.gameState = {
        ballX: 400,
        ballY: 300,
        ballVX: 5 * (Math.random() > 0.5 ? 1 : -1),
        ballVY: 3 * (Math.random() > 0.5 ? 1 : -1),
        lastUpdate: Date.now(),
    };
    
    gameRooms[room.id] = room as any;
    
    owner.score = 0;
    guest.score = 0;
    owner.paddleY = 250;
    guest.paddleY = 250;

    try {
        io.to(room.id).emit('tournament_match_start', {
            player1: owner.nickname,
            player2: guest.nickname,
            roomId: room.id,
            owner: cleanPlayerForSocket(room.owner),
            guest: cleanPlayerForSocket(room.guest),
            matchNumber: room.matchCount,
            message: `Match ${room.matchCount}: ${room.owner.nickname} vs ${room.guest.nickname}`
        });
        console.log(`[Server] Tournament match start broadcasted for room ${room.id}`);
    } catch (error) {
        console.log(`[Server] Tournament match start broadcast failed for room ${room.id}:`, error);
    }
    startGame(room as any);
}

function cleanPlayerForSocket(player: Player) {
    return {
        id: player.id,
        nickname: player.nickname,
        roomId: player.roomId,
        paddleY: player.paddleY,
        score: player.score,
    };
}

export function handleTournamentGameEnd(room: GameRoom, winner: string) {
    const tournamentRoom = tournamentRooms[room.id] as TournamentRoom;
    
    if (!tournamentRoom) {
        console.error(`[Server] Tournament room ${room.id} not found`);
        if (room) deleteRoom(room.id);
        return;
    }

    let winnerPlayer: Player | null = null;
    let loserPlayer: Player | null = null;

    if (winner === 'owner') {
        winnerPlayer = room.owner;
        loserPlayer = room.guest;
    } else if (winner === 'guest') {
        winnerPlayer = room.guest;
        loserPlayer = room.owner;
    } else {
        console.error(`[Server] Invalid winner: ${winner}`);
        io.to(room.id).emit('room_error', { message: 'Invalid winner' });
        abortGame(room);
        if (room) deleteRoom(room.id);
        return;
    }

    if (!winnerPlayer || !loserPlayer) {
        console.error(`[Server] Players not found in room ${room.id}`);
        io.to(room.id).emit('room_error', { message: 'Players not found' });
        abortGame(room);
        if (room) deleteRoom(room.id);
        return;
    }

    console.log(`[Server] Tournament match ended. Winner: ${winnerPlayer.nickname}`);

    // Verlierer eliminieren
    tournamentRoom.lostPlayers.push(loserPlayer);
    
    // Gewinner für nächste Runde setzen
    tournamentRoom.lastWinner = winnerPlayer;
    
    // Game State zurücksetzen für nächstes Match
    tournamentRoom.owner = undefined;
    tournamentRoom.guest = undefined;
    tournamentRoom.gameState = undefined;
    tournamentRoom.ownerMovement = 'none';
    tournamentRoom.guestMovement = 'none';

    try {
        io.to(room.id).emit('tournament_match_end', {
            winner: winnerPlayer.id,
            winnerName: winnerPlayer.nickname,
            loser: loserPlayer.id,
            loserName: loserPlayer.nickname,
            message: `🎉 ${winnerPlayer.nickname} defeated ${loserPlayer.nickname}!`
        });
    } catch (error) {
        console.log(`[Server] Tournament match end broadcast failed:`, error);
    }

    // Nächstes Match nach Pause
    setTimeout(() => {
        startMatch(tournamentRoom);
    }, 2000);
}
