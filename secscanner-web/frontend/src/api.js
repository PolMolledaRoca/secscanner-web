import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

let socket;
const subscriptions = new Map();

function ensureSocket() {
  if (socket) {
    return socket;
  }

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
  });

  socket.on('connect', () => {
    for (const scanId of subscriptions.keys()) {
      socket.emit('subscribe', scanId);
    }
  });

  socket.on('scan:progress', (payload) => {
    const handlers = subscriptions.get(payload.scan_id);
    handlers?.onProgress?.(payload);
  });

  socket.on('scan:done', (payload) => {
    const handlers = subscriptions.get(payload.scan_id);
    handlers?.onDone?.(payload);
  });

  socket.on('scan:status', (payload) => {
    const handlers = subscriptions.get(payload.scan_id);
    handlers?.onStatus?.(payload);
  });

  socket.on('scan:error', (payload) => {
    const handlers = subscriptions.get(payload.scan_id);
    handlers?.onError?.(payload);
  });

  return socket;
}

export async function startScan(payload) {
  const response = await fetch(`${API_BASE}/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || 'No se pudo iniciar el escaneo.');
  }

  return response.json();
}

export async function fetchScan(scanId) {
  const response = await fetch(`${API_BASE}/scan/${scanId}`);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || 'No se encontró el escaneo solicitado.');
  }
  return response.json();
}

export function subscribeToScan(scanId, handlers = {}) {
  const client = ensureSocket();
  subscriptions.set(scanId, handlers);

  if (client.connected) {
    client.emit('subscribe', scanId);
  } else {
    client.once('connect', () => client.emit('subscribe', scanId));
  }

  return () => {
    subscriptions.delete(scanId);
    if (subscriptions.size === 0 && socket) {
      socket.disconnect();
      socket = null;
    }
  };
}
