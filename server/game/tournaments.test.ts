import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateBracket,
  seedForSlot,
  getGameTag,
  nextPow2,
  tournamentManager,
} from './tournaments.js';
import { generateRoundRobinRounds, generateRoundRobinRoundsPass2 } from '../../shared/schedule-utils.js';
import type {
  CreateTournamentParams,
  PacketInfo,
  TournamentTeam,
  TournamentFormat,
} from '../../shared/types.js';
import { buildWinner, buildQualifierRR } from '../../shared/tournament-placeholders.js';

function makeFormat(
  opts: {
    prelim: 'none' | 'full_rr' | 'double_rr' | 'grouped_rr';
    playoffs: 'none' | 'single_elim';
    qualifierRR?: boolean;
  }
): TournamentFormat {
  return {
    prelim: opts.prelim,
    qualifiers: opts.qualifierRR ? { kind: 'rr' } : { kind: 'none' },
    playoffs: opts.playoffs,
  };
}

// ============================================================================
// nextPow2
// ============================================================================

describe('nextPow2', () => {
  it('returns 1 for n=0', () => {
    expect(nextPow2(0)).toBe(1);
  });
  it('returns 1 for n=1', () => {
    expect(nextPow2(1)).toBe(1);
  });
  it('returns 2 for n=2', () => {
    expect(nextPow2(2)).toBe(2);
  });
  it('returns 4 for n=3,4', () => {
    expect(nextPow2(3)).toBe(4);
    expect(nextPow2(4)).toBe(4);
  });
  it('returns 8 for n=5..8', () => {
    expect(nextPow2(5)).toBe(8);
    expect(nextPow2(8)).toBe(8);
  });
});

// ============================================================================
// seedForSlot
// ============================================================================

describe('seedForSlot', () => {
  it('maps slots for 2 teams: 0->1, 1->2', () => {
    expect(seedForSlot(0, 2)).toBe(1);
    expect(seedForSlot(1, 2)).toBe(2);
  });
  it('standard bracket seeding for 4 slots: 1v4, 2v3', () => {
    expect(seedForSlot(0, 4)).toBe(1);
    expect(seedForSlot(1, 4)).toBe(4);
    expect(seedForSlot(2, 4)).toBe(2);
    expect(seedForSlot(3, 4)).toBe(3);
  });
  it('standard bracket seeding for 8 slots', () => {
    expect(seedForSlot(0, 8)).toBe(1);
    expect(seedForSlot(1, 8)).toBe(8);
    expect(seedForSlot(3, 8)).toBe(5);
  });
});

// ============================================================================
// getGameTag
// ============================================================================

describe('getGameTag', () => {
  it('returns final for last round', () => {
    expect(getGameTag(2, 1, 0)).toBe('final');
  });
  it('returns sf1, sf2 for semifinals', () => {
    expect(getGameTag(2, 0, 0)).toBe('sf1');
    expect(getGameTag(2, 0, 1)).toBe('sf2');
  });
  it('returns qf1..qf4 for quarterfinals', () => {
    expect(getGameTag(3, 0, 0)).toBe('qf1');
    expect(getGameTag(3, 0, 3)).toBe('qf4');
  });
});

// ============================================================================
// generateBracket
// ============================================================================

