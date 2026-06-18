import type { GameConfig, Team } from '../../../../shared/types';
import { buildGameConfig } from '../../utils/buildGameConfig';
import type { DatasetInfo } from '../../api/datasets';
import type { ApiRosterPlayer } from '../../api/rosters';

export const TRAILS_CON_PRESET_ID = 'trails-con' as const;
export type AutostartPresetId = typeof TRAILS_CON_PRESET_ID;

export function getAutostartPreset(): AutostartPresetId | null {
  const qp = new URLSearchParams(window.location.search);
  const fromQuery = qp.get('preset')?.trim().toLowerCase();
  if (fromQuery === TRAILS_CON_PRESET_ID) return TRAILS_CON_PRESET_ID;

  const fromEnv = String((import.meta as any).env?.VITE_AUTOSTART_PRESET ?? '')
    .trim()
    .toLowerCase();
  if (fromEnv === TRAILS_CON_PRESET_ID) return TRAILS_CON_PRESET_ID;

  return null;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

export function buildTrailsConGameConfig(params: {
  dataset: DatasetInfo;
  humans: ApiRosterPlayer[];
  ais: ApiRosterPlayer[];
}): GameConfig {
  const { dataset, humans, ais } = params;

  const packet =
    dataset.type === 'tournament'
      ? dataset.packets?.find((p) => p.id === 'packet_1') ?? dataset.packets?.[0]
      : null;

  const tossupFile = packet?.tossupFile ?? dataset.tossupFile ?? '';
  const bonusFile = packet?.bonusFile ?? dataset.bonusFile ?? '';
  const modelDir = dataset.responsesDir ?? '';

  if (!tossupFile) {
    throw new Error('Trails-Con dataset is missing tossup file path');
  }
  if (!modelDir) {
    throw new Error('Trails-Con dataset is missing responses directory path');
  }

  const findByName = (roster: ApiRosterPlayer[], name: string) =>
    roster.find((p) => normalizeName(p.name) === normalizeName(name));

  const alice = findByName(humans, 'Alice');
  const bob = findByName(humans, 'Bob');
  const charizard = findByName(ais, 'Charizard');
  const snorlax = findByName(ais, 'Snorlax');

  if (!alice) throw new Error('Could not find "Alice" in human roster');
  if (!bob) throw new Error('Could not find "Bob" in human roster');
  if (!charizard) throw new Error('Could not find "Charizard" in AI roster');
  if (!snorlax) throw new Error('Could not find "Snorlax" in AI roster');

  const teamA: Team = {
    name: 'Team A',
    players: [
      {
        player_id: alice.player_id,
        name: alice.name,
        type: 'human',
        extra_kwargs: { buzzer_key: alice.default_buzzer_key || 'A' },
      },
      {
        player_id: charizard.player_id,
        name: charizard.name,
        type: 'ai',
        extra_kwargs: {
          tossup_model: charizard.tossup_model || '',
          bonus_model: charizard.bonus_model || charizard.tossup_model || '',
        },
      },
    ],
  };

  const teamB: Team = {
    name: 'Team B',
    players: [
      {
        player_id: bob.player_id,
        name: bob.name,
        type: 'human',
        extra_kwargs: { buzzer_key: bob.default_buzzer_key || 'B' },
      },
      {
        player_id: snorlax.player_id,
        name: snorlax.name,
        type: 'ai',
        extra_kwargs: {
          tossup_model: snorlax.tossup_model || '',
          bonus_model: snorlax.bonus_model || snorlax.tossup_model || '',
        },
      },
    ],
  };

  // Validate that all required kwargs are present before building the config
  for (const p of [...teamA.players, ...teamB.players]) {
    if (p.type === 'ai') {
      const kwargs = p.extra_kwargs as { tossup_model: string; bonus_model: string };
      if (!kwargs.tossup_model) throw new Error(`AI player "${p.name}" is missing tossup_model`);
      if (!kwargs.bonus_model) throw new Error(`AI player "${p.name}" is missing bonus_model`);
    } else {
      const kwargs = p.extra_kwargs as { buzzer_key: string };
      if (!kwargs.buzzer_key) throw new Error(`Human player "${p.name}" is missing buzzer_key`);
    }
  }

  return buildGameConfig({
    teamA,
    teamB,
    tossupFile,
    bonusFile,
    modelDirectory: modelDir,
  });
}

