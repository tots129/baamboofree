'use strict';
const { Room } = require('./Room');
const { randomCode } = require('../lib/util');

const IDLE_LIMIT_MS = 3 * 60 * 60 * 1000; // salas paradas há 3h são removidas
const EMPTY_LIMIT_MS = 30 * 60 * 1000; // salas sem ninguém conectado há 30 min

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.sweeper = setInterval(() => this.sweep(), 60 * 1000);
    this.sweeper.unref();
  }

  create(opts) {
    let code;
    do code = randomCode(6);
    while (this.rooms.has(code));
    const room = new Room({ ...opts, code });
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    if (typeof code !== 'string') return null;
    return this.rooms.get(code.trim().toUpperCase()) || null;
  }

  remove(code) {
    const room = this.rooms.get(code);
    if (room) clearTimeout(room.timer);
    this.rooms.delete(code);
  }

  sweep(now = Date.now()) {
    for (const [code, room] of this.rooms) {
      const idle = now - room.lastActivity;
      const anyoneHere = room.hostSockets && room.hostSockets.size > 0;
      if (idle > IDLE_LIMIT_MS || (!anyoneHere && idle > EMPTY_LIMIT_MS)) this.remove(code);
    }
  }
}

module.exports = { RoomManager };