describe('generateBracket', () => {
  function assertValidBracket(games: ReturnType<typeof generateBracket>, numTeams: number) {
    const slots = nextPow2(numTeams);
    const expectedRounds = Math.log2(slots);
    let expectedGames = 0;
    for (let r = 0; r < expectedRounds; r++) {
      expectedGames += slots / Math.pow(2, r + 1);
    }
    expect(games.length).toBe(expectedGames);

    const gameIds = new Set(games.map((g) => g.id));
    const tags = new Set(games.map((g) => g.tag).filter(Boolean));

    for (const g of games) {
      expect(g.id).toBeTruthy();
      expect(g.phase).toBe('playoffs');
      expect(g.teamAId).toBeTruthy();
      expect(g.teamBId).toBeTruthy();

      if (g.dependsOn && g.dependsOn.length > 0) {
        for (const depId of g.dependsOn) {
          expect(gameIds.has(depId)).toBe(true);
        }
      }

      const winnerPlaceholder = g.tag ? buildWinner(g.tag) : null;
      if (winnerPlaceholder) {
        const refs = games.filter(
          (x) => x.teamAId === winnerPlaceholder || x.teamBId === winnerPlaceholder
        );
        if (g.round > 1) {
          expect(refs.length).toBeGreaterThanOrEqual(0);
        }
      }
    }

    const firstRound = games.filter((g) => g.round === 1);
    const byes = slots - numTeams;
    if (byes > 0) {
      const byeCount = firstRound.filter(
        (g) => g.teamAId === '__BYE__' || g.teamBId === '__BYE__'
      ).length;
      expect(byeCount).toBe(byes);
    }
  }

  it('n=2: 1 final', () => {
    const games = generateBracket(2);
    expect(games.length).toBe(1);
    expect(games[0].tag).toBe('final');
    expect(games[0].teamAId).toMatch(/__SEED_1__/);
    expect(games[0].teamBId).toMatch(/__SEED_2__/);
    assertValidBracket(games, 2);
  });

  it('n=3: 3 games (2 first-round with 1 bye, 1 final)', () => {
    const games = generateBracket(3);
    expect(games.length).toBe(3);
    const firstRound = games.filter((g) => g.round === 1);
    expect(firstRound.length).toBe(2);
    const hasBye = firstRound.some((g) => g.teamAId === '__BYE__' || g.teamBId === '__BYE__');
    expect(hasBye).toBe(true);
    assertValidBracket(games, 3);
  });

  it('n=4: sf1, sf2, final (3 games)', () => {
    const games = generateBracket(4);
    expect(games.length).toBe(3);
    const tags = games.map((g) => g.tag).filter(Boolean);
    expect(tags).toContain('sf1');
    expect(tags).toContain('sf2');
    expect(tags).toContain('final');
    assertValidBracket(games, 4);
  });

  it('n=5,6,7,8: correct game count and structure', () => {
    for (const n of [5, 6, 7, 8]) {
      const games = generateBracket(n);
      assertValidBracket(games, n);
    }
  });

  it('no orphaned __WINNER_*__ references', () => {
    const games = generateBracket(4);
    const winnerPlaceholders = new Set<string>();
    for (const g of games) {
      const ma = g.teamAId.match(/^__WINNER_(.+)__$/);
      const mb = g.teamBId.match(/^__WINNER_(.+)__$/);
      if (ma) winnerPlaceholders.add(ma[1]);
      if (mb) winnerPlaceholders.add(mb[1]);
    }
    const allTags = new Set(games.map((g) => g.tag?.toUpperCase()).filter(Boolean));
    for (const ph of winnerPlaceholders) {
      expect(allTags.has(ph)).toBe(true);
    }
  });
});

// ============================================================================
// generateRoundRobinRounds
// ============================================================================

describe('generateRoundRobinRounds', () => {
  it('n=2: 1 round, 1 game', () => {
    const rounds = generateRoundRobinRounds(2);
    expect(rounds.length).toBe(1);
    expect(rounds[0].length).toBe(1);
    expect(rounds[0][0]).toEqual([0, 1]);
  });
  it('n=3: 3 rounds, 1 game per round (odd)', () => {
    const rounds = generateRoundRobinRounds(3);
    expect(rounds.length).toBe(3);
    for (const r of rounds) {
      expect(r.length).toBe(1);
    }
  });
  it('n=4: 3 rounds, 2 games per round', () => {
    const rounds = generateRoundRobinRounds(4);
    expect(rounds.length).toBe(3);
    for (const r of rounds) {
      expect(r.length).toBe(2);
    }
    const allPairs = new Set<string>();
    for (const r of rounds) {
      for (const [a, b] of r) {
        allPairs.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
      }
    }
    expect(allPairs.size).toBe(6);
  });
});

// ============================================================================
// createTournament integration
// ============================================================================

function makePacket(id: string): PacketInfo {
  return {
    id,
    name: `Packet ${id}`,
    tossupFile: `/path/${id}/tossups.csv`,
    bonusFile: `/path/${id}/bonuses.csv`,
  };
}

function makeTeam(id: string, name?: string): TournamentTeam {
  return {
    id,
    name: name ?? id,
    humanPlayers: [],
    aiPlayers: [],
  };
}

