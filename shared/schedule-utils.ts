/**
 * Shared schedule format utilities for tournament preview (wizard, BracketSandbox).
 * Server builds the actual schedule in tournaments.ts.
 */

import type { TournamentFormat } from './types';

export type SchedulePhase = 'prelims' | 'qualifiers' | 'playoffs';

export interface ScheduleGame {
  id: string;
  round: number;
  matchNumber: number;
  phase: SchedulePhase;
  teamAId: string;
  teamBId: string;
  group?: string;
  tag?: string;
}

export interface ScheduleRound {
  round: number;
  phase: SchedulePhase;
  games: ScheduleGame[];
  packetId: string | null;
  label?: string;
}

export type PrelimStrategy = 'round_robin' | 'double_round_robin' | 'grouped_round_robin' | 'none';
export type PlayoffStrategy = 'none' | 'single_elim';
export type Phase2Style = 'bracket' | 'round_robin';

/**
 * Snake-draft team IDs into numGroups groups (A, B, C, ...). Used for grouped prelims.
 */
export function snakeDraftGroups(teamIds: string[], numGroups: number): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (let g = 0; g < numGroups; g++) {
    groups[String.fromCharCode(65 + g)] = [];
  }
  const groupKeys = Object.keys(groups);
  for (let i = 0; i < teamIds.length; i++) {
    const pass = Math.floor(i / numGroups);
    const pos = i % numGroups;
    const groupIdx = pass % 2 === 0 ? pos : numGroups - 1 - pos;
    groups[groupKeys[groupIdx]].push(teamIds[i]);
  }
  return groups;
}

export function generateRoundRobinRounds(n: number): [number, number][][] {
  if (n < 2) return [];
  const isOdd = n % 2 !== 0;
  const total = isOdd ? n + 1 : n;
  const byeIdx = isOdd ? n : -1;
  const pool = Array.from({ length: total - 1 }, (_, i) => i + 1);
  const rounds: [number, number][][] = [];

  for (let r = 0; r < total - 1; r++) {
    const round: [number, number][] = [];
    const a = 0;
    const b = pool[0];
    if (a !== byeIdx && b !== byeIdx) round.push([Math.min(a, b), Math.max(a, b)]);
    for (let k = 1; k < total / 2; k++) {
      const p = pool[k];
      const q = pool[total - 1 - k];
      if (p !== byeIdx && q !== byeIdx) round.push([Math.min(p, q), Math.max(p, q)]);
    }
    rounds.push(round);
    pool.unshift(pool.pop()!);
  }
  return rounds;
}

export function generateRoundRobinRoundsPass2(n: number): [number, number][][] {
  if (n < 2) return [];
  const isOdd = n % 2 !== 0;
  const total = isOdd ? n + 1 : n;
  const byeIdx = isOdd ? n : -1;
  const pool = Array.from({ length: total - 1 }, (_, i) => i + 1).reverse();
  const rounds: [number, number][][] = [];

  for (let r = 0; r < total - 1; r++) {
    const round: [number, number][] = [];
    const a = 0;
    const b = pool[0];
    if (a !== byeIdx && b !== byeIdx) round.push([Math.min(a, b), Math.max(a, b)]);
    for (let k = 1; k < total / 2; k++) {
      const p = pool[k];
      const q = pool[total - 1 - k];
      if (p !== byeIdx && q !== byeIdx) round.push([Math.min(p, q), Math.max(p, q)]);
    }
    rounds.push(round);
    pool.unshift(pool.pop()!);
  }
  return rounds;
}

export function nextPow2(n: number): number {
  let v = 1;
  while (v < n) v *= 2;
  return v;
}

export function bracketGameCount(numTeams: number): { rounds: number; games: number } {
  if (numTeams < 2) return { rounds: 0, games: 0 };
  const slots = nextPow2(numTeams);
  const totalRounds = Math.log2(slots);
  let games = 0;
  for (let r = 0; r < totalRounds; r++) {
    games += slots / Math.pow(2, r + 1);
  }
  return { rounds: totalRounds, games };
}

export function rrRoundCount(n: number): number {
  return n % 2 === 0 ? n - 1 : n;
}

/** Packet count for qualifier RR: RR rounds + 1 Final */
export function qualifierRRPacketCount(n: number): number {
  return rrRoundCount(n) + 1;
}

/** Packet count for direct bracket (ceil(log2(N)) rounds) */
export function bracketPacketCount(n: number): number {
  if (n < 2) return 0;
  return bracketGameCount(n).rounds;
}

/** Allowed playoff bracket sizes (2, 4, 8) constrained by pool size */
export function getAllowedPlayoffSizes(poolSize: number): (2 | 4 | 8)[] {
  if (poolSize < 2) return [];
  if (poolSize < 4) return [2];
  if (poolSize < 8) return [2, 4];
  return [2, 4, 8];
}

export function bracketRoundLabel(roundIdx: number, totalRounds: number): string {
  const fromFinal = totalRounds - 1 - roundIdx;
  if (fromFinal === 0) return 'Final';
  if (fromFinal === 1) return 'Semifinals';
  if (fromFinal === 2) return 'Quarterfinals';
  return `Playoff Round ${roundIdx + 1}`;
}

