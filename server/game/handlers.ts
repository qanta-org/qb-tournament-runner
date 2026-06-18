import type { Server, Socket } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  GameConfig,
  GameState,
  AnswerRuling,
  AIBuzzMode,
  BonusPartDecision,
} from '../../shared/types.js';
import { filterStateForPlayer } from '../../shared/types.js';
import { GameEngine } from './engine.js';
import { roomManager, type GameRoom } from './rooms.js';
import { gameEngines } from './engines.js';
import { tournamentManager } from './tournaments.js';

/**
 * When a tournament game reaches game_over, compute winner/stats and call completeGame.
 * Called from emitStateToRoom so tournament completion is a clear, separate responsibility.
 */
function handleTournamentGameCompletionIfNeeded(room: GameRoom, state: GameState): void {
  if (state.phase !== 'game_over' || !room.tournamentGameId || !room.tournamentCode) return;
  const t = tournamentManager.getTournament(room.tournamentCode);
  const game = t?.games.find((g) => g.id === room.tournamentGameId);
  if (!t || !game) return;

  const { team_a, team_b } = state.scores;
  const winnerId = team_a > team_b ? game.teamAId : team_b > team_a ? game.teamBId : undefined;

  let negsA = 0, negsB = 0;
  let bonusPtsA = 0, bonusPtsB = 0;
  let bonusAttA = 0, bonusAttB = 0;
  for (const r of state.tossupResults) {
    if (r.previousScore) {
      if (r.previousScore.team_a < 0) negsA++;
      if (r.previousScore.team_b < 0) negsB++;
    }
  }
  for (const r of state.bonusResults) {
    if (r.outcome === 'team_a' || r.outcome === 'team_b') {
      const pts = r.previousScore;
      if (r.outcome === 'team_a') {
        bonusAttA++;
        if (pts) bonusPtsA += pts.team_a;
      } else {
        bonusAttB++;
        if (pts) bonusPtsB += pts.team_b;
      }
    }
  }

  tournamentManager.completeGame(
    room.tournamentCode,
    room.tournamentGameId,
    state.scores,
    winnerId,
    {
      negs: { team_a: negsA, team_b: negsB },
      bonusPoints: { team_a: bonusPtsA, team_b: bonusPtsB },
      bonusAttempts: { team_a: bonusAttA, team_b: bonusAttB },
    }
  );
}

/**
 * Emit state to all clients in a room, filtering appropriately by role.
 * Delegates tournament game completion to handleTournamentGameCompletionIfNeeded when phase is game_over.
 */
