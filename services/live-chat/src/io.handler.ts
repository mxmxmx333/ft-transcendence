import {server} from './server'
import { Socket, Server as SocketIOServer} from 'socket.io';
import { UserChatInfo} from './types/types';
import { authUserServiceUpstream } from './server';
import { fr } from 'zod/v4/locales';

const tournamentID = 0;
const activeUsers = new Map<number, UserChatInfo>();

export function registerIoHandlers(io: SocketIOServer)
{
	io.on("connection", async (socket) => {
		console.log(`[Live Chat Socket] New connection from ${socket.id} by user ${socket.user?.nickname || 'unknown'}`);
		
		if (!socket.user)
		{
			console.error(`[Live Chat Socket] No user data found for socket ${socket.id}`);
			socket.disconnect();
			return;
		}
		
		const userID = Number(socket.user!.id);
		const userNickname = socket.user.nickname;

		// try {
		// 	  const resp = await fetch(`${authUserServiceUpstream}/someroute`, {
		// 		method: 'GET',
		// 		headers: { "x-user-id": userID.toString() }, // Convert number to string
		// 	  });
		
		// 	  const interfaceData = await resp.json(); // or resp.text(), resp.blob(), etc.
		// 	} catch (error) {
		// 	  console.error('Fetch error:', error);
		// 	}

		const info: UserChatInfo = {
			socket: socket,
			activeChatID: null,
			currentTargetID: -1,
			invitations: {sent: [], received: []}
		};
		activeUsers.set(userID, info);
		
		recordInfoToDatabase(userID, userNickname);
		goOnline(userID);
		onSearchUsers(socket);
		onGetFriends(socket, userID);
		onGetBlocked(socket, userID);
		onGetRequests(socket, userID);
		onCheckRequest(socket, userID);
		onRecordRequest(socket, userID);
		onUpdateRequestStatus(socket, userID);
		onAcceptRequest(socket, userID);
		onDeclineRequest(socket, userID);
		onRemoveFriend(socket, userID);
		onBlockUser(socket, userID);
		onUnblockUser(socket, userID);
		onCheckBlocks(socket, userID);
		onLoadMessages(socket, userID);
		onLoadMoreMessages(socket, userID);
		onRecordMessage(socket, userID);
		onLoadChats(socket, userID);
		onGetOnlineStatus(socket);
		onLoadTournamentMessages(socket, userID);
		onLoadMoreTournamentMessages(socket, userID);
		onRecordOrCheckGameInvitation(socket, userID);
		onDeleteInvitation(socket, userID);
		onRoomIdCreated(socket, userID);
		
	
		socket.on("update chat and target info", (id: number, type: string) => {
			activeUsers.get(userID)!.activeChatID = type === "chatID" ? id : null;
			activeUsers.get(userID)!.currentTargetID = id;
		});
		
		socket.on("ping", (callback: () => void) => {
			callback();
		});
		
		socket.on("disconnect", (reason) => {
			console.log(`[Live Chat Socket] User ${userID} disconnected (${reason})`);
			activeUsers.delete(userID);
			goOffline(userID);
		});
	});
}



function recordInfoToDatabase(userID: number, userNickname: string)
{
	try
	{
		const stmt = server.db.prepare(`
			INSERT OR IGNORE INTO users (id, nickname)
			VALUES (?, ?)`
		);
		stmt.run(userID, userNickname);
	}
	catch (err) {
		console.error("[DB LiveChat] Error: ", err);
	}
}


// --- Online Status ---

function goOnline(userID: number)
{
	activeUsers.forEach(user => {
		if (user.activeChatID === userID || user.currentTargetID === userID)
			user.socket.emit("i am online", userID);
	})
}

function goOffline(userID: number)
{
	activeUsers.forEach(user => {
		if (user.activeChatID === userID || user.currentTargetID === userID)
			user.socket.emit("bye bye", userID);
		
		// clear invitations that others have sent to you - when back online, you get fresh invitations state
		if (user.invitations.sent.includes(userID))
			user.invitations.sent = user.invitations.sent.filter(id => id !== userID);
		// clear invitations that you have sent to others
		if (user.invitations.received.includes(userID))
			user.invitations.received = user.invitations.received.filter(id => id !== userID);
	})
}

