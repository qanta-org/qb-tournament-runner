import type { Server, Socket } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  GameConfig,
  GameState,
  AnswerRuling,
} from '../../shared/types.js';
import { filterStateForPlayer } from '../../shared/types.js';
import { GameEngine } from './engine.js';
import { roomManager } from './rooms.js';

// Store game engines per room
const gameEngines = new Map<string, GameEngine>();

/**
 * Emit state to all clients in a room, filtering appropriately by role
 */
function emitStateToRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomCode: string,
  state: GameState
) {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;

  // Send full state to moderator
  io.to(room.moderatorId).emit('game:state', state);

  // Send filtered state to players
  const filteredState = filterStateForPlayer(state);
  room.playerIds.forEach(playerId => {
    io.to(playerId).emit('game:state', filteredState);
  });

  // Update room's cached state
  roomManager.setGameState(roomCode, state);
}

/**
 * Emit to all clients in a room (moderator + players)
 */
function emitToRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomCode: string,
  event: keyof ServerToClientEvents,
  ...args: any[]
) {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;

  // Emit to moderator
  (io.to(room.moderatorId).emit as any)(event, ...args);

  // Emit to all players
  room.playerIds.forEach(playerId => {
    (io.to(playerId).emit as any)(event, ...args);
  });
}

/**
 * Emit to all players in a room (not moderator)
 */
function emitToPlayers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomCode: string,
  event: keyof ServerToClientEvents,
  ...args: any[]
) {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;

  room.playerIds.forEach(playerId => {
    (io.to(playerId).emit as any)(event, ...args);
  });
}

/**
 * Emit player count update to moderator
 */
function notifyPlayerCount(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomCode: string
) {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;

  const count = roomManager.getPlayerCount(roomCode);
  io.to(room.moderatorId).emit('room:player_count', count);
}

