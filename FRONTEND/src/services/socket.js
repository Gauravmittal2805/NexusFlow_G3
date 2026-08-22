import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:5005";

console.log("Connecting Socket.IO to:", SOCKET_URL);

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});

export const connectSocket = () => {
  if (!socket.connected) {
    socket.connect();
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};

export const subscribeToTelemetry = (callback) => {
  socket.on("telemetry:update", callback);

  return () => {
    socket.off("telemetry:update", callback);
  };
};

export const subscribeToRuleTrigger = (callback) => {
  socket.on("rule:triggered", callback);

  return () => {
    socket.off("rule:triggered", callback);
  };
};

export default socket;