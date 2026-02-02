/**
 * Socket Configuration for Fitness App
 * Handles real-time location updates to backend
 */

import { io, Socket } from 'socket.io-client';

// Backend Socket URL - Update this with your actual backend URL
const SOCKET_URL = 'https://your-backend-url.com'; // TODO: Update with your actual backend URL

// Socket instance
let socket: Socket | null = null;

// Connection options
const socketOptions = {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  timeout: 20000,
  autoConnect: false,
};

/**
 * Get or create socket instance
 */
export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_URL, socketOptions);

    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.log('⚠️ Socket connection error:', error.message);
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
    });
  }
  return socket;
};

/**
 * Connect to socket server
 */
export const connectSocket = (): void => {
  const sock = getSocket();
  if (!sock.connected) {
    console.log('🔌 Connecting to socket server...');
    sock.connect();
  }
};

/**
 * Disconnect from socket server
 */
export const disconnectSocket = (): void => {
  if (socket && socket.connected) {
    console.log('🔌 Disconnecting from socket server...');
    socket.disconnect();
  }
};

/**
 * Check if socket is connected
 */
export const isSocketConnected = (): boolean => {
  return socket?.connected ?? false;
};

/**
 * Emit location update to backend
 */
export const emitLocationUpdate = (locationData: {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  accuracy?: number;
  timestamp: number;
  userId?: string;
}): void => {
  const sock = getSocket();
  if (sock.connected) {
    sock.emit('locationUpdate', locationData);
    console.log('📍 Location emitted:', locationData.latitude.toFixed(6), locationData.longitude.toFixed(6));
  } else {
    console.log('⚠️ Socket not connected, location not emitted');
    // Auto-reconnect if not connected
    connectSocket();
  }
};

/**
 * Update socket URL (call before connecting)
 */
export const setSocketUrl = (url: string): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  // Create new socket with updated URL
  socket = io(url, socketOptions);
};

export default getSocket();