export function setupGameHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents>
) {
  // =========================================================================
  // Room Management
  // =========================================================================

  // Moderator creates a room
  socket.on('room:create', () => {
    const room = roomManager.createRoom(socket.id);
    socket.join(room.code); // Join socket.io room for broadcasts
    socket.emit('room:created', { code: room.code, role: 'moderator' });
    console.log(`Room ${room.code} created, moderator: ${socket.id}`);
  });

  // Player joins a room
  socket.on('room:join', (code: string) => {
    const room = roomManager.joinRoom(socket.id, code);

    if (!room) {
      socket.emit('room:error', `Room "${code}" not found. Please check the code and try again.`);
      return;
    }

    socket.join(room.code); // Join socket.io room
    socket.emit('room:joined', {
      code: room.code,
      role: 'player',
      config: room.gameConfig,
    });

    // Send current game state if game is in progress
    if (room.gameState) {
      socket.emit('game:state', filterStateForPlayer(room.gameState));
    }
    if (room.gameConfig) {
      socket.emit('game:config', room.gameConfig);
    }

    // Notify moderator of player count change
    notifyPlayerCount(io, room.code);
    console.log(`Player ${socket.id} joined room ${room.code}`);
  });

  // Leave room
  socket.on('room:leave', () => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (room) {
      const wasPlayerCount = roomManager.getPlayerCount(room.code);
      socket.leave(room.code);
      roomManager.leaveRoom(socket.id);

      // If room still exists (player left, not moderator), notify
      if (roomManager.getRoom(room.code)) {
        notifyPlayerCount(io, room.code);
      }
    }
  });

  // =========================================================================
  // Game Events (Moderator Only)
  // =========================================================================

  // Start a new game
  socket.on('game:start', async (config: GameConfig) => {
    // Verify caller is a moderator
    if (!roomManager.isModerator(socket.id)) {
      socket.emit('error', 'Only the moderator can start the game');
      return;
    }

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) {
      socket.emit('error', 'You must create a room first');
      return;
    }

    try {
      console.log(`Starting game in room ${room.code}: ${config.team_a.name} vs ${config.team_b.name}`);

      // Clean up existing engine for this room
      const existingEngine = gameEngines.get(room.code);
      if (existingEngine) {
        existingEngine.cleanup();
      }

      const engine = new GameEngine(config, (state) => {
        // Add room code to state
        state.roomCode = room.code;
        emitStateToRoom(io, room.code, state);
      });

      await engine.initialize();
      gameEngines.set(room.code, engine);

      // Store config in room
      roomManager.setGameConfig(room.code, config);

      // Send config to all clients
      io.to(room.moderatorId).emit('game:config', config);
      emitToPlayers(io, room.code, 'game:config', config);

      // Send initial state
      const initialState = engine.getState();
      initialState.roomCode = room.code;
      emitStateToRoom(io, room.code, initialState);

      // Start the first question
      engine.startGame();
    } catch (error) {
      console.error('Error starting game:', error);
      socket.emit('error', `Failed to start game: ${error}`);
    }
  });

  // Moderator advances to next word (manual mode)
  socket.on('moderator:next_word', () => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) {
      engine.revealNextWord();
    }
  });

  // Player buzzes (can be triggered by moderator for human players)
  socket.on('player:buzz', (playerId: string) => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    // Only moderator can trigger buzzes (human players buzz via moderator's keyboard)
    if (!roomManager.isModerator(socket.id)) return;

    const engine = gameEngines.get(room.code);
    if (engine) {
      const result = engine.handleBuzz(playerId);
      if (result.buzzed) {
        // Only play sound on moderator
        socket.emit('sound:buzz');
      }
    }
  });

  // Moderator rules on answer
  socket.on('moderator:answer_ruling', (data: { ruling: AnswerRuling; answer: string }) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) {
      engine.handleAnswerRuling(data.ruling, data.answer);
    }
  });

  // Play specific tossup (from navigation sidebar)
  socket.on('moderator:play_tossup', (tossupIndex: number) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) {
      engine.playTossup(tossupIndex);
    }
  });

  // Play specific bonus (from navigation sidebar)
  socket.on('moderator:play_bonus', (data: { bonusIndex: number; owner: 'team_a' | 'team_b' }) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) {
      engine.playBonus(data.bonusIndex, data.owner);
    }
  });

  // Adjust points
  socket.on('moderator:adjust_points', (data: { team_a: number; team_b: number }) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) {
      engine.adjustPoints(data);
      // State will be emitted via the engine callback
    }
  });

  // Mute/unmute player
  socket.on('player:mute_toggle', (playerId: string) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) {
      engine.toggleMute(playerId);
    }
  });

  // Bonus: Advance stage
  socket.on('bonus:advance', () => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) {
      engine.advanceBonusStage();
    }
  });

  // Bonus: Human response
  socket.on('bonus:human_response', (responses: Record<string, string>) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) {
      engine.handleBonusHumanResponse(responses);
    }
  });

  // Bonus: Final answer
  socket.on('bonus:final_answer', (answer: string) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) {
      engine.handleBonusFinalAnswer(answer);
    }
  });

  // =========================================================================
  // Player Management (Mid-Game)
  // =========================================================================

  // Add a human player mid-game
  socket.on('moderator:add_player', (data: { teamId: 'team_a' | 'team_b'; player: any }, callback?: (result: { success: boolean; error?: string }) => void) => {
    if (!roomManager.isModerator(socket.id)) {
      callback?.({ success: false, error: 'Not authorized' });
      return;
    }

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) {
      callback?.({ success: false, error: 'Room not found' });
      return;
    }

    const engine = gameEngines.get(room.code);
    if (!engine) {
      callback?.({ success: false, error: 'Game not started' });
      return;
    }

    const result = engine.addPlayer(data.teamId, data.player);

    if (result.success) {
      // Update room config
      const updatedConfig = engine.getConfig();
      roomManager.setGameConfig(room.code, updatedConfig);

      // Broadcast updated config to all clients
      emitToRoom(io, room.code, 'game:config', updatedConfig);
    }

    callback?.(result);
  });

  // Remove a human player mid-game
  socket.on('moderator:remove_player', (playerId: string, callback?: (result: { success: boolean; error?: string }) => void) => {
    if (!roomManager.isModerator(socket.id)) {
      callback?.({ success: false, error: 'Not authorized' });
      return;
    }

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) {
      callback?.({ success: false, error: 'Room not found' });
      return;
    }

    const engine = gameEngines.get(room.code);
    if (!engine) {
      callback?.({ success: false, error: 'Game not started' });
      return;
    }

    const result = engine.removePlayer(playerId);

    if (result.success) {
      // Update room config
      const updatedConfig = engine.getConfig();
      roomManager.setGameConfig(room.code, updatedConfig);

      // Broadcast updated config to all clients
      emitToRoom(io, room.code, 'game:config', updatedConfig);
    }

    callback?.(result);
  });

  // Check if players can be modified
  socket.on('moderator:can_modify_players', (callback?: (result: { canModify: boolean }) => void) => {
    if (!roomManager.isModerator(socket.id)) {
      callback?.({ canModify: false });
      return;
    }

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) {
      callback?.({ canModify: false });
      return;
    }

    const engine = gameEngines.get(room.code);
    if (!engine) {
      callback?.({ canModify: false });
      return;
    }

    callback?.({ canModify: engine.canModifyPlayers() });
  });

  // =========================================================================
  // Cleanup
  // =========================================================================

  socket.on('disconnect', () => {
    const room = roomManager.getRoomForSocket(socket.id);
    const wasModerator = roomManager.isModerator(socket.id);

    if (room) {
      const roomCode = room.code;
      roomManager.leaveRoom(socket.id);

      if (wasModerator) {
        // Clean up game engine when moderator disconnects
        const engine = gameEngines.get(roomCode);
        if (engine) {
          engine.cleanup();
          gameEngines.delete(roomCode);
        }

        // Notify all players that the room is closed
        emitToPlayers(io, roomCode, 'room:error', 'The moderator has disconnected. The game session has ended.');
      } else {
        // Player disconnected - notify moderator
        notifyPlayerCount(io, roomCode);
      }
    }
  });
}
