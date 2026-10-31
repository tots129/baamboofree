import { api } from './api.js';

const listeners = new Set();
let current = null;
let loaded = false;

export function user() {
  return current;
}

export function isLoaded() {
  return loaded;
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(u) {
  current = u;
  loaded = true;
  listeners.forEach((fn) => fn(current));
}

export async function loadSession() {
  try {
    const { user: u } = await api.get('/api/auth/me');
    set(u);
  } catch (_) {
    set(null);
  }
  return current;
}

export async function login(email, password) {
  const { user: u } = await api.post('/api/auth/login', { email, password });
  set(u);
  return u;
}

export async function register(data) {
  const { user: u } = await api.post('/api/auth/register', data);
  set(u);
  return u;
}

export async function logout() {
  await api.post('/api/auth/logout');
  set(null);
}

export function updateLocalUser(u) {
  set(u);
}
