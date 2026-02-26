import type { GameEngine } from './engine.js';

/** Shared map of room code -> GameEngine for both regular and tournament games */
export const gameEngines = new Map<string, GameEngine>();
