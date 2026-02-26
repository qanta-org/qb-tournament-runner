import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types.js';
import type { CreateTournamentParams, Tournament } from '../../shared/types.js';
import { tournamentManager } from './tournaments.js';
import { roomManager } from './rooms.js';
import { GameEngine } from './engine.js';
import { gameEngines } from './engines.js';
import { emitStateToRoom } from './handlers.js';

type ServerType = Server<ClientToServerEvents, ServerToClientEvents>;
type SocketType = Socket<ClientToServerEvents, ServerToClientEvents>;

export function setupTournamentHandlers(io: ServerType, socket: SocketType): void {
  socket.on('tournament:create', (params: CreateTournamentParams, callback?: (res: { code?: string; error?: string }) => void) => {
    try {
      const tournament = tournamentManager.createTournament(params, socket.id);
      callback?.({ code: tournament.code });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create tournament';
      console.error('tournament:create error:', err);
      callback?.({ error: msg });
    }
  });

  socket.on('tournament:get', (code: string, callback?: (res: { tournament?: Tournament; error?: string }) => void) => {
    const tournament = tournamentManager.getTournament(code);
    if (!tournament) {
      callback?.({ error: 'Tournament not found' });
      return;
    }
    callback?.({ tournament });
  });

  socket.on('tournament:start_game', async (data: { code: string; gameId: string }, callback?: (res: { roomCode?: string; error?: string }) => void) => {
    const result = tournamentManager.startGame(data.code, data.gameId, socket.id);

    if ('error' in result) {
      callback?.({ error: result.error });
      return;
    }

    const { roomCode, config, round, matchNumber, teamAName, teamBName } = result;

    // Create room was already done by startGame - we need to join socket and set up engine
    const room = roomManager.getRoom(roomCode);
    if (!room) {
      callback?.({ error: 'Room not found' });
      return;
    }

    // Join socket.io room for broadcasts
    socket.join(roomCode);

    try {
      // 1. Tell the client about the room so it transitions to pre-game setup
      socket.emit('room:created', {
        code: roomCode,
        role: 'moderator',
        tournamentCode: data.code,
        round,
        matchNumber,
        teamAName,
        teamBName,
      });

      // 2. Send config so the client can show the pre-game team config screen
      //    (teams pre-populated, settings pre-filled — moderator can adjust and click Start)
      socket.emit('game:config', config);

      // Don't start the engine yet — the moderator will click "Start Game"
      // after reviewing/adjusting teams, which triggers the normal game:start flow.

      callback?.({ roomCode });
    } catch (err) {
      console.error('tournament:start_game error:', err);
      callback?.({ error: err instanceof Error ? err.message : 'Failed to start game' });
    }
  });
}
