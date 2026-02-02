import { io, Socket } from "socket.io-client";
import { SOCKET_URL } from "./apiConfig";

// Socket configuration for maximum reliability
const socket: Socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"],
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity, // NEVER give up
  reconnectionDelay: 2000, // Start with 2s delay
  reconnectionDelayMax: 10000, // Max 10s delay
  timeout: 30000, // 30 second connection timeout
  forceNew: false,
  upgrade: true,
  secure: true,
  rejectUnauthorized: false, // Allow self-signed certificates
  extraHeaders: {
    'Cache-Control': 'no-cache',
  }
});

// Interval references
let heartbeatInterval: NodeJS.Timeout | null = null;
let autoReconnectEnabled = true;

// Start heartbeat (every 7 seconds)
const startHeartbeat = () => {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (socket.connected) {
      socket.emit("heartbeat", { timestamp: Date.now() });
      console.log("💓 Heartbeat sent");
    }
  }, 7000);
};

const stopHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

// Enable/disable auto reconnect
export const enableAutoReconnect = () => {
  autoReconnectEnabled = true;
  console.log("🔄 Auto-reconnect enabled");
};

export const disableAutoReconnect = () => {
  autoReconnectEnabled = false;
  console.log("🔄 Auto-reconnect disabled");
};

// Check connection status
export const isSocketConnected = (): boolean => socket.connected;

// Connect socket with heartbeat
export const connectSocket = (): Socket => {
  if (!socket.connected) {
    console.log("🔌 Connecting socket...");
    socket.connect();
  }
  startHeartbeat();
  return socket;
};

// Disconnect socket
export const disconnectSocket = () => {
  console.log("🔌 Disconnecting socket...");
  stopHeartbeat();
  socket.disconnect();
};

// Connection events
socket.on("connect", () => {
  console.log("✅ Socket Connected:", socket.id);
  startHeartbeat();
});

socket.on("connect_error", (err) => {
  console.error("❌ Socket Connect Error:", err.message);
  console.error("   Error type:", err.type);
  console.error("   Error code:", (err as any).code);
  // Auto-reconnect is handled by socket.io options
});

socket.on("disconnect", (reason) => {
  console.log("⚠️ Socket Disconnected:", reason);
  // Only manually reconnect if the server explicitly disconnected us.
  // Transport errors are handled automatically by reconnection: true
  if (autoReconnectEnabled && reason === "io server disconnect") {
    setTimeout(() => socket.connect(), 1000);
  }
});

socket.on("reconnect", (attemptNumber) => {
  console.log("✅ Reconnected after", attemptNumber, "attempts");
  startHeartbeat();
});

socket.on("reconnect_attempt", (n) => console.log("🔄 Reconnect attempt:", n));
socket.on("reconnect_error", (err) => console.error("❌ Reconnect error:", err.message));
socket.on("reconnect_failed", () => {
  console.error("❌ Reconnect failed - forcing new connection...");
});

socket.on("heartbeat_ack", () => console.log("💓 Heartbeat acknowledged"));

export default socket;
