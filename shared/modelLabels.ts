import type { AIPlayerKwargs, ModelRosterEntry, Player, TeamId } from './types';

/** Human-readable label for an AI player's tossup model. */
export function tossupModelLabel(kwargs: Partial<AIPlayerKwargs>): string {
  return kwargs.tossup_model_name || kwargs.tossup_model || '';
}

/** Human-readable label for an AI player's bonus model. */
export function bonusModelLabel(kwargs: Partial<AIPlayerKwargs>): string {
  return kwargs.bonus_model_name || kwargs.bonus_model || '';
}

/** Compact summary for setup/review surfaces (shows both names when decoupled). */
export function aiModelSummary(kwargs: Partial<AIPlayerKwargs>): string {
  const tossup = tossupModelLabel(kwargs);
  const bonus = bonusModelLabel(kwargs);
  if (bonus && bonus !== tossup) return `T: ${tossup} · B: ${bonus}`;
  return tossup;
}

/** Look up a roster entry's display name for a response-file key. */
export function rosterLabelForModel(
  modelKey: string,
  roster: ModelRosterEntry[]
): string | undefined {
  return roster.find((e) => e.model === modelKey)?.name;
}

/**
 * Find AI players on a team whose tossup model matches a response system key.
 * Supports multiple teammates sharing the same model file.
 */
export function aiPlayersForTossupSystem(
  team: { players: Player[] },
  systemKey: string
): Player[] {
  return team.players.filter((p) => {
    if (p.type !== 'ai') return false;
    return (p.extra_kwargs as AIPlayerKwargs).tossup_model === systemKey;
  });
}

/**
 * Find AI players on a team whose bonus model matches a response system key.
 */
export function aiPlayersForBonusSystem(
  team: { players: Player[] },
  systemKey: string
): Player[] {
  return team.players.filter((p) => {
    if (p.type !== 'ai') return false;
    return (p.extra_kwargs as AIPlayerKwargs).bonus_model === systemKey;
  });
}

/** Best display label for a tossup response system on a given team. */
export function tossupSystemLabel(
  systemKey: string,
  team: { players: Player[] }
): string {
  const players = aiPlayersForTossupSystem(team, systemKey);
  if (players.length > 0) {
    return tossupModelLabel(players[0]!.extra_kwargs as AIPlayerKwargs);
  }
  return systemKey;
}

/** Best display label for a bonus response system on a given team. */
export function bonusSystemLabel(
  systemKey: string,
  team: { players: Player[] }
): string {
  const players = aiPlayersForBonusSystem(team, systemKey);
  if (players.length > 0) {
    return bonusModelLabel(players[0]!.extra_kwargs as AIPlayerKwargs);
  }
  return systemKey;
}

/** Resolve tossup system label across both teams in a game config. */
export function tossupSystemLabelInGame(
  systemKey: string,
  teamA: { players: Player[] },
  teamB: { players: Player[] }
): string {
  return (
    tossupSystemLabel(systemKey, teamA) !== systemKey
      ? tossupSystemLabel(systemKey, teamA)
      : tossupSystemLabel(systemKey, teamB)
  );
}

/** Resolve bonus system label for the owning team. */
export function bonusSystemLabelForOwner(
  systemKey: string,
  bonusOwner: TeamId,
  teamA: { players: Player[] },
  teamB: { players: Player[] }
): string {
  const team = bonusOwner === 'team_a' ? teamA : teamB;
  return bonusSystemLabel(systemKey, team);
}
