import { PongMultiplayer } from './multiPlayerGame'; // Veya doğru dosya yolunu yazın


export class SocketManager {
    private static instance: SocketManager;
    private socket: WebSocket | null = null;
    private gameInstance: PongMultiplayer | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private pendingResolve: ((roomId: string) => void) | null = null;

    private constructor() {} // Private constructor for singleton pattern
    public onGameStart: ((message: any) => void) | null = null;

    public static getInstance(): SocketManager {
        if (!SocketManager.instance) {
            SocketManager.instance = new SocketManager();
        }
        return SocketManager.instance;
    }

    // socketManager.ts'de connect metodunu güçlendirin
public connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        reject(new Error('No authentication token found'));
        return;
      }

      // WebSocket URL'ini kontrol edin
      const wsUrl = `ws://${window.location.hostname}:3000/ws`;
      this.socket = new WebSocket(wsUrl, token);

      this.socket.onopen = () => {
  console.log('WebSocket connected');
  this.reconnectAttempts = 0;
  
  // 100ms gecikme ile create_room gibi mesajları gönder
  setTimeout(() => resolve(), 100); // resolve() demek "connect tamamlandı" demek
};

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.socket.onclose = (event) => {
        if (!event.wasClean) {
          console.error('WebSocket connection died:', event.reason);
          this.handleReconnection();
        }
      };

      // Mesaj dinleyiciyi bir kez ayarla
      this.socket.onmessage = (event) => this.handleMessage(event.data);

    } catch (error) {
      console.error('Connection setup error:', error);
      reject(error);
    }
  });
}

    private handleReconnection() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            
            setTimeout(() => {
                if (this.gameInstance) {
                    this.connect().catch(console.error);
                }
            }, this.reconnectDelay);
        } else {
            console.error('Max reconnection attempts reached');
            if (this.gameInstance) {
                // Notify game instance about connection failure
                this.gameInstance.handleConnectionLost();
            }
        }
    }

    private handleMessage(data: string) {
  try {
    const message = JSON.parse(data);
    console.log("Received message type:", message.type);

    switch (message.type) {
      case 'game_start':
        console.log("Game starting with:", message);
        if (this.onGameStart) this.onGameStart(message);
        break;
      case 'game_state':
        if (this.gameInstance) this.gameInstance.updateFromServer(message);
        break;
      case 'room_terminated':
        console.warn("Room terminated:", message.reason);
        if (this.gameInstance) this.gameInstance.handleRoomTerminated();
        break;
      default:
        console.warn("Unknown message type:", message.type);
    }
  } catch (error) {
    console.error('Message parse error:', error);
  }
}
// socketManager.ts'de oda fonksiyonlarını güncelleyin
public createRoom(): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log("[Client] createRoom called");
    
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      const errorMsg = `Socket not ready, state: ${this.socket?.readyState}`;
      console.error("[Client]", errorMsg);
      reject(new Error(errorMsg));
      return;
    }

    const timeout = setTimeout(() => {
      console.error("[Client] Room creation timeout");
      reject(new Error('Room creation timeout'));
    }, 10000); // 10 saniyeye çıkardık

    const messageHandler = (event: MessageEvent) => {
      try {
        console.log("[Client] Received message:", event.data);
        const data = JSON.parse(event.data);
        
        if (data.type === 'room_created') {
          console.log("[Client] Room created successfully, roomId:", data.roomId);
          clearTimeout(timeout);
          this.socket?.removeEventListener('message', messageHandler);
          resolve(data.roomId);
        } else if (data.type === 'error') {
          console.error("[Client] Error from server:", data.message);
          clearTimeout(timeout);
          this.socket?.removeEventListener('message', messageHandler);
          reject(new Error(data.message));
        }
      } catch (error) {
        console.error("[Client] Error parsing message:", error);
      }
    };

    this.socket.addEventListener('message', messageHandler);
    
    const createMsg = { type: 'create_room' };
    console.log("[Client] Sending create_room message:", createMsg);
    this.socket.send(JSON.stringify(createMsg));
  });
}

public joinRoom(roomId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'));
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error('Join room timeout'));
    }, 5000);

    const tempListener = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'join_result') {
          clearTimeout(timeout);
          this.socket?.removeEventListener('message', tempListener);
          resolve(data.success);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    this.socket.addEventListener('message', tempListener);
    this.socket.send(JSON.stringify({ 
      type: 'join_room', 
      roomId 
    }));
  });
}
    public sendPaddlePosition(yPos: number) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'paddle_move',
                yPos,
                timestamp: Date.now()
            }));
        }
    }

    public disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
}