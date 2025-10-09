import { io, Socket} from "socket.io-client";
import { currentTargetID, loadChatData } from "./liveChat";
import { DOM } from "./chatElements"

export class ChatSocketManager
{
	private static instance: ChatSocketManager;
	private socket?: Socket;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000;
	private logout: boolean = false;
	private connectionLost: boolean = false;
	private wasConnected: boolean = false;
	
	private constructor() {}
	
	public static getInstance(): ChatSocketManager
	{
		if (!ChatSocketManager.instance)
		{
			console.log('[LiveChat] Creating new ChatSocketManager instance');
			ChatSocketManager.instance = new ChatSocketManager();
		}
		return ChatSocketManager.instance;
	}
	
	public on(event: string, handler: (...args: any[]) => void): void
	{
		this.socket?.on(event, handler);
	}
	
	public emit(event: string, ...args: any[]): void
	{
		this.socket?.emit(event, ...args)
	}
	
	public disconnect()
	{
		this.logout = true;
		this.socket?.disconnect();
	}
	
	public isConnected(): boolean
	{
		return this.socket?.connected ?? false;
	}
	
	public lostConnection(): boolean
	{
		// return this.socket?.disconnected ?? false;
		return this.connectionLost; // Using a fglag is more reliable in case of reload when socket is created but not yet connected
	}
	
	public connect(): Promise<void>
	{
		return new Promise((resolve, reject) => {
			const token = localStorage.getItem('authToken');
			if (!token) return reject(new Error('[LiveChat] No authentication token found'));
		
			this.socket = io({
				path: '/socket.io/livechat',
				auth: { token },
				query: { "token": token },
				transports: ['websocket', 'polling'],
				reconnection: true,
				reconnectionAttempts: this.maxReconnectAttempts,
				reconnectionDelay: this.reconnectDelay,
				reconnectionDelayMax: 5000,
				timeout: 10000,
				secure: true,
				rejectUnauthorized: false,
				withCredentials: true,
				upgrade: true,
				rememberUpgrade: true,
			});
		
			this.socket.on('connect', () => {
				console.log('[LiveChat] Socket connected:', this.socket?.id);
				resolve();
			});
			
			this.socket.on('connect_error', (error: Error) => {
				console.error('[LiveChat] Connection error:', error);
				reject(error);
				this.connectionLost = true;
				if (!this.wasConnected)
				{
					DOM.reconnectInfo.innerText = "Cannot connect\nRetrying...";
					DOM.chatContainer.classList.add('hidden');
					DOM.reconnectInfo.classList.remove('hidden');
				}
			});
			
			this.socket.on('disconnect', () => {
				if (this.logout)
					console.log("[Live Chat] Socket disconnected (Logout)");
				else
				{
					console.warn("[Live Chat] Socket disconnected (Lost Connection)");
					this.connectionLost = true;
					this.wasConnected = true;
					DOM.reconnectInfo.innerText = "Connection lost\nReconnecting...";
					DOM.chatContainer.classList.add('hidden');
					DOM.reconnectInfo.classList.remove('hidden');
				}
			});
			
			this.socket.io.on('reconnect_attempt', (attempt: number) => {
				console.warn(`[Live Chat] Reconnecting... Attempt ${attempt}`);
			});
			
			this.socket.io.on('reconnect', (attempt: number) => {
				console.log(`[Live Chat] Reconnected after ${attempt} attempts`);
				this.connectionLost = false;
				DOM.chatContainer.classList.remove('hidden');
				DOM.reconnectInfo.classList.add('hidden');
				loadChatData();
			});
			
			this.socket.io.on('reconnect_failed', () => {
				console.error("[LiveChat] Max reconnection attempts reached. Please refresh the page.");
				DOM.reconnectInfo.innerText = "Reconnection failed\nPlease refresh the page"
			});
		});
	}
	
	public searchDbUsers(input: string) : Promise<any[]>
	{
		return new Promise((resolve) => {
			this.socket?.emit("search in users", input, (users: any[]) => {
				resolve(users);
			});
		});
	}
	
	public searchDbFriendships(): Promise<any[]>
	{
		return new Promise((resolve) => {
			this.socket?.emit("search in friendships", (friends: any[]) => {
				resolve(friends);
			});
		});
	}
	
	public searchDbBlocked(): Promise<any[]>
	{
		return new Promise((resolve) => {
			this.socket?.emit("search for blocked", (blocked: any[]) => {
				resolve(blocked);
			});
		});
	}
	
