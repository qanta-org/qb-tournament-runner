/**
 * Shared placeholder team ID constants and parser for tournament games.
 * Used by server (tournaments.ts) when building/resolving brackets and by
 * client (TournamentDashboard) for display labels.
 */

export const PLACEHOLDER_BYE = '__BYE__';

const PREFIX_SEED = '__SEED_';
const PREFIX_QUALIFIER = '__QUALIFIER_';
const PREFIX_QUALIFIER_RR = '__QUALIFIER_RR_';
const PREFIX_WINNER = '__WINNER_';
const SUFFIX = '__';

export function buildSeed(seedNum: number): string {
  return `${PREFIX_SEED}${seedNum}${SUFFIX}`;
}

export function buildBye(): string {
  return PLACEHOLDER_BYE;
}

export function buildWinner(tag: string): string {
  return `${PREFIX_WINNER}${tag.toUpperCase()}${SUFFIX}`;
}

export function buildQualifier(oneBasedIndex: number): string {
  return `${PREFIX_QUALIFIER}${oneBasedIndex}${SUFFIX}`;
}

export function buildQualifierRR(oneBasedSeedNum: number): string {
  return `${PREFIX_QUALIFIER_RR}${oneBasedSeedNum}${SUFFIX}`;
}

export type PlaceholderKind = 'seed' | 'qualifier' | 'qualifier_rr' | 'winner' | 'bye';

export interface ParsedPlaceholder {
  kind: PlaceholderKind;
  seedNum?: number;
  tag?: string;
}

export function isPlaceholder(teamId: string): boolean {
  return (
    teamId === PLACEHOLDER_BYE ||
    teamId.startsWith(PREFIX_SEED) ||
    teamId.startsWith(PREFIX_QUALIFIER_RR) ||
    teamId.startsWith(PREFIX_QUALIFIER) ||
    teamId.startsWith(PREFIX_WINNER)
  );
}

/**
 * Parse a placeholder team ID into kind and optional numeric/tag payload.
 * QUALIFIER and QUALIFIER_RR both have a numeric suffix; SEED has seed number; WINNER has tag.
 */
export function parsePlaceholder(teamId: string): ParsedPlaceholder | null {
  if (teamId === PLACEHOLDER_BYE) {
    return { kind: 'bye' };
  }
  const seedMatch = teamId.match(/^__SEED_(\d+)__$/);
  if (seedMatch) {
    return { kind: 'seed', seedNum: parseInt(seedMatch[1], 10) };
  }
  const qualifierRRMatch = teamId.match(/^__QUALIFIER_RR_(\d+)__$/);
  if (qualifierRRMatch) {
    return { kind: 'qualifier_rr', seedNum: parseInt(qualifierRRMatch[1], 10) };
  }
  const qualifierMatch = teamId.match(/^__QUALIFIER_(\d+)__$/);
  if (qualifierMatch) {
    return { kind: 'qualifier', seedNum: parseInt(qualifierMatch[1], 10) };
  }
  const winnerMatch = teamId.match(/^__WINNER_(.+)__$/);
  if (winnerMatch) {
    return { kind: 'winner', tag: winnerMatch[1] };
  }
  return null;
}

/** Default labels for common bracket tags (e.g. final, sf1, qf1) */
const DEFAULT_TAG_LABELS: Record<string, string> = {
  final: 'Final',
  sf1: 'Semifinal 1',
  sf2: 'Semifinal 2',
  qf1: 'Quarterfinal 1',
  qf2: 'Quarterfinal 2',
  qf3: 'Quarterfinal 3',
  qf4: 'Quarterfinal 4',
};

/**
 * Return a human-readable label for a placeholder team ID, for use in dashboard/UI.
 * Pass tagLabels to override or extend default bracket tag names.
 */
export function getPlaceholderDisplayLabel(
  teamId: string,
  tagLabels?: Record<string, string>
): string {
  const parsed = parsePlaceholder(teamId);
  if (!parsed) return teamId;
  const labels = tagLabels ? { ...DEFAULT_TAG_LABELS, ...tagLabels } : DEFAULT_TAG_LABELS;
  switch (parsed.kind) {
    case 'bye':
      return 'BYE';
    case 'seed':
      return `#${parsed.seedNum ?? '?'} Seed`;
    case 'qualifier':
      return `Qualifier ${parsed.seedNum ?? '?'}`;
    case 'qualifier_rr':
      return `Qualifier RR #${parsed.seedNum ?? '?'}`;
    case 'winner':
      if (parsed.tag) {
        const key = parsed.tag.toLowerCase();
        return `Winner ${labels[key] ?? parsed.tag}`;
      }
      return 'Winner TBD';
    default:
      return teamId;
  }
}
