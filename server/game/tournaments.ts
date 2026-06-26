import type {
  Tournament,
  TournamentGame,
  TournamentTeam,
  TournamentPhase,
  TournamentGameStatus,
  CreateTournamentParams,
  TournamentFormat,
  TeamStanding,
  PacketInfo,
  GameConfig,
  Team,
  Player,
} from '../../shared/types.js';
import { DEFAULT_GAME_CONFIG } from '../../shared/types.js';
import {
  getAllowedPlayoffSizes,
  generateRoundRobinRounds,
  generateRoundRobinRoundsPass2,
  nextPow2,
} from '../../shared/schedule-utils.js';
import {
  buildSeed,
  buildBye,
  buildWinner,
  buildQualifier,
  buildQualifierRR,
  PLACEHOLDER_BYE,
  isPlaceholder,
  parsePlaceholder,
} from '../../shared/tournament-placeholders.js';
import { roomManager } from './rooms.js';

// ============================================================================
// Helpers
// ============================================================================

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Re-export for tests that import from tournaments.js
export { nextPow2 } from '../../shared/schedule-utils.js';

export function seedForSlot(slot: number, totalSlots: number): number {
  if (totalSlots === 2) return slot + 1;
  const half = totalSlots / 2;
  if (slot % 2 === 0) {
    return seedForSlot(Math.floor(slot / 2), half);
  } else {
    return totalSlots + 1 - seedForSlot(Math.floor(slot / 2), half);
  }
}

export function getGameTag(totalRounds: number, roundIdx: number, matchIdx: number): string {
  const roundsFromFinal = totalRounds - 1 - roundIdx;
  if (roundsFromFinal === 0) return 'final';
  if (roundsFromFinal === 1) return `sf${matchIdx + 1}`;
  if (roundsFromFinal === 2) return `qf${matchIdx + 1}`;
  return `r${roundIdx + 1}_m${matchIdx + 1}`;
}

function generateCode(tournaments: Map<string, Tournament>): string {
  let code: string;
  do {
    code = 'TRN';
    for (let i = 0; i < 3; i++) {
      code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    }
  } while (tournaments.has(code));
  return code;
}

