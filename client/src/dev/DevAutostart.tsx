import { useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { getAutostartPreset, buildAutostartGameConfig } from './presets/trailsCon';
import { fetchRulePreset } from '../api/config';
import type { DatasetInfo } from '../api/datasets';
import type { RosterResponse } from '../api/rosters';
import type { GameConfig } from '../../../shared/types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}) for ${url}${text ? `: ${text}` : ''}`);
  }
  return (await res.json()) as T;
}

export default function DevAutostart() {
  const {
    isConnected,
    clientRole,
    roomCode,
    gameState,
    gameConfig,
    createRoom,
    startGame,
  } = useGame();

  const autostartRequestedRoomRef = useRef(false);
  const autostartStartedGameRef = useRef(false);

  // Auto-create room for preset runs (moderator)
  useEffect(() => {
    const preset = getAutostartPreset();
    if (!preset) return;
    if (!isConnected) return;
    if (roomCode || clientRole) return;
    if (autostartRequestedRoomRef.current) return;

    autostartRequestedRoomRef.current = true;
    createRoom();
  }, [isConnected, roomCode, clientRole, createRoom]);

  // Auto-start the preset game once we are the moderator in setup phase
  useEffect(() => {
    const preset = getAutostartPreset();
    if (!preset) return;
    if (!isConnected) return;
    if (clientRole !== 'moderator') return;
    if (!roomCode) return;
    if (gameState.phase !== 'setup') return;
    if (gameConfig) return;
    if (autostartStartedGameRef.current) return;

    autostartStartedGameRef.current = true;

    (async () => {
      try {
        const datasetId = encodeURIComponent(preset);
        const dataset = await fetchJson<DatasetInfo>(`/api/datasets/${datasetId}`);
        const [humanRes, aiRes] = await Promise.all([
          fetchJson<RosterResponse>(`/api/rosters/human?dataset=${datasetId}`),
          fetchJson<RosterResponse>(`/api/rosters/ai?dataset=${datasetId}`),
        ]);

        // Apply a rule preset whose id matches the autostart preset (e.g. `qanta26`),
        // so dev runs exercise the configured deflation modes. Missing presets are ignored.
        let overrides: Partial<GameConfig> | undefined;
        try {
          const rulePreset = await fetchRulePreset(preset);
          overrides = rulePreset.config;
          // eslint-disable-next-line no-console
          console.info(`Autostart (${preset}) applied rule preset "${rulePreset.name}"`, overrides);
        } catch {
          // No matching rule preset; fall back to DEFAULT_GAME_CONFIG values.
        }

        const config = buildAutostartGameConfig({
          dataset,
          humans: humanRes.players ?? [],
          ais: aiRes.players ?? [],
          label: preset,
          overrides,
        });

        startGame(config);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Dev-only helper: log to console so failures are visible during iteration.
        // We deliberately don't surface this through GameContext error UI.
        // eslint-disable-next-line no-console
        console.error(`Autostart (${preset}) failed:`, msg);
      }
    })();
  }, [isConnected, clientRole, roomCode, gameState.phase, gameConfig, startGame]);

  return null;
}