function onGetOnlineStatus(socket: Socket)
{
	socket.on("get online status", (target_id: number, callback: (status: string) => void) => {
		if (activeUsers.get(target_id))
			callback("Online");
		else
			callback("Offline");
	});
}


// --- For rendering lists + search bar results ---

function onSearchUsers(socket: Socket)
{
	socket.on("search in users", (input: string, callback: (users: any[]) => void) => {
		try
		{
			const stmt = server.db.prepare(`SELECT id, nickname, avatar FROM users WHERE nickname LIKE ?`);
			const users = stmt.all(`%${input}%`) as {id: number, nickname: string, avatar: string}[];
			const filtered = users.filter(u => u.nickname !== socket.user!.nickname)
			callback(filtered);
		}
		catch (err)
		{
			console.error("[DB] Error while searching: ", err);
			callback([]);
		}
	});
}

function onGetFriends(socket: Socket, userID: number)
{
	socket.on("search in friendships", (callback: (friends: any[]) => void) => {
		try
		{
			const stmt = server.db.prepare(`
				SELECT user1_id, user2_id FROM lc_friendships
				WHERE user1_id = ? OR user2_id = ?`);
			const pairs = stmt.all(userID, userID) as
								{user1_id: number, user2_id: number}[];
			
			let friendsIDs: number[] = [];
			pairs.forEach(pair => {
				friendsIDs.push(pair.user1_id === userID ? pair.user2_id : pair.user1_id)
			});
			
			if (friendsIDs.length === 0) { callback([]); return; }
			
			const stmt2 = server.db.prepare(`
					SELECT id, nickname, avatar FROM users
					WHERE id IN (${friendsIDs.map(() => '?').join(',')})
					ORDER BY nickname ASC`);
			const friends = stmt2.all(...friendsIDs);
			callback(friends);
		}
		catch (err)
		{
			console.error("[DB] Error while searching: ", err);
			callback([]);
		}
	});
}

function onGetBlocked(socket: Socket, userID: number)
{
	socket.on("search for blocked", (callback: (blocked: any[]) => void) => {
		try
		{
			const stmt = server.db.prepare(`
				SELECT users.id, users.nickname, users.avatar
				FROM lc_friendships
				JOIN users ON (user1_id = ? AND user2_blocked = true AND users.id = user2_id)
							OR (user2_id = ? AND user1_blocked = true AND users.id = user1_id)
				ORDER BY users.nickname`);
			const blocked = stmt.all(userID, userID) as {id: number, nickname: string, avatar: string}[];
			callback(blocked);
		}
		catch (err)
		{
			console.error("[DB] Error while searching: ", err);
			callback([]);
		}
	});
}

function onGetRequests(socket: Socket, userID: number)
{
	socket.on("search in requests", (callback: (requests: any[]) => void) => {
		try
		{
			// const stmt = server.db.prepare(`SELECT sender_id FROM requests WHERE receiver_id = ?`);
			// const results = stmt.all(userID) as {sender_id: number}[];
			// const requests_IDs = results.map(e => e.sender_id);
			
			// if (requests_IDs.length === 0) { callback([]); return; }
			
			// const stmt2 = server.db.prepare(`
			// 		SELECT id, nickname FROM users
			// 		WHERE id IN (${requests_IDs.map(() => '?').join(',')})
			// 		ORDER BY created_at DESC`);
			// const requests = stmt2.all(...requests_IDs);
			// callback(requests);
			
			const stmt = server.db.prepare(`
				SELECT users.id, users.nickname, users.avatar, lc_requests.status
				FROM lc_requests
				JOIN users ON users.id = lc_requests.sender_id
				WHERE lc_requests.receiver_id = ?
				ORDER BY lc_requests.created_at DESC`);
			
			const requests = stmt.all(userID) as {id: number, nickname: string, avatar: string, status: string}[];
			
			callback(requests);
		}
		catch (err)
		{
			console.error("[DB] Error while searching: ", err);
			callback([]);
		}
	});
}


// --- Friends Management ---

function onCheckRequest(socket: Socket, userID: number)
{
	socket.on("check request sent", (id: number, callback: (status: string) => void) => {
		try
		{
			const stmt = server.db.prepare(`
				SELECT receiver_id, sender_id FROM lc_requests
				WHERE receiver_id = ? AND sender_id = ?`);
			const result = stmt.get(id, userID);
			if (!result)
				callback("not sent");
			else
				callback("sent");
		}
		catch (err)
		{
			console.error("[DB] Error while searching: ", err);
			callback("error");
		}
	})
}

