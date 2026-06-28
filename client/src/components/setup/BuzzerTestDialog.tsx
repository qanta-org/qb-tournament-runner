import { useEffect, useMemo, useState } from 'react';
import type { GameConfig } from '../../../../shared/types';

export interface BuzzerTestPlayer {
  player_id: string;
  name: string;
  teamColor: string;
  buzzer_key: string;
}

interface BuzzerTestDialogProps {
  humanPlayers: BuzzerTestPlayer[];
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Pre-game buzzer test. Each human player must press their assigned key once to be
 * verified. The game can only start once all are verified, with a moderator skip override.
 */
export function BuzzerTestDialog({ humanPlayers, onConfirm, onCancel }: BuzzerTestDialogProps) {
  const [verified, setVerified] = useState<Set<string>>(new Set());

  // Map of uppercased buzzer key -> player_id for fast lookup
  const keyMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of humanPlayers) {
      if (p.buzzer_key) map[p.buzzer_key.toUpperCase()] = p.player_id;
    }
    return map;
  }, [humanPlayers]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const playerId = keyMap[e.key.toUpperCase()];
      if (playerId) {
        e.preventDefault();
        setVerified((prev) => {
          if (prev.has(playerId)) return prev;
          const next = new Set(prev);
          next.add(playerId);
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyMap]);

  const allVerified = humanPlayers.every((p) => verified.has(p.player_id));

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-fadeIn max-w-md">
        <div className="mb-4">
          <h2 className="text-lg font-bold">🔔 Buzzer Test</h2>
          <p className="text-sm text-gray-500 mt-1">
            Each player presses their buzzer key once to verify it works. The game starts when
            everyone is verified.
          </p>
        </div>

        {humanPlayers.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">
            No human players to verify.
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {humanPlayers.map((player) => {
              const isVerified = verified.has(player.player_id);
              return (
                <div
                  key={player.player_id}
                  className={`flex items-center justify-between rounded-lg p-3 border transition-colors ${
                    isVerified ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-xs font-mono text-white"
                      style={{ backgroundColor: player.teamColor }}
                    >
                      {player.buzzer_key}
                    </span>
                    <span className="font-medium">{player.name}</span>
                  </div>
                  <span className={isVerified ? 'text-green-600 font-medium' : 'text-gray-400'}>
                    {isVerified ? '✓ Verified' : '○ Press key'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t">
          <button onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {humanPlayers.length > 0 && (
              <button
                onClick={() => setVerified(new Set())}
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1"
              >
                Reset
              </button>
            )}
            <button onClick={onConfirm} className="btn btn-secondary" title="Bypass the buzzer test">
              Skip test &amp; start
            </button>
            <button
              onClick={onConfirm}
              disabled={!allVerified}
              className="btn btn-success disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🎮 Start Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Derive the human-player list a BuzzerTestDialog needs from a built GameConfig. */
export function humanPlayersFromConfig(
  config: GameConfig,
  colorTeamA: string,
  colorTeamB: string
): BuzzerTestPlayer[] {
  const fromTeam = (
    players: GameConfig['team_a']['players'],
    teamColor: string
  ): BuzzerTestPlayer[] =>
    players
      .filter((p) => p.type === 'human')
      .map((p) => ({
        player_id: p.player_id,
        name: p.name,
        teamColor,
        buzzer_key: (p.extra_kwargs as { buzzer_key: string }).buzzer_key,
      }));

  return [
    ...fromTeam(config.team_a.players, colorTeamA),
    ...fromTeam(config.team_b.players, colorTeamB),
  ];
}
