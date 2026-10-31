import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io({
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

/** Recria a conexão (ex.: depois de login/logout, para o servidor ler o novo cookie). */
export function resetSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function emit(event, payload = {}, timeout = 8000) {
  const s = getSocket();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('O servidor demorou para responder. Verifique sua conexão.')), timeout);
    s.emit(event, payload, (res) => {
      clearTimeout(timer);
      if (res && res.ok) resolve(res);
      else reject(new Error((res && res.error) || 'Algo deu errado.'));
    });
  });
}

/** Diferença entre o relógio do servidor e o do navegador (para cronômetros precisos). */
let clockOffset = 0;
export function syncClock(serverNow) {
  if (typeof serverNow === 'number') clockOffset = serverNow - Date.now();
}
export function serverTime() {
  return Date.now() + clockOffset;
}

const PLAYER_KEY = 'jogae:jogador';
export function savePlayerSession(code, data) {
  try {
    localStorage.setItem(`${PLAYER_KEY}:${code}`, JSON.stringify({ ...data, savedAt: Date.now() }));
    localStorage.setItem(`${PLAYER_KEY}:ultima`, code);
  } catch (_) {
    /* armazenamento indisponível */
  }
}
export function loadPlayerSession(code) {
  try {
    const v = JSON.parse(localStorage.getItem(`${PLAYER_KEY}:${code}`) || 'null');
    return v && Date.now() - v.savedAt < 12 * 3600 * 1000 ? v : null;
  } catch (_) {
    return null;
  }
}
export function clearPlayerSession(code) {
  try {
    localStorage.removeItem(`${PLAYER_KEY}:${code}`);
  } catch (_) {
    /* */
  }
}