function onRecordRequest(socket: Socket, userID: number)
{
	socket.on("record request", (target_id: number, callback: (status: string) => void) => {
		try
		{
			const stmt = server.db.prepare(`
				INSERT INTO lc_requests (receiver_id, sender_id) VALUES (?, ?)`);
			stmt.run(target_id, userID);
			
			// Send real time notification to user if active
			const receiver = activeUsers.get(target_id);
			if (receiver)
				receiver.socket.emit("received request", userID);

			callback("success");
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback("error");
		}
	})
}

function onUpdateRequestStatus(socket: Socket, userID: number)
{
	socket.on("update request status", (from_id: number, callback: () => void) => {
		try
		{
			const stmt = server.db.prepare(`
				UPDATE lc_requests
				SET status = ?
				WHERE receiver_id = ? AND sender_id = ?`);
			stmt.run("viewed", userID, from_id);
			callback();
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback();
		}
	})
}

function onAcceptRequest(socket: Socket, userID: number)
{
	socket.on("accept friend request", (from_id: number, callback: (status: string) => void) => {
		try
		{
			// Always put lower id first --> automatic check for potential duplicates
			const user1_id = Math.min(userID, from_id);
			const user2_id = Math.max(userID, from_id);
			const stmt = server.db.prepare(`
				INSERT OR IGNORE INTO lc_friendships (user1_id, user2_id) VALUES (?, ?)`);
			stmt.run(user1_id, user2_id);
			
			const stmt2 = server.db.prepare(`
				DELETE FROM lc_requests WHERE receiver_id = ? AND sender_id = ?`);
			stmt2.run(userID, from_id);
			
			// Notify other side if active
			const receiver = activeUsers.get(from_id);
			if (receiver)
				receiver.socket.emit("your request is accepted", userID);
			callback("success");
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback("error");
		}
	})
}

function onDeclineRequest(socket: Socket, userID: number)
{
	socket.on("decline friend request", (from_id: number, callback: (status: string) => void) => {
		try
		{
			const stmt = server.db.prepare(`
				DELETE FROM lc_requests WHERE receiver_id = ? AND sender_id = ?`);
			stmt.run(userID, from_id);
			
			// Notify other side if active
			const receiver = activeUsers.get(from_id);
			if (receiver)
				receiver.socket.emit("your request is declined", userID);
			callback("success");
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback("error");
		}
	})
}

function onRemoveFriend(socket: Socket, userID: number)
{
	// Removing friend will also delete messages
	socket.on("remove friend", (target_id: number, callback: (status: string) => void) => {
		try
		{
			const user1_id = Math.min(userID, target_id);
			const user2_id = Math.max(userID, target_id);
			const stmt = server.db.prepare(`
				DELETE FROM lc_friendships
				WHERE (user1_id = ? AND user2_id = ?)`);
			stmt.run(user1_id, user2_id);
			
			const receiver = activeUsers.get(target_id);
			if (receiver)
				receiver.socket.emit("got removed from friends", userID);
			callback("success");
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback("error");
		}
	})
}

function onBlockUser(socket: Socket, userID: number)
{
	socket.on("block user", (target_id: number, callback: (status: string) => void) => {
		try
		{
			const user1_id = Math.min(userID, target_id);
			const user2_id = Math.max(userID, target_id);
			const stmt = server.db.prepare(`
				UPDATE lc_friendships
				SET user1_blocked = CASE
									WHEN user2_id = ? THEN true ELSE user1_blocked
									END,
					user2_blocked = CASE
									WHEN user1_id = ? THEN true ELSE user2_blocked
									END
				WHERE user1_id = ? AND user2_id = ?`);
			stmt.run(userID, userID, user1_id, user2_id);
			
			const receiver = activeUsers.get(target_id);
			if (receiver)
				receiver.socket.emit("you got blocked", userID);
			callback("success");
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback("error");
		}
	})
}