function generateId(): string {
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// Generic single-elimination bracket generator
// ============================================================================

const BRACKET_ROUND_NAMES: Record<number, Record<number, string>> = {
  1: { 1: 'final' },
  2: { 1: 'sf1', 2: 'sf2' },
  4: { 1: 'qf1', 2: 'qf2', 3: 'qf3', 4: 'qf4' },
};

/**
 * Build a generic single-elimination bracket for `numTeams` competitors.
 * Rounds up to next power of 2; top seeds get byes.
 * Returns games tagged with round names (qf1..qf4, sf1, sf2, final).
 */
function generateBracket(numTeams: number): TournamentGame[] {
  if (numTeams < 2) return [];

  const slots = nextPow2(numTeams);
  const totalRounds = Math.log2(slots);
  const games: TournamentGame[] = [];

  // Build bracket bottom-up: first round has slots/2 matchups
  // gamesByRound[r] = list of game objects for round r (0-indexed, 0 = first round)
  const gamesByRound: TournamentGame[][] = [];

  for (let r = 0; r < totalRounds; r++) {
    const gamesInRound = slots / Math.pow(2, r + 1);
    const roundGames: TournamentGame[] = [];

    for (let m = 0; m < gamesInRound; m++) {
      const tag = getGameTag(totalRounds, r, m);
      const game: TournamentGame = {
        id: generateId(),
        round: r + 1,
        matchNumber: m + 1,
        phase: 'playoffs',
        teamAId: r === 0 ? buildSeed(seedForSlot(m * 2, slots)) : buildSeed(0),
        teamBId: r === 0 ? buildSeed(seedForSlot(m * 2 + 1, slots)) : buildSeed(0),
        packetId: '__PLAYOFF__',
        status: 'scheduled',
        dependsOn: [],
        tag,
      };
      roundGames.push(game);
    }
    gamesByRound.push(roundGames);
  }

  // Wire up dependencies: each game in round r+1 depends on 2 games in round r
  for (let r = 1; r < totalRounds; r++) {
    for (let m = 0; m < gamesByRound[r].length; m++) {
      const feederA = gamesByRound[r - 1][m * 2];
      const feederB = gamesByRound[r - 1][m * 2 + 1];
      const game = gamesByRound[r][m];
      game.dependsOn = [feederA.id, feederB.id];
      game.teamAId = buildWinner(feederA.tag ?? feederA.id);
      game.teamBId = buildWinner(feederB.tag ?? feederB.id);
    }
  }

  // Assign seed placeholders for round 0 and handle byes
  const firstRoundGames = gamesByRound[0];
  const byes = slots - numTeams;

  for (let m = 0; m < firstRoundGames.length; m++) {
    const seedA = seedForSlot(m * 2, slots);
    const seedB = seedForSlot(m * 2 + 1, slots);
    const game = firstRoundGames[m];
    game.teamAId = buildSeed(seedA);
    game.teamBId = buildSeed(seedB);

    // If seed > numTeams, it's a bye — the other team auto-advances
    if (seedB > numTeams) {
      game.teamBId = buildBye();
      game.status = 'scheduled'; // will be auto-resolved during seeding
    }
    if (seedA > numTeams) {
      game.teamAId = buildBye();
      game.status = 'scheduled';
    }
  }

  // Flatten
  for (const rg of gamesByRound) {
    games.push(...rg);
  }

  return games;
}

export { generateBracket };

// ============================================================================
// TournamentManager
// ============================================================================

class TournamentManagerClass {
  tournaments: Map<string, Tournament> = new Map();

  generateCode(): string {
    return generateCode(this.tournaments);
  }

  createTournament(params: CreateTournamentParams, createdBy: string): Tournament {
    const code = generateCode(this.tournaments);
    const teams = params.teams;
    const packets = params.packets;

    if (teams.length < 2) {
      throw new Error('At least 2 teams required');
    }

    const fmt = params.format;
    const isGrouped = fmt.prelim === 'grouped_rr';
    const isDoubleRR = fmt.prelim === 'double_rr';
    const isSingleElimOnly = fmt.prelim === 'none' && fmt.playoffs === 'single_elim';
    const hasPlayoffs = fmt.playoffs === 'single_elim';

    let prelimGames: TournamentGame[] = [];
    let prelimRoundCount = 0;

    if (isSingleElimOnly) {
      prelimGames = [];
      prelimRoundCount = 0;
    } else if (isGrouped && params.groupAssignments) {
      const result = this.buildGroupedPrelims(params, packets);
      prelimGames = result.games;
      prelimRoundCount = result.roundCount;
    } else {
      const result = this.buildFullRRPrelims(params, packets, isDoubleRR);
      prelimGames = result.games;
      prelimRoundCount = result.roundCount;
    }

    // Determine playoff team count from playoffBracketSize (or backward compat from topNForPlayoffs)
    let playoffTeamCount = 0;
    let effectivePlayoffBracketSize: 2 | 4 | 8 | undefined;
    if (hasPlayoffs) {
      const inferBracketSize = (pool: number): 2 | 4 | 8 => {
        const fromTopN = params.topNForPlayoffs;
        if (fromTopN === 2 || fromTopN === 4 || fromTopN === 8) return fromTopN;
        const allowed = getAllowedPlayoffSizes(pool);
        const fallback = Math.min(4, pool);
        const size = allowed.includes(fallback as 2 | 4 | 8) ? (fallback as 2 | 4 | 8) : (allowed[allowed.length - 1] ?? 2);
        return size;
      };

      const clampToAllowed = (size: 2 | 4 | 8, pool: number): 2 | 4 | 8 => {
        const allowed = getAllowedPlayoffSizes(pool);
        if (allowed.includes(size)) return size;
        return (allowed[allowed.length - 1] ?? 2);
      };

      if (isSingleElimOnly) {
        const pool = teams.length;
        effectivePlayoffBracketSize = params.playoffBracketSize
          ? clampToAllowed(params.playoffBracketSize, pool)
          : inferBracketSize(pool);
        playoffTeamCount = Math.min(effectivePlayoffBracketSize, teams.length);
      } else if (isGrouped && params.groupAssignments && params.advancePerGroup) {
        const numGroups = Object.keys(params.groupAssignments).length;
        const qualifierCount = numGroups * params.advancePerGroup;
        const useQualifierRR = qualifierCount >= 3 && fmt.qualifiers.kind === 'rr';

        if (useQualifierRR) {
          playoffTeamCount = qualifierCount;
          effectivePlayoffBracketSize = params.playoffBracketSize
            ? clampToAllowed(params.playoffBracketSize, qualifierCount)
            : inferBracketSize(qualifierCount);
        } else {
          effectivePlayoffBracketSize = params.playoffBracketSize
            ? clampToAllowed(params.playoffBracketSize, qualifierCount)
            : inferBracketSize(qualifierCount);
          playoffTeamCount = Math.min(effectivePlayoffBracketSize, qualifierCount);
        }
      } else {
        const pool = teams.length;
        effectivePlayoffBracketSize = params.playoffBracketSize
          ? clampToAllowed(params.playoffBracketSize, pool)
          : inferBracketSize(pool);
        playoffTeamCount = Math.min(effectivePlayoffBracketSize, teams.length);
      }
    }

    // Build playoff bracket (or qualifier RR + Final)
    let playoffGames: TournamentGame[] = [];
    const allPrelimIds = prelimGames.map((p) => p.id);
    const useQualifierRR =
      hasPlayoffs && playoffTeamCount >= 3 && fmt.qualifiers.kind === 'rr' && isGrouped;

    if (hasPlayoffs && playoffTeamCount >= 2) {
      if (useQualifierRR) {
        // Qualifier RR: all qualifiers play round robin, then top N advance to bracket
        const bracketSize = Math.min(effectivePlayoffBracketSize ?? 2, playoffTeamCount);
        const rrRounds = generateRoundRobinRounds(playoffTeamCount);
        let roundNum = prelimRoundCount;
        const qualifierGames: TournamentGame[] = [];

        for (let r = 0; r < rrRounds.length; r++) {
          roundNum++;
          const round = rrRounds[r];
          const pkt = packets[prelimRoundCount + r];
          for (let m = 0; m < round.length; m++) {
            const [i, j] = round[m];
            const game: TournamentGame = {
              id: generateId(),
              round: roundNum,
              matchNumber: m + 1,
              phase: 'qualifiers',
              teamAId: buildQualifier(i + 1),
              teamBId: buildQualifier(j + 1),
              packetId: pkt?.id ?? '__PLAYOFF__',
              packetPath: pkt?.tossupFile,
              status: 'scheduled',
              dependsOn: [...allPrelimIds],
              tag: `qualifier_rr_r${r + 1}_m${m + 1}`,
              group: 'qualifier_rr',
            };
            qualifierGames.push(game);
          }
        }

        const qualifierGameIds = qualifierGames.map((g) => g.id);
        const bracketGames = generateBracket(bracketSize);
        const bracketRoundNums = [...new Set(bracketGames.map((x) => x.round))].sort((a, b) => a - b);
        bracketGames.forEach((g) => {
          const parsedA = parsePlaceholder(g.teamAId);
          const parsedB = parsePlaceholder(g.teamBId);
          if (parsedA?.kind === 'seed' && parsedA.seedNum) g.teamAId = buildQualifierRR(parsedA.seedNum);
          if (parsedB?.kind === 'seed' && parsedB.seedNum) g.teamBId = buildQualifierRR(parsedB.seedNum);
          if (g.round === bracketRoundNums[0]) {
            g.dependsOn = [...qualifierGameIds];
          }
          const bracketRoundIdx = bracketRoundNums.indexOf(g.round);
          const pkt = packets[prelimRoundCount + rrRounds.length + bracketRoundIdx];
          if (pkt) {
            g.packetId = pkt.id;
            g.packetPath = pkt.tossupFile;
          }
          g.round = roundNum + g.round;
        });
        playoffGames = [...qualifierGames, ...bracketGames];
      } else {
        // Direct bracket
        playoffGames = generateBracket(playoffTeamCount);
        const playoffRoundNums = [...new Set(playoffGames.map((g) => g.round))].sort((a, b) => a - b);
        playoffGames.forEach((g) => {
          if (g.round === playoffRoundNums[0]) {
            g.dependsOn = [...(g.dependsOn ?? []), ...allPrelimIds];
          }
          const playoffRoundIdx = playoffRoundNums.indexOf(g.round);
          const pkt = packets[prelimRoundCount + playoffRoundIdx];
          if (pkt) {
            g.packetId = pkt.id;
            g.packetPath = pkt.tossupFile;
          }
        });
      }
    }

    const games = [...prelimGames, ...playoffGames];

    // Initial standings
    const standings: TeamStanding[] = teams.map((t) => ({
      teamId: t.id,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      negs: 0,
      bonusPoints: 0,
      bonusAttempts: 0,
      group: t.group,
    }));

    const gameSettings = {
      ...DEFAULT_GAME_CONFIG,
      ...params.gameSettings,
    };

    const tournament: Tournament = {
      code,
      name: params.name,
      format: params.format,
      status: 'active',
      phase: 'prelims',
      datasetId: params.datasetId,
      packets,
      teams,
      games,
      standings,
      gameSettings,
      modelDirectory: params.modelDirectory,
      createdBy,
      createdAt: new Date(),
      topNForPlayoffs: (useQualifierRR ? effectivePlayoffBracketSize : playoffTeamCount) || params.topNForPlayoffs,
      playoffBracketSize: effectivePlayoffBracketSize,
      numGroups: params.numGroups,
      groupAssignments: params.groupAssignments,
      advancePerGroup: params.advancePerGroup,
    };

    this.tournaments.set(code, tournament);
    return tournament;
  }

  private buildFullRRPrelims(
    params: CreateTournamentParams,
    packets: PacketInfo[],
    isDoubleRR: boolean,
  ): { games: TournamentGame[]; roundCount: number } {
    const teams = params.teams;
    const allRRPasses: [number, number][][] = [
      ...generateRoundRobinRounds(teams.length),
      ...(isDoubleRR ? generateRoundRobinRoundsPass2(teams.length) : []),
    ];
    const teamIdByIndex = teams.map((t) => t.id);
    const games: TournamentGame[] = [];
    const prevRoundGameIds: string[] = [];

    for (let r = 0; r < allRRPasses.length; r++) {
      const round = allRRPasses[r];
      const packet = packets[r % packets.length];

      for (let m = 0; m < round.length; m++) {
        const [i, j] = round[m];
        const game: TournamentGame = {
          id: generateId(),
          round: r + 1,
          matchNumber: m + 1,
          phase: 'prelims',
          teamAId: teamIdByIndex[i],
          teamBId: teamIdByIndex[j],
          packetId: packet.id,
          packetPath: packet.tossupFile,
          status: r === 0 ? 'ready' : 'scheduled',
          dependsOn: r === 0 ? [] : [...prevRoundGameIds],
        };
        games.push(game);
      }
      prevRoundGameIds.length = 0;
      games.filter((g) => g.round === r + 1).forEach((g) => prevRoundGameIds.push(g.id));
    }

    return { games, roundCount: allRRPasses.length };
  }

  private buildGroupedPrelims(
    params: CreateTournamentParams,
    packets: PacketInfo[],
  ): { games: TournamentGame[]; roundCount: number } {
    const groupAssignments = params.groupAssignments!;
    const groupIds = Object.keys(groupAssignments).sort();
    const games: TournamentGame[] = [];
    let maxRoundCount = 0;

    for (const groupId of groupIds) {
      const teamIds = groupAssignments[groupId];
      if (teamIds.length < 2) continue;

      const rrRounds = generateRoundRobinRounds(teamIds.length);
      maxRoundCount = Math.max(maxRoundCount, rrRounds.length);

      const prevRoundGameIds: string[] = [];
      for (let r = 0; r < rrRounds.length; r++) {
        const round = rrRounds[r];
        const packet = packets[r % packets.length];

        for (let m = 0; m < round.length; m++) {
          const [i, j] = round[m];
          const game: TournamentGame = {
            id: generateId(),
            round: r + 1,
            matchNumber: m + 1,
            phase: 'prelims',
            teamAId: teamIds[i],
            teamBId: teamIds[j],
            packetId: packet.id,
            packetPath: packet.tossupFile,
            status: r === 0 ? 'ready' : 'scheduled',
            dependsOn: r === 0 ? [] : [...prevRoundGameIds],
            group: groupId,
          };
          games.push(game);
        }
        prevRoundGameIds.length = 0;
        games
          .filter((g) => g.round === r + 1 && g.group === groupId)
          .forEach((g) => prevRoundGameIds.push(g.id));
      }
    }

    return { games, roundCount: maxRoundCount };
  }

  getTournament(code: string): Tournament | null {
    return this.tournaments.get(code.toUpperCase()) || null;
  }

  listTournaments(): Tournament[] {
    return Array.from(this.tournaments.values()).filter(
      (t) => t.status === 'active' || t.status === 'draft'
    );
  }

  canStartGame(tournamentCode: string, gameId: string): { ok: boolean; reason?: string } {
    const t = this.getTournament(tournamentCode);
    if (!t) return { ok: false, reason: 'Tournament not found' };

    const game = t.games.find((g) => g.id === gameId);
    if (!game) return { ok: false, reason: 'Game not found' };
    if (game.status !== 'ready' && game.status !== 'scheduled') {
      return { ok: false, reason: 'Game already started or completed' };
    }

    if (game.dependsOn && game.dependsOn.length > 0) {
      const deps = t.games.filter((g) => game.dependsOn!.includes(g.id));
      const incomplete = deps.find((d) => d.status !== 'completed');
      if (incomplete) {
        return {
          ok: false,
          reason: 'Complete all prerequisite games first',
        };
      }
    }

    return { ok: true };
  }

  startGame(
    tournamentCode: string,
    gameId: string,
    moderatorSocketId: string
  ): { roomCode: string; config: GameConfig; round: number; matchNumber: number; teamAName: string; teamBName: string } | { error: string } {
    const check = this.canStartGame(tournamentCode, gameId);
    if (!check.ok) return { error: check.reason ?? 'Cannot start game' };

    const t = this.getTournament(tournamentCode);
    if (!t) return { error: 'Tournament not found' };

    const game = t.games.find((g) => g.id === gameId);
    if (!game) return { error: 'Game not found' };
    if (game.status === 'in_progress') return { error: 'Game already in progress' };

    const teamA = t.teams.find((x) => x.id === game.teamAId);
    const teamB = t.teams.find((x) => x.id === game.teamBId);
    if (!teamA || !teamB) return { error: 'Teams not found' };

    if (isPlaceholder(teamA.id) || isPlaceholder(teamB.id)) {
      return { error: 'Playoff teams not yet determined' };
    }

    const packet = t.packets.find((p) => p.id === game.packetId);
    if (!packet) return { error: 'Packet not found' };

    const room = roomManager.createRoom(moderatorSocketId);
    room.tournamentGameId = gameId;
    room.tournamentCode = tournamentCode;

    const teamAConfig: Team = {
      name: teamA.name,
      players: [...teamA.humanPlayers, ...teamA.aiPlayers],
    };
    const teamBConfig: Team = {
      name: teamB.name,
      players: [...teamB.humanPlayers, ...teamB.aiPlayers],
    };

    const config: GameConfig = {
      ...t.gameSettings,
      team_a: teamAConfig,
      team_b: teamBConfig,
      tossup_file: packet.tossupFile,
      bonus_file: packet.bonusFile ?? packet.tossupFile.replace(/tossups?\.(csv|jsonl?)$/, 'bonuses.$1'),
      model_directory: t.modelDirectory,
      auto_stream: t.gameSettings.auto_stream ?? false,
      streaming_speed: t.gameSettings.streaming_speed ?? 200,
      auto_evaluate: t.gameSettings.auto_evaluate ?? false,
      suppress_early_ai_second_buzzes: t.gameSettings.suppress_early_ai_second_buzzes ?? true,
      enable_power_points: t.gameSettings.enable_power_points ?? false,
      power_points_value: t.gameSettings.power_points_value ?? 15,
      default_points_value: t.gameSettings.default_points_value ?? 10,
      tossup_penalty_value: t.gameSettings.tossup_penalty_value ?? 5,
      tossup_penalty_value_second_team: t.gameSettings.tossup_penalty_value_second_team ?? 0,
      bonus_part_points: t.gameSettings.bonus_part_points ?? 10,
      multimodal_reveal_lockout_seconds: t.gameSettings.multimodal_reveal_lockout_seconds ?? 1,
      ai_tossup_score_factors:
        t.gameSettings.ai_tossup_score_factors ?? {
          lightweight: 1.0,
          midweight: 0.8,
          heavyweight: 0.4,
        },
      tossup_deflation_mode: t.gameSettings.tossup_deflation_mode ?? 'weighted',
      tossup_static_deflation: t.gameSettings.tossup_static_deflation ?? 5,
      autonomous_default_k: t.gameSettings.autonomous_default_k ?? 1,
      bonus_ai_consult_factor: t.gameSettings.bonus_ai_consult_factor ?? 0.5,
      bonus_deflation_mode: t.gameSettings.bonus_deflation_mode ?? 'static',
      bonus_static_deflation: t.gameSettings.bonus_static_deflation ?? 5,
      bonus_weight_deflation: t.gameSettings.bonus_weight_deflation ?? {
        lightweight: 1,
        midweight: 2,
        heavyweight: 3,
      },
      bonus_abstain_points: t.gameSettings.bonus_abstain_points ?? 1,
    } as GameConfig;

    roomManager.setGameConfig(room.code, config);
    game.status = 'in_progress';
    game.roomCode = room.code;

    return {
      roomCode: room.code,
      config,
      round: game.round,
      matchNumber: game.matchNumber,
      teamAName: teamA.name,
      teamBName: teamB.name,
    };
  }

  completeGame(
    tournamentCode: string,
    gameId: string,
    scores: { team_a: number; team_b: number },
    winnerId?: string,
    detailedStats?: {
      negs: { team_a: number; team_b: number };
      bonusPoints: { team_a: number; team_b: number };
      bonusAttempts: { team_a: number; team_b: number };
    }
  ): void {
    const t = this.getTournament(tournamentCode);
    if (!t) return;

    const game = t.games.find((g) => g.id === gameId);
    if (!game) return;

    game.status = 'completed';
    game.scores = scores;
    game.winnerId = winnerId;
    game.roomCode = undefined;

    // Update standings for prelims
    if (game.phase === 'prelims') {
      const standingA = t.standings.find((s) => s.teamId === game.teamAId);
      const standingB = t.standings.find((s) => s.teamId === game.teamBId);
      if (standingA && standingB) {
        standingA.pointsFor += scores.team_a;
        standingA.pointsAgainst += scores.team_b;
        standingB.pointsFor += scores.team_b;
        standingB.pointsAgainst += scores.team_a;
        if (winnerId) {
          if (winnerId === game.teamAId) {
            standingA.wins++;
            standingB.losses++;
          } else {
            standingB.wins++;
            standingA.losses++;
          }
        }
        if (detailedStats) {
          standingA.negs += detailedStats.negs.team_a;
          standingB.negs += detailedStats.negs.team_b;
          standingA.bonusPoints += detailedStats.bonusPoints.team_a;
          standingB.bonusPoints += detailedStats.bonusPoints.team_b;
          standingA.bonusAttempts += detailedStats.bonusAttempts.team_a;
          standingB.bonusAttempts += detailedStats.bonusAttempts.team_b;
        }
      }
    }

    // Unlock dependent games
    t.games
      .filter((g) => g.dependsOn?.includes(game.id))
      .forEach((g) => {
        const allDepsComplete = g.dependsOn!.every((depId) => {
          const d = t.games.find((x) => x.id === depId);
          return d?.status === 'completed';
        });
        if (allDepsComplete) {
          g.status = 'ready';
        }
      });

    // Check playoff seeding when all prelims complete (direct bracket only; qualifier RR path runs below)
    const hasPlayoffs = t.games.some((g) => g.phase === 'playoffs');
    const hasQualifiersPhase = t.games.some((g) => g.phase === 'qualifiers');
    if (game.phase === 'prelims' && hasPlayoffs && !hasQualifiersPhase) {
      const prelimGames = t.games.filter((g) => g.phase === 'prelims');
      if (prelimGames.every((g) => g.status === 'completed')) {
        this.populatePlayoffSeeds(t);
      }
    }

    // Propagate winner through bracket
    if (game.phase === 'playoffs' && winnerId && game.tag) {
      const winnerPlaceholder = buildWinner(game.tag);
      t.games.forEach((g) => {
        if (g.teamAId === winnerPlaceholder) g.teamAId = winnerId;
        if (g.teamBId === winnerPlaceholder) g.teamBId = winnerId;
      });
    }

    // When all qualifier RR games complete, populate bracket with top N from RR standings
    if (game.phase === 'qualifiers' && game.group === 'qualifier_rr') {
      const qualifierRRGames = t.games.filter((g) => g.phase === 'qualifiers' && g.group === 'qualifier_rr');
      if (qualifierRRGames.every((g) => g.status === 'completed')) {
        const rrStandings = this.computeQualifierRRStandings(t, qualifierRRGames);
        const bracketSize = t.playoffBracketSize ?? 2;
        const topN = rrStandings.slice(0, bracketSize).map((s) => s.teamId);
        const bracketGames = t.games.filter((g) => g.phase === 'playoffs' && g.group !== 'qualifier_rr');
        for (const pg of bracketGames) {
          const parsedA = parsePlaceholder(pg.teamAId);
          const parsedB = parsePlaceholder(pg.teamBId);
          if (parsedA?.kind === 'qualifier_rr' && parsedA.seedNum)
            pg.teamAId = topN[parsedA.seedNum - 1] ?? pg.teamAId;
          if (parsedB?.kind === 'qualifier_rr' && parsedB.seedNum)
            pg.teamBId = topN[parsedB.seedNum - 1] ?? pg.teamBId;
        }
        for (const pg of bracketGames) {
          if (pg.teamBId === PLACEHOLDER_BYE && !isPlaceholder(pg.teamAId)) {
            pg.status = 'completed';
            pg.winnerId = pg.teamAId;
            pg.scores = { team_a: 0, team_b: 0 };
            if (pg.tag) {
              const winnerPlaceholder = buildWinner(pg.tag);
              for (const g of bracketGames) {
                if (g.teamAId === winnerPlaceholder) g.teamAId = pg.teamAId;
                if (g.teamBId === winnerPlaceholder) g.teamBId = pg.teamAId;
              }
            }
          } else if (pg.teamAId === PLACEHOLDER_BYE && !isPlaceholder(pg.teamBId)) {
            pg.status = 'completed';
            pg.winnerId = pg.teamBId;
            pg.scores = { team_a: 0, team_b: 0 };
            if (pg.tag) {
              const winnerPlaceholder = buildWinner(pg.tag);
              for (const g of bracketGames) {
                if (g.teamAId === winnerPlaceholder) g.teamAId = pg.teamBId;
                if (g.teamBId === winnerPlaceholder) g.teamBId = pg.teamBId;
              }
            }
          }
        }
        for (const pg of bracketGames) {
          if (pg.status === 'scheduled' && !isPlaceholder(pg.teamAId) && !isPlaceholder(pg.teamBId)) {
            pg.status = 'ready';
          } else if (pg.status === 'scheduled' && (pg.teamAId === PLACEHOLDER_BYE || pg.teamBId === PLACEHOLDER_BYE)) {
            pg.status = 'ready';
          }
        }
        t.phase = 'playoffs';
      }
    }

    // Check if tournament complete
    const hasIncomplete = t.games.some((g) => g.status !== 'completed');
    if (!hasIncomplete) {
      t.status = 'completed';
      t.phase = 'completed';
    }
  }

  private populatePlayoffSeeds(t: Tournament): void {
    const isGrouped = t.format.prelim === 'grouped_rr' && t.groupAssignments;
    const playoffTeamCount = t.topNForPlayoffs ?? 4;
    let seeds: string[];

    if (isGrouped) {
      seeds = this.getGroupedSeeds(t);
      seeds = seeds.slice(0, playoffTeamCount);
    } else {
      const sorted = this.sortStandings(t.standings);
      seeds = sorted.slice(0, playoffTeamCount).map((s) => s.teamId);
    }

    const playoffGames = t.games.filter((g) => g.phase === 'playoffs');

    // Replace seed/qualifier placeholders with actual team IDs
    for (const game of playoffGames) {
      const parsedA = parsePlaceholder(game.teamAId);
      const parsedB = parsePlaceholder(game.teamBId);
      if ((parsedA?.kind === 'seed' || parsedA?.kind === 'qualifier') && parsedA.seedNum) {
        game.teamAId = seeds[parsedA.seedNum - 1] ?? game.teamAId;
      }
      if ((parsedB?.kind === 'seed' || parsedB?.kind === 'qualifier') && parsedB.seedNum) {
        game.teamBId = seeds[parsedB.seedNum - 1] ?? game.teamBId;
      }

      // Handle byes: if opponent is BYE, auto-complete and propagate
      if (game.teamBId === PLACEHOLDER_BYE && !isPlaceholder(game.teamAId)) {
        game.status = 'completed';
        game.winnerId = game.teamAId;
        game.scores = { team_a: 0, team_b: 0 };
        if (game.tag) {
          const winnerPlaceholder = buildWinner(game.tag);
          for (const g of playoffGames) {
            if (g.teamAId === winnerPlaceholder) g.teamAId = game.teamAId;
            if (g.teamBId === winnerPlaceholder) g.teamBId = game.teamAId;
          }
        }
      } else if (game.teamAId === PLACEHOLDER_BYE && !isPlaceholder(game.teamBId)) {
        game.status = 'completed';
        game.winnerId = game.teamBId;
        game.scores = { team_a: 0, team_b: 0 };
        if (game.tag) {
          const winnerPlaceholder = buildWinner(game.tag);
          for (const g of playoffGames) {
            if (g.teamAId === winnerPlaceholder) g.teamAId = game.teamBId;
            if (g.teamBId === winnerPlaceholder) g.teamBId = game.teamBId;
          }
        }
      }
    }

    // Mark non-bye first-round games as ready if both teams are resolved
    for (const game of playoffGames) {
      if (game.status === 'scheduled' && !isPlaceholder(game.teamAId) && !isPlaceholder(game.teamBId)) {
        const allDepsComplete = !game.dependsOn?.length || game.dependsOn.every((depId) => {
          const d = t.games.find((x) => x.id === depId);
          return d?.status === 'completed';
        });
        if (allDepsComplete) {
          game.status = 'ready';
        }
      }
    }

    t.phase = 'playoffs';
  }

  private getGroupedSeeds(t: Tournament): string[] {
    const groupAssignments = t.groupAssignments!;
    const advancePerGroup = t.advancePerGroup ?? 1;
    const groupIds = Object.keys(groupAssignments).sort();
    const seeds: string[] = [];

    // Collect top N from each group, interleaved for fair bracket seeding
    // Round 1: #1 from each group, Round 2: #2 from each group, etc.
    for (let rank = 0; rank < advancePerGroup; rank++) {
      for (const groupId of groupIds) {
        const groupTeamIds = new Set(groupAssignments[groupId]);
        const groupStandings = t.standings.filter((s) => groupTeamIds.has(s.teamId));
        const sorted = this.sortStandings(groupStandings);
        if (sorted[rank]) {
          seeds.push(sorted[rank].teamId);
        }
      }
    }

    return seeds;
  }

  private sortStandings(standings: TeamStanding[]): TeamStanding[] {
    return [...standings].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
    });
  }

  private computeQualifierRRStandings(
    t: Tournament,
    qualifierRRGames: TournamentGame[]
  ): { teamId: string; wins: number; pointsFor: number; pointsAgainst: number }[] {
    const teamIds = new Set<string>();
    for (const g of qualifierRRGames) {
      if (!isPlaceholder(g.teamAId)) teamIds.add(g.teamAId);
      if (!isPlaceholder(g.teamBId)) teamIds.add(g.teamBId);
    }
    const record = new Map<string, { wins: number; pointsFor: number; pointsAgainst: number }>();
    for (const tid of teamIds) {
      record.set(tid, { wins: 0, pointsFor: 0, pointsAgainst: 0 });
    }
    for (const g of qualifierRRGames) {
      if (!g.scores || isPlaceholder(g.teamAId) || isPlaceholder(g.teamBId)) continue;
      const ra = record.get(g.teamAId)!;
      const rb = record.get(g.teamBId)!;
      ra.pointsFor += g.scores.team_a;
      ra.pointsAgainst += g.scores.team_b;
      rb.pointsFor += g.scores.team_b;
      rb.pointsAgainst += g.scores.team_a;
      if (g.winnerId) {
        if (g.winnerId === g.teamAId) {
          ra.wins += 1;
        } else {
          rb.wins += 1;
        }
      }
    }
    return [...record.entries()]
      .map(([teamId, r]) => ({ teamId, ...r }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
      });
  }
}

export const tournamentManager = new TournamentManagerClass();
