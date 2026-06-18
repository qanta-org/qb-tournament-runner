import { useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { getAutostartPreset, TRAILS_CON_PRESET_ID, buildTrailsConGameConfig } from './presets/trailsCon';
import type { DatasetInfo } from '../api/datasets';
import type { RosterResponse } from '../api/rosters';

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

  // Auto-start the Trails-Con preset game once we are the moderator in setup phase
  useEffect(() => {
    const preset = getAutostartPreset();
    if (preset !== TRAILS_CON_PRESET_ID) return;
    if (!isConnected) return;
    if (clientRole !== 'moderator') return;
    if (!roomCode) return;
    if (gameState.phase !== 'setup') return;
    if (gameConfig) return;
    if (autostartStartedGameRef.current) return;

    autostartStartedGameRef.current = true;

    (async () => {
      try {
        const dataset = await fetchJson<DatasetInfo>('/api/datasets/trails-con');
        const [humanRes, aiRes] = await Promise.all([
          fetchJson<RosterResponse>('/api/rosters/human?dataset=trails-con'),
          fetchJson<RosterResponse>('/api/rosters/ai?dataset=trails-con'),
        ]);

        const config = buildTrailsConGameConfig({
          dataset,
          humans: humanRes.players ?? [],
          ais: aiRes.players ?? [],
        });

        startGame(config);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Dev-only helper: log to console so failures are visible during iteration.
        // We deliberately don't surface this through GameContext error UI.
        // eslint-disable-next-line no-console
        console.error('Trails-Con autostart failed:', msg);
      }
    })();
  }, [isConnected, clientRole, roomCode, gameState.phase, gameConfig, startGame]);

  return null;
}