function onUnblockUser(socket: Socket, userID: number)
{
	socket.on("unblock user", (target_id: number, callback: (status: string) => void) => {
		try
		{
			const user1_id = Math.min(userID, target_id);
			const user2_id = Math.max(userID, target_id);
			const stmt = server.db.prepare(`
				UPDATE lc_friendships
				SET user1_blocked = CASE
									WHEN user2_id = ? THEN false ELSE user1_blocked
									END,
					user2_blocked = CASE
									WHEN user1_id = ? THEN false ELSE user2_blocked
									END
				WHERE user1_id = ? AND user2_id = ?`);
			stmt.run(userID, userID, user1_id, user2_id);
			
			const receiver = activeUsers.get(target_id);
			if (receiver)
				receiver.socket.emit("you got unblocked", userID);
			callback("success");
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback("error");
		}
	})
}

function onCheckBlocks(socket: Socket, userID: number)
{
	socket.on("check blocks", (target_id: number, callback: (status: string) => void) => {
		try
		{
			const user1_id = Math.min(userID, target_id);
			const user2_id = Math.max(userID, target_id);
			const stmt = server.db.prepare(`
				SELECT user1_id, user2_id, user1_blocked, user2_blocked
				FROM lc_friendships
				WHERE user1_id = ? AND user2_id = ?`);
			const raw_result = stmt.get(user1_id, user2_id) as {user1_id: number, user2_id: number,
													user1_blocked: number, user2_blocked: number};
			
			if (!raw_result)
				return(callback("not friends"));
			
			// SQLite stores booleans as 0/1 so it returns type number on it 
			// so I need to convert it to be able to use true/false here
			const result = {
				user1_id: raw_result.user1_id,
				user2_id: raw_result.user2_id,
				user1_blocked: !!raw_result.user1_blocked,
				user2_blocked: !!raw_result.user2_blocked
			};
			
			if (result.user1_blocked === false && result.user2_blocked === false)
				callback("no blocks");
			else if (result.user1_blocked === true && result.user2_blocked === true)
				callback("mutual block");
			else if (result.user1_blocked === true)
				callback(result.user1_id === userID ? "blocked by target" : "target blocked");
			else
				callback(result.user2_id === userID ? "blocked by target" : "target blocked");
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback("error");
		}
	})
}


// --- For Messages ---

function onLoadMessages(socket: Socket, userID: number)
{
	socket.on("load messages", (target_id: number, callback: (messages: any[]) => void) =>{
		try
		{
			const user1_id = Math.min(userID, target_id);
			const user2_id = Math.max(userID, target_id);
			const stmt = server.db.prepare(`
				SELECT m.sender_id, m.message, m.created_at, m.conversation_id
				FROM messages m
				JOIN lc_friendships f ON m.conversation_id = f.id
				WHERE f.user1_id = ? AND f.user2_id = ?
				ORDER BY m.created_at DESC
				LIMIT 50`);
			const msgs = stmt.all(user1_id, user2_id) as {
				sender_id: number, message: string, created_at: string, conversation_id: number}[];
			
			if (msgs.length > 0)
			{
				// Reset unread count
				const stmt2 = server.db.prepare(`
						INSERT INTO unread_counter (conversation_id, receiver_id, amount)
						VALUES (?, ?, ?)
						ON CONFLICT (conversation_id, receiver_id)
						DO UPDATE SET amount = 0`);
				stmt2.run(msgs[0].conversation_id, userID, 0);
			}
			callback(msgs);
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback([]);
		}
	})
}

function onLoadMoreMessages(socket: Socket, userID: number)
{
	socket.on("load more messages", (target_id: number, lastLoaded: string, callback: (messages: any[]) => void) =>{
		try
		{
			const user1_id = Math.min(userID, target_id);
			const user2_id = Math.max(userID, target_id);
			const stmt = server.db.prepare(`
				SELECT m.sender_id, m.message, m.created_at
				FROM messages m
				JOIN lc_friendships f ON m.conversation_id = f.id
				WHERE f.user1_id = ? AND f.user2_id = ? AND m.created_at < ?
				ORDER BY m.created_at DESC
				LIMIT 50`);
			const msgs = stmt.all(user1_id, user2_id, lastLoaded);
			callback(msgs);
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback([]);
		}
	})
}

