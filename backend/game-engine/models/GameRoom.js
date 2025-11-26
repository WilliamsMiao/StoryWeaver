import { Player } from './Player.js';
import { GameStory } from './GameStory.js';

export class GameRoom {
  constructor({ id, name, hostId, status = 'waiting' }) {
    this.id = id;
    this.name = name;
    this.hostId = hostId;
    this.status = status; // waiting, playing, finished
    this.players = new Map();
    this.story = null;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }
  
  addPlayer(player) {
    if (!(player instanceof Player)) {
      player = new Player(player);
    }
    this.players.set(player.id, player);
    this.updatedAt = new Date();
    return player;
  }
  
  removePlayer(playerId) {
    const removed = this.players.delete(playerId);
    if (removed) {
      this.updatedAt = new Date();
    }
    return removed;
  }
  
  getPlayer(playerId) {
    return this.players.get(playerId);
  }
  
  getPlayersList() {
    return Array.from(this.players.values());
  }
  
  setStory(story) {
    if (!(story instanceof GameStory)) {
      story = new GameStory(story);
    }
    this.story = story;
    this.updatedAt = new Date();
  }
  
  updateStatus(status) {
    this.status = status;
    this.updatedAt = new Date();
  }
  
  isHost(playerId) {
    return this.hostId === playerId;
  }
  
  canStart() {
    return this.players.size >= 1 && this.status === 'waiting';
  }
  
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      hostId: this.hostId,
      status: this.status,
      players: this.getPlayersList().map(p => p.toJSON()),
      story: this.story ? this.story.toJSON() : null,
      playerCount: this.players.size,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