export interface FormatSummary {
  prelimRounds: number;
  prelimGames: number;
  playoffRounds: number;
  playoffGames: number;
  totalRounds: number;
  totalGames: number;
  feasible: boolean;
  /** Packets needed for phase 2 (bracket or qualifier RR) */
  phase2Packets?: number;
}

/** Compute format summary from structured TournamentFormat */
export function computeFormatSummary(
  n: number,
  format: TournamentFormat,
  topN: number,
  totalPackets: number,
  groupAssignments?: Record<string, string[]>,
  advancePerGroup?: number
): FormatSummary {
  let prelimRounds = 0;
  let prelimGames = 0;
  let playoffRounds = 0;
  let playoffGames = 0;

  if (format.prelim === 'full_rr' && n >= 2) {
    prelimRounds = rrRoundCount(n);
    prelimGames = (n * (n - 1)) / 2;
  } else if (format.prelim === 'double_rr' && n >= 2) {
    prelimRounds = rrRoundCount(n) * 2;
    prelimGames = n * (n - 1);
  } else if (format.prelim === 'grouped_rr' && groupAssignments) {
    const groupIds = Object.keys(groupAssignments);
    let maxRounds = 0;
    for (const gid of groupIds) {
      const gn = groupAssignments[gid].length;
      if (gn >= 2) {
        maxRounds = Math.max(maxRounds, rrRoundCount(gn));
        prelimGames += (gn * (gn - 1)) / 2;
      }
    }
    prelimRounds = maxRounds;
  }

  let phase2Packets: number | undefined;
  if (format.playoffs === 'single_elim') {
    const qualifierCount =
      groupAssignments && (advancePerGroup ?? 1)
        ? Object.keys(groupAssignments).length * (advancePerGroup ?? 1)
        : 0;
    const useQualifierRR =
      format.prelim === 'grouped_rr' &&
      format.qualifiers.kind === 'rr' &&
      groupAssignments &&
      qualifierCount >= 3;

    if (useQualifierRR && groupAssignments && (advancePerGroup ?? 1)) {
      const bracketSize = Math.min(topN, qualifierCount);
      if (bracketSize >= 2) {
        playoffRounds = rrRoundCount(qualifierCount) + bracketGameCount(bracketSize).rounds;
        playoffGames = (qualifierCount * (qualifierCount - 1)) / 2 + bracketGameCount(bracketSize).games;
        phase2Packets = rrRoundCount(qualifierCount) + bracketPacketCount(bracketSize);
      }
    } else {
      const poolSize =
        format.prelim === 'grouped_rr' && qualifierCount > 0 ? qualifierCount : n;
      const pTeams = Math.min(topN, poolSize);
      if (pTeams >= 2) {
        const b = bracketGameCount(pTeams);
        playoffRounds = b.rounds;
        playoffGames = b.games;
        phase2Packets = bracketPacketCount(pTeams);
      }
    }
  }

  const totalRounds = prelimRounds + playoffRounds;
  const totalGamesAll = prelimGames + playoffGames;
  const feasible = totalPackets >= totalRounds;

  return {
    prelimRounds,
    prelimGames,
    playoffRounds,
    playoffGames,
    totalRounds,
    totalGames: totalGamesAll,
    feasible,
    phase2Packets,
  };
}