function onRecordMessage(socket: Socket, userID: number)
{
	socket.on("record message", (target_id: number, msg: string, timeDbFormat: string, callback: (status: string) => void) => {
		try
		{
			const user1_id = Math.min(userID, target_id);
			const user2_id = Math.max(userID, target_id);
			const stmt = server.db.prepare(`
				SELECT u.nickname, u.avatar, f.id AS convo_id, f.user1_id, f.user2_id, f.user1_blocked, f.user2_blocked
				FROM lc_friendships f
				JOIN users u ON u.id = ?
				WHERE f.user1_id = ? AND f.user2_id = ?`);
			const raw_f_result = stmt.get(userID, user1_id, user2_id) as {nickname: string, avatar: string, convo_id: number,
				user1_id: number, user2_id: number, user1_blocked: number, user2_blocked: number};
			
			if (!raw_f_result)
				return (callback("error"));
			
			// SQLite stores booleans as 0/1 so it returns type number on it 
			// so I need to convert it to be able to use true/false here
			const f_result = {
				sender_nickname: raw_f_result.nickname,
				avatar: raw_f_result.avatar,
				convo_id: raw_f_result.convo_id,
				user1_id: raw_f_result.user1_id,
				user2_id: raw_f_result.user2_id,
				user1_blocked: !!raw_f_result.user1_blocked,
				user2_blocked: !!raw_f_result.user2_blocked
			};
			
			if (!(f_result.user1_blocked === false && f_result.user2_blocked === false))
				callback("error")
			else
			{
				const stmt2 = server.db.prepare(`
					INSERT INTO messages (conversation_id, sender_id, message, created_at)
					VALUES (?, ?, ?, ?)`);
				stmt2.run(f_result.convo_id, userID, msg, timeDbFormat);
				
				const receiver = activeUsers.get(target_id);
				if (receiver && receiver.activeChatID === userID)
				{
					// User is active an have an open chat -> no notification, just send message
					receiver.socket.emit("received message", userID, f_result.sender_nickname, f_result.avatar, msg, timeDbFormat);
					callback("success");
					return;
				}
				
				// Store/update unread count in db since the receiver
				// is not in chat or is offline
				const stmt3 = server.db.prepare(`
					INSERT INTO unread_counter (conversation_id, receiver_id, amount)
					VALUES (?, ?, ?)
					ON CONFLICT (conversation_id, receiver_id)
					DO UPDATE SET amount = amount + 1
					RETURNING amount`);
				const returned = stmt3.get(f_result.convo_id, target_id, 1) as {amount: number};
				
				// Send current unread count and msg for the last Msg preview
				// if the user is online
				if (receiver)
					receiver.socket.emit("update notification", userID, f_result.sender_nickname, f_result.avatar, msg, returned.amount);
				callback("success");
			}
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback("error");
		}
	})
}

