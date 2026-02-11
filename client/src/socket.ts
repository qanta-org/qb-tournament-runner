import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../../shared/types';

// Create socket instance - will connect to the same host in production
const SOCKET_URL = (import.meta as any).env?.VITE_SOCKET_URL || 'http://localhost:3001';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
});

// Connection status helpers
export function connectSocket(): void {
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket(): void {
  if (socket.connected) {
    socket.disconnect();
  }
}

// Debug logging in development
const isDev = (import.meta as any).env?.DEV ?? true;
if (isDev) {
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });
}