	public searchDbRequests(): Promise<any[]>
	{
		return new Promise((resolve) => {
			this.socket?.emit("search in requests", (requests: any[]) => {
				resolve(requests);
			});
		});
	}
	
	public checkRequestSent(id: number): Promise<string>
	{
		return new Promise((resolve) => {
			this.socket?.emit("check request sent", id, (status: string) => {
				resolve(status);
			});
		});
	}
	
	public recordRequest(target_id: number): Promise<string>
	{
		return new Promise((resolve) => {
			this.socket?.emit("record request", target_id, (status: string) => {
				resolve(status);
			});
		});
	}
	
	public acceptFriendRequest(from_id: number): Promise<string>
	{
		return new Promise((resolve) => {
			this.socket?.emit("accept friend request", from_id, (status: string) => {
				resolve(status);
			});
		});
	}
	
	public declineFriendRequest(from_id: number): Promise<string>
	{
		return new Promise((resolve) => {
			this.socket?.emit("decline friend request", from_id, (status: string) => {
				resolve(status);
			});
		});
	}
	
	public updateRequestStat(from_id: number): Promise<void>
	{
		return new Promise((resolve) => {
			this.socket?.emit("update request status", from_id, () => {
				resolve();
			});
		});
	}
	
	public removeFriend(target_id: number): Promise<string>
	{
		return new Promise((resolve) => {
			this.socket?.emit("remove friend", target_id, (status: string) => {
				resolve(status);
			});
		});
	}
	
	public blockUser(target_id: number): Promise<string>
	{
		return new Promise((resolve) => {
			this.socket?.emit("block user", target_id, (status: string) => {
				resolve(status);
			});
		});
	}
	
	public unblockUser(target_id: number): Promise<string>
	{
		return new Promise((resolve) => {
			this.socket?.emit("unblock user", target_id, (status: string) => {
				resolve(status);
			});
		});
	}
	
	public checkBlocks(target_id: number): Promise<string>
	{
		return new Promise((resolve) => {
			this.socket?.emit("check blocks", target_id, (status: string) => {
				resolve(status);
			});
		});
	}
	
	public loadMessages(target_id: number): Promise<any[]>
	{
		return new Promise((resolve) => {
			this.socket?.emit("load messages", target_id, (messages: any[]) => {
				resolve(messages);
			});
		});
	}
	
	public loadMoreMessages(target_id: number, lastLoaded: string): Promise<any[]>
	{
		return new Promise((resolve) => {
			this.socket?.emit("load more messages", target_id, lastLoaded, (messages: any[]) => {
				resolve(messages);
			});
		});
	}
	
	public recordMessage(target_id: number, msg: string, timeDbFormat: string): Promise<string>
	{
		return new Promise((resolve) => {
			this.socket?.emit("record message", target_id, msg, timeDbFormat, (status: string) => {
				resolve(status);
			});
		});
	}
	
	public loadChats(): Promise<any[]>
	{
		return new Promise((resolve) => {
			this.socket?.emit("load chats", (chats: any[]) => {
				resolve(chats);
			});
		});
	}
	
	public serverAlive(): Promise<boolean>
	{
		return new Promise ((resolve) => {
			this.socket?.timeout(1000).emit("ping", (err: any) => {
				if (err) resolve(false);
				else resolve(true);
			});
		});
	}
	
	public getOnlineStatus(): Promise<string>
	{
		return new Promise((resolve) => {
			this.socket?.emit("get online status", currentTargetID, (status: string) => {
				resolve(status);
			});
		});
	}
	
	public loadTournamentMessages(): Promise<any[]>
	{
		return new Promise((resolve) => {
			this.socket?.emit("load tournament messages", (tmsgs: any[]) => {
				resolve(tmsgs);
			});
		});
	}
	
	public loadMoreTournamentMessages(lastLoaded: string): Promise<any[]>
	{
		return new Promise((resolve) => {
			this.socket?.emit("load more tournament messages", lastLoaded, (tmsgs: any[]) => {
				resolve(tmsgs);
			});
		});
	}
	
	public recordOrCheckGameInvitation(option: string): Promise<string>
	{
		return new Promise((resolve) => {
			this.socket?.emit("record or check game invitation", currentTargetID, option, (status: string) => {
				resolve(status);
			})
		});
	}
	
	public removeInvitation(option: string): Promise<void>
	{
		return new Promise((resolve) => {
			this.socket?.emit("delete invitation", currentTargetID, option, () => {
				resolve();
			});
		});
	}
}