function onLoadChats(socket: Socket, userID: number)
{
	socket.on("load chats", (callback: (chats: any[]) => void) => {
		try
		{
			/*
			EXPLANATION OF --> JOIN (
									SELECT conversation_id, MAX(created_at) AS newest_timestamp
									FROM messages
									GROUP BY conversation_id
									) lm ON lm.conversation_id = f.id
										
			So this is something called subquery, it will "create" a new table with
			these restrictions, that we can JOIN. GROUP BY will merge all rows
			with the same conversation_id into one row, MAX(created_at) is telling it
			to leave in this row the MAX value of created_at (the latest timestamp)
			There are other 'functions' like MAX() that can be used with GROUP BY,
			anyway it needs always one additional thing to tell it which row to leave
			at the end. So basically this will extract most recent message timestamp
			for all conversations, which I then later use on JOIN messages to extract
			exactly one newest message from the messages table.
			
			--- EXPLANATION OF 'LEFT JOIN' ---
			
				Normal JOIN would discard the whole row if there would be no match.
				If there is no match on JOIN messages, I lose the whole row and that's
				fine because I don't care about it if there are no messages.
				If there are messages, but unread_counter doesn't have a match,
				I would lose the row with the latest message.
				LEFT JOIN marks the values as NULL if there is no match and keeps the whole row.
			*/
			
			const stmt = server.db.prepare(`
				SELECT u.id, u.nickname, u.avatar, m.message, uc.amount, m.created_at AS created_at
				FROM lc_friendships f
				JOIN (
					SELECT conversation_id, MAX(created_at) AS newest_timestamp
					FROM messages
					GROUP BY conversation_id
					) lm ON lm.conversation_id = f.id
				JOIN messages m ON m.conversation_id = lm.conversation_id
								AND m.created_at = lm.newest_timestamp
				JOIN users u ON u.id IN (f.user1_id, f.user2_id) AND u.id != ?
				LEFT JOIN unread_counter uc ON m.conversation_id = uc.conversation_id AND receiver_id = ?
				WHERE (f.user1_id = ? OR f.user2_id = ?)
				
				UNION ALL
				
				SELECT ${tournamentID} AS id, 'Tournament' AS nickname, 'T' AS avatar, message, tuc.amount, tm.created_at AS created_at
				FROM (
					SELECT *
					FROM tournament_msgs
					WHERE receiver_id = ?
					ORDER BY created_at DESC
					LIMIT 1) tm
				LEFT JOIN tournament_unread_counter tuc ON tuc.receiver_id = tm.receiver_id
				
				ORDER BY created_at DESC`);
			const result = stmt.all(userID, userID, userID, userID, userID) as {
				id: number, nickname: string, avatar: string, message: string, amount: number | null, created_at: string}[];
			result.forEach(e => {
				if (!e.amount)
					e.amount = 0;
			});
			callback(result);
			
			// UNION ALL --> this will append the result(rows) of second SELECT to the first SELECT
			// IF the rows values types from second SELECT match exactly with the first (type and order)
			// This is why I add --> 0 AS id, 'Tournament' AS nickname <-- because tournament_msgs
			// doesn't have these columns (it doesn't need them), but i need it here so I can append
			// the result of second SELECT to the first. At the point of UNION ALL the first SELECT
			// will already create the result table, to which I will append result of second SELECT.
			// FROM ('subquery') tm, will give me the latest message from tournament sent to receiver_id.
			// It is in such subquery, because i can't use two 'ORDER BY' in one main query and I need
			// it while getting the latest message from tournament. I also use LIMIT 1, because I only
			// need one result. In first SELECT I can't do it the same way, cause I need to get and match
			// latest messages for ALL conversations, and I don't know how many there can be. In tournament_msgs
			// it's like I'm getting latest message for one specific 'friendship', not all of them.
			// Names of columns in second SELECT don't matter for appending it to the first SELECT.
			// What matters is just type of value in column and their order.
			
			// UNION ALL --> appends result rows even if they are exactly the same as in first table
			// UNION 	 --> appends only unique rows and discards duplicates
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback([]);
		}
	})
}


// --- For Tournament Messages ---

function onLoadTournamentMessages(socket: Socket, userID: number)
{
	socket.on("load tournament messages", (callback: (tmsgs: any[]) => void) => {
		try
		{
			const stmt = server.db.prepare(`
				SELECT message, created_at
				FROM tournament_msgs
				WHERE receiver_id = ?
				ORDER BY created_at DESC
				LIMIT 50`);
			const tmsgs = stmt.all(userID) as {message: string, created_at: string}[];
			
			if (tmsgs.length > 0)
			{
				const stmt2 = server.db.prepare(`
					INSERT INTO tournament_unread_counter (receiver_id, amount)
					VALUES (?, ?)
					ON CONFLICT (receiver_id)
					DO UPDATE SET amount = 0`);
				stmt2.run(userID, 0);
			}
			callback(tmsgs);
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback([]);
		}
	});
}

function onLoadMoreTournamentMessages(socket: Socket, userID: number)
{
	socket.on("load more tournament messages", (lastLoaded: string, callback: (tmsgs: any[]) => void) => {
		try
		{
			const stmt = server.db.prepare(`
				SELECT message, created_at
				FROM tournament_msgs
				WHERE receiver_id = ? AND created_at < ?
				ORDER BY created_at DESC
				LIMIT 50`);
			const tmsgs = stmt.all(userID, lastLoaded) as {message: string, created_at: string}[];
			
			callback(tmsgs);
		}
		catch (err) {
			console.error("[DB] Error: ", err);
			callback([]);
		}
	});
}

export function onRecordTournamentMessage(msg: string, userID: number)
{
	try
	{
		const time = new Date().toISOString();

		const stmt = server.db.prepare(`
			INSERT INTO tournament_msgs (receiver_id, message, created_at)
			VALUES (?, ?, ?)`);
		stmt.run(userID, msg, time);
		
		// if user getting the notification has an open tournament chat:
		const receiver = activeUsers.get(userID);
		if (receiver && receiver.activeChatID === tournamentID)
		{
			receiver.socket.emit("received message", tournamentID, 'Tournament System', msg, time);
			return;
		}
		
		const stmt2 = server.db.prepare(`
			INSERT INTO tournament_unread_counter (receiver_id, amount)
			VALUES (?, ?)
			ON CONFLICT (receiver_id)
			DO UPDATE SET amount = amount + 1
			RETURNING amount`);
		const returned = stmt2.get(userID, 1) as {amount: number};
		
		if (receiver)
			receiver.socket.emit("update notification", tournamentID, 'Tournament System', msg, returned.amount);
	}
	catch (err) {
		console.error("[DB] Error: ", err);
	}
}