export function emitStateToRoom(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomCode: string,
  state: GameState
) {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;

   // If an AI just buzzed, play the buzzer sound for the moderator.
   if (state.phase === 'answer_review' && state.buzzingPlayer && room.gameConfig) {
     const prevState = room.gameState;
     const justEnteredAnswerReview = !prevState || prevState.phase !== 'answer_review';

     if (justEnteredAnswerReview) {
       const allPlayers = [
         ...room.gameConfig.team_a.players,
         ...room.gameConfig.team_b.players,
       ];
       const buzzingPlayer = allPlayers.find(p => p.player_id === state.buzzingPlayer);

       if (buzzingPlayer && buzzingPlayer.type === 'ai') {
         io.to(room.moderatorId).emit('sound:buzz');
       }
     }
   }

  io.to(room.moderatorId).emit('game:state', state);

  const filteredState = filterStateForPlayer(state);
  room.playerIds.forEach(playerId => {
    io.to(playerId).emit('game:state', filteredState);
  });

  roomManager.setGameState(roomCode, state);

  handleTournamentGameCompletionIfNeeded(room, state);
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

  (io.to(room.moderatorId).emit as any)(event, ...args);
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
  socket.on('room:create', () => {
    const room = roomManager.createRoom(socket.id);
    socket.join(room.code);
    socket.emit('room:created', { code: room.code, role: 'moderator' });
    console.log(`Room ${room.code} created, moderator: ${socket.id}`);
  });

  socket.on('room:join', (code: string) => {
    const room = roomManager.joinRoom(socket.id, code);

    if (!room) {
      socket.emit('room:error', `Room "${code}" not found. Please check the code and try again.`);
      return;
    }

    socket.join(room.code);
    socket.emit('room:joined', {
      code: room.code,
      role: 'player',
      config: room.gameConfig,
    });

    if (room.gameState) {
      socket.emit('game:state', filterStateForPlayer(room.gameState));
    }
    if (room.gameConfig) {
      socket.emit('game:config', room.gameConfig);
    }

    notifyPlayerCount(io, room.code);
    console.log(`Player ${socket.id} joined room ${room.code}`);
  });

  socket.on('room:leave', () => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (room) {
      socket.leave(room.code);
      roomManager.leaveRoom(socket.id);

      if (roomManager.getRoom(room.code)) {
        notifyPlayerCount(io, room.code);
      }
    }
  });

  socket.on('game:start', async (config: GameConfig) => {
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

      const existingEngine = gameEngines.get(room.code);
      if (existingEngine) {
        existingEngine.cleanup();
      }

      const engine = new GameEngine(config, (state) => {
        state.roomCode = room.code;
        emitStateToRoom(io, room.code, state);
      });

      await engine.initialize();
      gameEngines.set(room.code, engine);

      roomManager.setGameConfig(room.code, config);

      io.to(room.moderatorId).emit('game:config', config);
      emitToPlayers(io, room.code, 'game:config', config);

      const initialState = engine.getState();
      initialState.roomCode = room.code;
      emitStateToRoom(io, room.code, initialState);

      engine.startGame();
    } catch (error) {
      console.error('Error starting game:', error);
      socket.emit('error', `Failed to start game: ${error}`);
    }
  });

  socket.on('moderator:next_word', () => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) engine.revealNextWord();
  });

  socket.on('player:buzz', (playerId: string) => {
    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    if (!roomManager.isModerator(socket.id)) return;

    const engine = gameEngines.get(room.code);
    if (engine) {
      const result = engine.handleBuzz(playerId);
      if (result.buzzed) socket.emit('sound:buzz');
    }
  });

  socket.on('moderator:answer_ruling', (data: { ruling: AnswerRuling; answer: string }) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) engine.handleAnswerRuling(data.ruling, data.answer);
  });

  socket.on('moderator:play_tossup', (tossupIndex: number) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) engine.playTossup(tossupIndex);
  });

  socket.on('moderator:play_bonus', (data: { bonusIndex: number; owner: 'team_a' | 'team_b' }) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) engine.playBonus(data.bonusIndex, data.owner);
  });

  socket.on('moderator:adjust_points', (data: { team_a: number; team_b: number }) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) engine.adjustPoints(data);
  });

  socket.on('moderator:set_ai_buzz_mode', (data: { playerId: string; mode: AIBuzzMode }) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) engine.setAiBuzzMode(data.playerId, data.mode);
  });

  socket.on('moderator:set_autonomous_k', (data: { playerId: string; k: number }) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) engine.setAutonomousK(data.playerId, data.k);
  });

  socket.on('moderator:ai_buzz', (playerId: string) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) engine.handleAIManualBuzz(playerId);
  });

  socket.on('bonus:advance', () => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) engine.advanceBonusStage();
  });

  socket.on('bonus:next_part', () => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) engine.advanceBonusPartReveal();
  });

  socket.on('bonus:reveal_ai', () => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) engine.revealBonusAi();
  });

  socket.on('bonus:part_result', (data: { decision: BonusPartDecision; correct: boolean; answer: string }) => {
    if (!roomManager.isModerator(socket.id)) return;

    const room = roomManager.getRoomForSocket(socket.id);
    if (!room) return;

    const engine = gameEngines.get(room.code);
    if (engine) engine.handleBonusPartResult(data);
  });

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
      const updatedConfig = engine.getConfig();
      roomManager.setGameConfig(room.code, updatedConfig);
      emitToRoom(io, room.code, 'game:config', updatedConfig);
    }

    callback?.(result);
  });

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
      const updatedConfig = engine.getConfig();
      roomManager.setGameConfig(room.code, updatedConfig);
      emitToRoom(io, room.code, 'game:config', updatedConfig);
    }

    callback?.(result);
  });

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

  socket.on('disconnect', () => {
    const room = roomManager.getRoomForSocket(socket.id);
    const wasModerator = roomManager.isModerator(socket.id);

    if (room) {
      const roomCode = room.code;
      roomManager.leaveRoom(socket.id);

      if (wasModerator) {
        const engine = gameEngines.get(roomCode);
        if (engine) {
          engine.cleanup();
          gameEngines.delete(roomCode);
        }

        emitToPlayers(io, roomCode, 'room:error', 'The moderator has disconnected. The game session has ended.');
      } else {
        notifyPlayerCount(io, roomCode);
      }
    }
  });
}