export function buildScheduleRounds(
  teamIds: string[],
  format: TournamentFormat,
  topN: number,
  groupAssignments?: Record<string, string[]>,
  advancePerGroup?: number
): ScheduleRound[] {
  const isSingleElim = format.prelim === 'none' && format.playoffs === 'single_elim';
  const isDoubleRR = format.prelim === 'double_rr';
  const isGrouped = format.prelim === 'grouped_rr';
  const hasPlayoffs = format.playoffs === 'single_elim';

  const result: ScheduleRound[] = [];
  let roundNum = 0;
  let gameNum = 0;

  if (isSingleElim) {
    // No prelims — skip to bracket
  } else if (isGrouped && groupAssignments) {
    const groupIds = Object.keys(groupAssignments).sort();
    let maxGroupRounds = 0;

    for (const groupId of groupIds) {
      const gTeamIds = groupAssignments[groupId];
      if (gTeamIds.length < 2) continue;
      const rrRounds = generateRoundRobinRounds(gTeamIds.length);
      maxGroupRounds = Math.max(maxGroupRounds, rrRounds.length);
    }

    for (let r = 0; r < maxGroupRounds; r++) {
      roundNum++;
      const games: ScheduleGame[] = [];
      for (const groupId of groupIds) {
        const gTeamIds = groupAssignments[groupId];
        if (gTeamIds.length < 2) continue;
        const rrRounds = generateRoundRobinRounds(gTeamIds.length);
        if (r >= rrRounds.length) continue;
        for (let m = 0; m < rrRounds[r].length; m++) {
          const [i, j] = rrRounds[r][m];
          games.push({
            id: `group_${groupId}_r${r}_${gameNum++}`,
            round: roundNum,
            matchNumber: games.length + 1,
            phase: 'prelims',
            teamAId: gTeamIds[i],
            teamBId: gTeamIds[j],
            group: groupId,
          });
        }
      }
      result.push({ round: roundNum, phase: 'prelims', games, packetId: null });
    }
  } else {
    const rrRounds = generateRoundRobinRounds(teamIds.length);
    for (let r = 0; r < rrRounds.length; r++) {
      roundNum++;
      const games: ScheduleGame[] = [];
      for (let m = 0; m < rrRounds[r].length; m++) {
        const [i, j] = rrRounds[r][m];
        games.push({
          id: `prelim_${gameNum++}`,
          round: roundNum,
          matchNumber: m + 1,
          phase: 'prelims',
          teamAId: teamIds[i],
          teamBId: teamIds[j],
        });
      }
      result.push({ round: roundNum, phase: 'prelims', games, packetId: null });
    }

    if (isDoubleRR) {
      const rrRounds2 = generateRoundRobinRoundsPass2(teamIds.length);
      for (let r = 0; r < rrRounds2.length; r++) {
        roundNum++;
        const games: ScheduleGame[] = [];
        for (let m = 0; m < rrRounds2[r].length; m++) {
          const [i, j] = rrRounds2[r][m];
          games.push({
            id: `prelim2_${gameNum++}`,
            round: roundNum,
            matchNumber: m + 1,
            phase: 'prelims',
            teamAId: teamIds[i],
            teamBId: teamIds[j],
          });
        }
        result.push({ round: roundNum, phase: 'prelims', games, packetId: null });
      }
    }
  }

  // Playoff bracket or qualifier RR + bracket (single_elim uses topN = team count or bracket size)
  const qualifierCount =
    groupAssignments && (advancePerGroup ?? 1)
      ? Object.keys(groupAssignments).length * (advancePerGroup ?? 1)
      : 0;
  const useQualifierRR =
    isGrouped &&
    format.qualifiers.kind === 'rr' &&
    groupAssignments &&
    qualifierCount >= 3;
  const effectiveTopN = isSingleElim ? Math.min(topN, teamIds.length) : topN;

  if (hasPlayoffs && effectiveTopN >= 2) {
    if (useQualifierRR && groupAssignments && (advancePerGroup ?? 1)) {
      const bracketSize = Math.min(topN, qualifierCount);
      const rrRounds = generateRoundRobinRounds(qualifierCount);
      for (let r = 0; r < rrRounds.length; r++) {
        roundNum++;
        const games: ScheduleGame[] = [];
        for (let m = 0; m < rrRounds[r].length; m++) {
          const [i, j] = rrRounds[r][m];
          games.push({
            id: `qualifier_rr_${gameNum++}`,
            round: roundNum,
            matchNumber: m + 1,
            phase: 'qualifiers',
            teamAId: `Qualifier ${i + 1}`,
            teamBId: `Qualifier ${j + 1}`,
            tag: `qualifier_rr_r${r + 1}_m${m + 1}`,
            group: 'qualifier_rr',
          });
        }
        result.push({
          round: roundNum,
          phase: 'qualifiers',
          games,
          packetId: null,
          label: `Qualifier RR — Round ${r + 1}`,
        });
      }
      const bracket = bracketGameCount(bracketSize);
      for (let r = 0; r < bracket.rounds; r++) {
        roundNum++;
        const gamesInRound = nextPow2(bracketSize) / Math.pow(2, r + 1);
        const fromFinal = bracket.rounds - 1 - r;
        const games: ScheduleGame[] = [];
        for (let m = 0; m < gamesInRound; m++) {
          const tag = fromFinal === 0 ? 'final' : fromFinal === 1 ? `sf${m + 1}` : `qf${m + 1}`;
          games.push({
            id: `playoff_r${r}_m${m}`,
            round: roundNum,
            matchNumber: m + 1,
            phase: 'playoffs',
            teamAId: `Qualifier RR #${m * 2 + 1}`,
            teamBId: `Qualifier RR #${m * 2 + 2}`,
            tag,
          });
        }
        result.push({
          round: roundNum,
          phase: 'playoffs',
          games,
          packetId: null,
          label: bracketRoundLabel(r, bracket.rounds),
        });
      }
    } else {
      const bracket = bracketGameCount(effectiveTopN);
      for (let r = 0; r < bracket.rounds; r++) {
        roundNum++;
        const gamesInRound = nextPow2(effectiveTopN) / Math.pow(2, r + 1);
        const games: ScheduleGame[] = [];
        for (let m = 0; m < gamesInRound; m++) {
          games.push({
            id: `playoff_r${r}_m${m}`,
            round: roundNum,
            matchNumber: m + 1,
            phase: 'playoffs',
            teamAId: `Seed ${m * 2 + 1}`,
            teamBId: `Seed ${m * 2 + 2}`,
          });
        }
        result.push({
          round: roundNum,
          phase: 'playoffs',
          games,
          packetId: null,
          label: bracketRoundLabel(r, bracket.rounds),
        });
      }
    }
  }

  return result;
}