// --- For Game Invitations ---

function onRecordOrCheckGameInvitation(socket: Socket, userID: number)
{
	socket.on("record or check game invitation", (target_id: number, option: string, callback: (status: string) => void) => {
		const sender = activeUsers.get(userID);
		if (!sender)
			return (callback("error"));
		if (sender.invitations.sent.includes(target_id))
			return (callback("sent"));
		if (sender.invitations.received.includes(target_id))
			return (callback("received"));
		
		const receiver = activeUsers.get(target_id);
		if (!receiver) // double check if the user is still active
			return (callback("offline"));
		
		if (option === "check") // check will be used to display proper state of the button and invitation banner
			return (callback("can send"));
		
		try
		{
			const user1_id = Math.min(userID, target_id);
			const user2_id = Math.max(userID, target_id);
			const stmt = server.db.prepare(`
				SELECT u.nickname, u.avatar, f.id AS convo_id, f.user1_id, f.user2_id, f.user1_blocked, f.user2_blocked
				FROM lc_friendships f
				JOIN users u ON u.id = ?
				WHERE f.user1_id = ? AND f.user2_id = ?`);
			const raw_f_result = stmt.get(userID, user1_id, user2_id) as {nickname: string, avatar: string, convo_id: number,
				user1_id: number, user2_id: number, user1_blocked: number, user2_blocked: number};
			
			if (!raw_f_result) // Not friends
				return (callback("error"));
			
			const f_result = {
				sender_nickname: raw_f_result.nickname,
				avatar: raw_f_result.avatar,
				convo_id: raw_f_result.convo_id,
				user1_id: raw_f_result.user1_id,
				user2_id: raw_f_result.user2_id,
				user1_blocked: !!raw_f_result.user1_blocked,
				user2_blocked: !!raw_f_result.user2_blocked
			};
			
			// Someone is blocked
			if (!(f_result.user1_blocked === false && f_result.user2_blocked === false))
				return (callback("error"));
			
			// All checks passed - store invitation
			sender.invitations.sent.push(target_id);
			receiver.invitations.received.push(userID);
			
			// If user has chat open, just send invitation
			if (receiver.activeChatID === userID)
				receiver.socket.emit("received game invitation", userID, f_result.sender_nickname, f_result.avatar);
			else
				receiver.socket.emit("update notification - game", userID, f_result.sender_nickname, f_result.avatar);

			callback("success");
		}
		catch (err) {
			console.log("[DB] Error: ", err);
			callback("error")
		}
	});
}

function onDeleteInvitation(socket: Socket, userID: number)
{
	socket.on("delete invitation", (target_id: number, option: string, callback: () => void) => {
		const target = activeUsers.get(target_id);
		const me = activeUsers.get(userID);
		
		if (option === "received")
		{
			// This is when you decline game invitation
			if (me?.invitations.received.includes(target_id))
				me.invitations.received = me.invitations.received.filter(id => id !== target_id);
			if (target?.invitations.sent.includes(userID))
				target.invitations.sent = target.invitations.sent.filter(id => id !== userID);
			
			target?.socket.emit("invitation declined", userID);
		}
		else
		{
			// This would be if you send invitation and then for some reason block this user or lose connection
			if (me?.invitations.sent.includes(target_id))
				me.invitations.sent = me.invitations.sent.filter(id => id !== target_id);
			if (target?.invitations.received.includes(userID))
				target.invitations.received = target.invitations.received.filter(id => id !== userID);
			
			target?.socket.emit("invitation canceled", userID);
		}
		callback();
	});
}

function onRoomIdCreated(socket: Socket, userID: number)
{
	socket.on("room id created", (roomID: string, target_id: number, callback: (status:string) => void) => {
		const receiver = activeUsers.get(target_id);
		// add check if still online

		receiver?.socket.emit("join the room", roomID);
	});
}