describe('createTournament', () => {
  beforeEach(() => {
    tournamentManager.tournaments.clear();
  });

  it('2 teams + playoffs = 1 final', () => {
    const params: CreateTournamentParams = {
      name: 'Test',
      format: makeFormat({ prelim: 'none', playoffs: 'single_elim' }),
      datasetId: 'ds1',
      teams: [makeTeam('t1'), makeTeam('t2')],
      packets: [makePacket('p1')],
      modelDirectory: '/models',
      gameSettings: {},
      playoffBracketSize: 2,
    };
    const t = tournamentManager.createTournament(params, 'user1');
    expect(t.games.length).toBe(1);
    expect(t.games[0].tag).toBe('final');
    expect(t.games[0].phase).toBe('playoffs');
  });

  it('4 teams + grouped (2x2) + top 1 = 1 final', () => {
    const params: CreateTournamentParams = {
      name: 'Test',
      format: makeFormat({ prelim: 'grouped_rr', playoffs: 'single_elim' }),
      datasetId: 'ds1',
      teams: [
        makeTeam('t1'),
        makeTeam('t2'),
        makeTeam('t3'),
        makeTeam('t4'),
      ],
      packets: [
        makePacket('p1'),
        makePacket('p2'),
        makePacket('p3'),
      ],
      modelDirectory: '/models',
      gameSettings: {},
      groupAssignments: { A: ['t1', 't2'], B: ['t3', 't4'] },
      advancePerGroup: 1,
      playoffBracketSize: 2,
    };
    const t = tournamentManager.createTournament(params, 'user1');
    const playoffGames = t.games.filter((g) => g.phase === 'playoffs');
    expect(playoffGames.length).toBe(1);
    expect(playoffGames[0].tag).toBe('final');
  });

  it('6 teams + grouped (3x2) + top 1 = 3 qualifiers, playoffBracketSize=2 → 1 final', () => {
    const params: CreateTournamentParams = {
      name: 'Test',
      format: makeFormat({ prelim: 'grouped_rr', playoffs: 'single_elim' }),
      datasetId: 'ds1',
      teams: Array.from({ length: 6 }, (_, i) => makeTeam(`t${i + 1}`)),
      packets: Array.from({ length: 6 }, (_, i) => makePacket(`p${i + 1}`)),
      modelDirectory: '/models',
      gameSettings: {},
      groupAssignments: { A: ['t1', 't2'], B: ['t3', 't4'], C: ['t5', 't6'] },
      advancePerGroup: 1,
      playoffBracketSize: 2,
    };
    const t = tournamentManager.createTournament(params, 'user1');
    const playoffGames = t.games.filter((g) => g.phase === 'playoffs');
    expect(playoffGames.length).toBe(1);
    expect(playoffGames[0].tag).toBe('final');
    expect(t.topNForPlayoffs).toBe(2);
  });

  it('6 teams + grouped (3x2) + 3 qualifiers, playoffBracketSize=4 invalid → uses 2', () => {
    const params: CreateTournamentParams = {
      name: 'Test',
      format: makeFormat({ prelim: 'grouped_rr', playoffs: 'single_elim' }),
      datasetId: 'ds1',
      teams: Array.from({ length: 6 }, (_, i) => makeTeam(`t${i + 1}`)),
      packets: Array.from({ length: 6 }, (_, i) => makePacket(`p${i + 1}`)),
      modelDirectory: '/models',
      gameSettings: {},
      groupAssignments: { A: ['t1', 't2'], B: ['t3', 't4'], C: ['t5', 't6'] },
      advancePerGroup: 1,
      playoffBracketSize: 4,
    };
    const t = tournamentManager.createTournament(params, 'user1');
    const playoffGames = t.games.filter((g) => g.phase === 'playoffs');
    expect(playoffGames.length).toBe(1);
    expect(playoffGames[0].tag).toBe('final');
    expect(t.topNForPlayoffs).toBe(2);
  });

  it('8 teams + non-grouped + playoffBracketSize=4 → top 4 to semi+final', () => {
    const params: CreateTournamentParams = {
      name: 'Test',
      format: makeFormat({ prelim: 'full_rr', playoffs: 'single_elim' }),
      datasetId: 'ds1',
      teams: Array.from({ length: 8 }, (_, i) => makeTeam(`t${i + 1}`)),
      packets: Array.from({ length: 10 }, (_, i) => makePacket(`p${i + 1}`)),
      modelDirectory: '/models',
      gameSettings: {},
      playoffBracketSize: 4,
    };
    const t = tournamentManager.createTournament(params, 'user1');
    const playoffGames = t.games.filter((g) => g.phase === 'playoffs');
    expect(playoffGames.length).toBe(3);
    expect(t.topNForPlayoffs).toBe(4);
    const tags = playoffGames.map((g) => g.tag).filter(Boolean);
    expect(tags).toContain('sf1');
    expect(tags).toContain('sf2');
    expect(tags).toContain('final');
  });

  it('6 teams + non-grouped + playoffBracketSize=8 → clamps to 4', () => {
    const params: CreateTournamentParams = {
      name: 'Test',
      format: makeFormat({ prelim: 'full_rr', playoffs: 'single_elim' }),
      datasetId: 'ds1',
      teams: Array.from({ length: 6 }, (_, i) => makeTeam(`t${i + 1}`)),
      packets: Array.from({ length: 10 }, (_, i) => makePacket(`p${i + 1}`)),
      modelDirectory: '/models',
      gameSettings: {},
      playoffBracketSize: 8,
    };
    const t = tournamentManager.createTournament(params, 'user1');
    expect(t.topNForPlayoffs).toBe(4);
    const playoffGames = t.games.filter((g) => g.phase === 'playoffs');
    expect(playoffGames.length).toBe(3);
  });

  it('6 teams + grouped (3x2) + top 1 + qualifier RR = 3 RR games + 1 final', () => {
    const params: CreateTournamentParams = {
      name: 'Test',
      format: makeFormat({ prelim: 'grouped_rr', playoffs: 'single_elim', qualifierRR: true }),
      datasetId: 'ds1',
      teams: Array.from({ length: 6 }, (_, i) => makeTeam(`t${i + 1}`)),
      packets: Array.from({ length: 10 }, (_, i) => makePacket(`p${i + 1}`)),
      modelDirectory: '/models',
      gameSettings: {},
      groupAssignments: { A: ['t1', 't2'], B: ['t3', 't4'], C: ['t5', 't6'] },
      advancePerGroup: 1,
    };
    const t = tournamentManager.createTournament(params, 'user1');
    const qualifierRR = t.games.filter((g) => g.phase === 'qualifiers' && g.group === 'qualifier_rr');
    const finalGames = t.games.filter((g) => g.tag === 'final');
    expect(qualifierRR.length).toBe(3);
    expect(finalGames.length).toBe(1);
    expect(finalGames[0].teamAId).toBe(buildQualifierRR(1));
    expect(finalGames[0].teamBId).toBe(buildQualifierRR(2));
    expect(finalGames[0].dependsOn?.length).toBe(3);
  });

  it('8 teams + grouped (4x2) + top 2 + qualifier RR + playoffBracketSize=4 = 6 RR games + 3 bracket games', () => {
    const params: CreateTournamentParams = {
      name: 'Test',
      format: makeFormat({ prelim: 'grouped_rr', playoffs: 'single_elim', qualifierRR: true }),
      datasetId: 'ds1',
      teams: Array.from({ length: 8 }, (_, i) => makeTeam(`t${i + 1}`)),
      packets: Array.from({ length: 15 }, (_, i) => makePacket(`p${i + 1}`)),
      modelDirectory: '/models',
      gameSettings: {},
      groupAssignments: { A: ['t1', 't2'], B: ['t3', 't4'], C: ['t5', 't6'], D: ['t7', 't8'] },
      advancePerGroup: 2,
      playoffBracketSize: 4,
    };
    const t = tournamentManager.createTournament(params, 'user1');
    const qualifierRR = t.games.filter((g) => g.phase === 'qualifiers' && g.group === 'qualifier_rr');
    const bracketGames = t.games.filter((g) => g.phase === 'playoffs' && g.group !== 'qualifier_rr');
    expect(qualifierRR.length).toBe(28);
    expect(bracketGames.length).toBe(3);
    expect(t.playoffBracketSize).toBe(4);
    const tags = bracketGames.map((g) => g.tag).filter(Boolean);
    expect(tags).toContain('sf1');
    expect(tags).toContain('sf2');
    expect(tags).toContain('final');
  });
});
