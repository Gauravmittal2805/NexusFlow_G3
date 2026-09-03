import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "http://localhost:5005";


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

/**
 * Step 4: Subscribe to alert:new Socket.IO event.
 * Emitted by Backend/services/alertService.js after a rule triggers
 * and an Alert document is persisted to MongoDB.
 *
 * Payload: full Alert document (ruleId, ruleName, sensorId, message, severity, status, timestamp)
 */
export const subscribeToAlertNew = (callback) => {
  socket.on("alert:new", callback);

  return () => {
    socket.off("alert:new", callback);
  };
};

export default socket;