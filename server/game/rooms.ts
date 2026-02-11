import type { GameConfig, GameState, ClientRole } from '../../shared/types.js';

// ============================================================================
// Types
// ============================================================================

export interface GameRoom {
  code: string;
  moderatorId: string;
  playerIds: Set<string>;
  gameConfig: GameConfig | null;
  gameState: GameState | null;
  createdAt: Date;
}

// ============================================================================
// Room Manager
// ============================================================================

class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private socketToRoom: Map<string, string> = new Map(); // socketId -> roomCode

  /**
   * Generate a random 5-character alphanumeric code
   */
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars (0, O, I, 1)
    let code: string;
    do {
      code = '';
      for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code)); // Ensure uniqueness
    return code;
  }

  /**
   * Create a new room for a moderator
   */
  createRoom(moderatorSocketId: string): GameRoom {
    // Check if moderator already has a room
    const existingCode = this.socketToRoom.get(moderatorSocketId);
    if (existingCode) {
      const existing = this.rooms.get(existingCode);
      if (existing && existing.moderatorId === moderatorSocketId) {
        return existing;
      }
    }

    const code = this.generateCode();
    const room: GameRoom = {
      code,
      moderatorId: moderatorSocketId,
      playerIds: new Set(),
      gameConfig: null,
      gameState: null,
      createdAt: new Date(),
    };

    this.rooms.set(code, room);
    this.socketToRoom.set(moderatorSocketId, code);

    console.log(`Room ${code} created by moderator ${moderatorSocketId}`);
    return room;
  }

  /**
   * Join an existing room as a player
   */
  joinRoom(playerSocketId: string, code: string): GameRoom | null {
    const normalizedCode = code.toUpperCase().trim();
    const room = this.rooms.get(normalizedCode);

    if (!room) {
      return null;
    }

    // Leave any existing room first
    this.leaveRoom(playerSocketId);

    room.playerIds.add(playerSocketId);
    this.socketToRoom.set(playerSocketId, normalizedCode);

    console.log(`Player ${playerSocketId} joined room ${normalizedCode}`);
    return room;
  }

  /**
   * Leave current room
   */
  leaveRoom(socketId: string): void {
    const code = this.socketToRoom.get(socketId);
    if (!code) return;

    const room = this.rooms.get(code);
    if (!room) {
      this.socketToRoom.delete(socketId);
      return;
    }

    if (room.moderatorId === socketId) {
      // Moderator leaving - destroy the room
      console.log(`Moderator ${socketId} left, destroying room ${code}`);
      
      // Remove all players from tracking
      room.playerIds.forEach(playerId => {
        this.socketToRoom.delete(playerId);
      });
      
      this.rooms.delete(code);
      this.socketToRoom.delete(socketId);
    } else {
      // Player leaving
      room.playerIds.delete(socketId);
      this.socketToRoom.delete(socketId);
      console.log(`Player ${socketId} left room ${code}`);
    }
  }

  /**
   * Get room by code
   */
  getRoom(code: string): GameRoom | null {
    return this.rooms.get(code.toUpperCase()) || null;
  }

  /**
   * Get room for a socket
   */
  getRoomForSocket(socketId: string): GameRoom | null {
    const code = this.socketToRoom.get(socketId);
    if (!code) return null;
    return this.rooms.get(code) || null;
  }

  /**
   * Get the role of a socket in its room
   */
  getSocketRole(socketId: string): ClientRole | null {
    const room = this.getRoomForSocket(socketId);
    if (!room) return null;
    return room.moderatorId === socketId ? 'moderator' : 'player';
  }

  /**
   * Check if socket is a moderator
   */
  isModerator(socketId: string): boolean {
    return this.getSocketRole(socketId) === 'moderator';
  }

  /**
   * Update game config for a room
   */
  setGameConfig(code: string, config: GameConfig): void {
    const room = this.rooms.get(code);
    if (room) {
      room.gameConfig = config;
    }
  }

  /**
   * Update game state for a room
   */
  setGameState(code: string, state: GameState): void {
    const room = this.rooms.get(code);
    if (room) {
      room.gameState = state;
    }
  }

  /**
   * Get all player socket IDs in a room
   */
  getPlayerIds(code: string): string[] {
    const room = this.rooms.get(code);
    if (!room) return [];
    return Array.from(room.playerIds);
  }

  /**
   * Get player count in a room
   */
  getPlayerCount(code: string): number {
    const room = this.rooms.get(code);
    if (!room) return 0;
    return room.playerIds.size;
  }

  /**
   * Clean up stale rooms (older than 24 hours with no activity)
   */
  cleanupStaleRooms(): void {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [code, room] of this.rooms) {
      if (now.getTime() - room.createdAt.getTime() > maxAge) {
        console.log(`Cleaning up stale room ${code}`);
        room.playerIds.forEach(playerId => {
          this.socketToRoom.delete(playerId);
        });
        this.socketToRoom.delete(room.moderatorId);
        this.rooms.delete(code);
      }
    }
  }

  /**
   * Get stats
   */
  getStats(): { rooms: number; sockets: number } {
    return {
      rooms: this.rooms.size,
      sockets: this.socketToRoom.size,
    };
  }
}

// Export singleton instance
export const roomManager = new RoomManager();
