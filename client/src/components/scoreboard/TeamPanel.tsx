import { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { PlayerManagementDialog } from '../dialogs/PlayerManagementDialog';
import { maxAiTossupPoints } from '../../utils/aiScoring';
import { bonusConsultPoints } from '../../../../shared/scoring';
import type {
  Team,
  TeamId,
  Player,
  AIBuzzMode,
  AIWeightClass,
} from '../../../../shared/types';

interface TeamPanelProps {
  team: Team;
  teamId: TeamId;
  score: number;
  hasBuzzed: boolean;
  buzzingPlayer: string | null;
  aiBuzzModes: Record<string, AIBuzzMode>;
  aiAutonomousK: Record<string, number>;
}

const BUZZ_MODE_OPTIONS: { value: AIBuzzMode; label: string; title: string }[] = [
  { value: 'autonomous', label: 'Auto', title: 'Autonomous: buzzes on its own' },
  { value: 'semi', label: 'Semi', title: 'Semi-autonomous: a human buzzes for it via its key' },
  { value: 'muted', label: 'Mute', title: 'Muted: never buzzes' },
];

const WEIGHT_CLASS_BADGE: Record<AIWeightClass, { label: string; className: string }> = {
  lightweight: { label: 'LW', className: 'bg-green-100 text-green-700' },
  midweight: { label: 'MW', className: 'bg-amber-100 text-amber-700' },
  heavyweight: { label: 'HW', className: 'bg-red-100 text-red-700' },
};

export function TeamPanel({
  team,
  teamId,
  score,
  hasBuzzed,
  buzzingPlayer,
  aiBuzzModes,
  aiAutonomousK,
}: TeamPanelProps) {
  const { gameConfig, setAiBuzzMode, setAutonomousK, getTeamColor, canModifyPlayers } = useGame();
  const [showPlayerDialog, setShowPlayerDialog] = useState(false);

  const teamColor = getTeamColor(teamId);

  const humanPlayers = team.players.filter((p) => p.type === 'human');
  const aiPlayers = team.players.filter((p) => p.type === 'ai');

  const consultPoints = gameConfig ? bonusConsultPoints(gameConfig, team.players) : null;

  const getMode = (playerId: string): AIBuzzMode => aiBuzzModes[playerId] ?? 'autonomous';
  const getK = (playerId: string): number => Math.max(1, aiAutonomousK[playerId] ?? 1);

  const renderPlayer = (player: Player) => {
    const mode = player.type === 'ai' ? getMode(player.player_id) : 'autonomous';
    const isMuted = player.type === 'ai' && mode === 'muted';
    const isSemi = player.type === 'ai' && mode === 'semi';
    const isBuzzing = buzzingPlayer === player.player_id;
    const buzzerKey =
      player.type === 'human'
        ? (player.extra_kwargs as { buzzer_key: string }).buzzer_key
        : null;
    const weightClass =
      player.type === 'ai'
        ? (player.extra_kwargs as { weight_class?: AIWeightClass }).weight_class
        : undefined;
    const maxPoints =
      player.type === 'ai' && gameConfig ? maxAiTossupPoints(gameConfig, player) : null;

    return (
      <div
        key={player.player_id}
        className={`flex items-center gap-2 text-sm ${isBuzzing ? 'animate-shake' : ''}`}
      >
        {/* Player type icon */}
        <span>{player.type === 'human' ? '👤' : '🤖'}</span>

        {/* Buzzer key for humans */}
        {buzzerKey && (
          <span className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">
            {buzzerKey}
          </span>
        )}

        {/* Player name */}
        <span className={isMuted ? 'line-through text-gray-400' : ''}>
          {player.name}
        </span>

        {/* Weight class badge for AIs */}
        {weightClass && WEIGHT_CLASS_BADGE[weightClass] && (
          <span
            className={`px-1 py-0.5 rounded text-[10px] font-semibold ${WEIGHT_CLASS_BADGE[weightClass].className}`}
            title={`Weight class: ${weightClass}`}
          >
            {WEIGHT_CLASS_BADGE[weightClass].label}
          </span>
        )}

        {/* Max tossup points this AI can score */}
        {maxPoints !== null && (
          <span
            className="px-1 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700"
            title="Maximum tossup points this model can score"
          >
            {maxPoints} pts
          </span>
        )}

        {/* Mode indicators */}
        {isMuted && <span className="text-gray-400">🔇</span>}
        {isSemi && <span className="text-blue-400" title="Semi-autonomous">🎮</span>}

        {/* Buzzing indicator */}
        {isBuzzing && <span className="text-red-500">🚨</span>}
      </div>
    );
  };

  return (
    <div
      className="card p-4"
      style={{ borderTop: `4px solid ${teamColor}` }}
    >
      <div className="flex justify-between items-start mb-4">
        {/* Team name and roster */}
        <div>
          <h3
            className="text-lg font-bold mb-2"
            style={{ color: teamColor }}
          >
            {team.name}
          </h3>

          <div className="space-y-1">
            {humanPlayers.map(renderPlayer)}
            {aiPlayers.map(renderPlayer)}
          </div>

          {/* Per-team bonus consult cap (team aggregate, not per-agent) */}
          {aiPlayers.length > 0 && consultPoints !== null && (
            <div className="mt-1.5">
              <span
                className="px-1.5 py-0.5 rounded text-sm font-semibold bg-blue-100 text-blue-700"
                title="Points per bonus part if this team consults its AI"
              >
                Bonus consult: +{consultPoints} / part
              </span>
            </div>
          )}
        </div>

        {/* Score */}
        <div className="text-right">
          <div
            className="text-5xl font-bold"
            style={{ color: teamColor }}
          >
            {score}
          </div>
          {hasBuzzed && (
            <span className="text-xs text-gray-500">Buzzed</span>
          )}
        </div>
      </div>

      {/* Controls section */}
      <div className="border-t pt-3 mt-3 space-y-3">
        {/* Buzz-mode selector for AI players */}
        {aiPlayers.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">AI buzzing (toss-ups):</p>
            <div className="space-y-2">
              {aiPlayers.map((player) => {
                const mode = getMode(player.player_id);
                const k = getK(player.player_id);
                return (
                  <div key={player.player_id} className="flex items-center gap-2">
                    <span className="text-xs truncate flex-1" title={player.name}>
                      {player.name}
                    </span>

                    {/* Autonomous "buzz after k tokens" selector (only in Auto mode) */}
                    {mode === 'autonomous' && (
                      <div
                        className="flex items-center rounded-md overflow-hidden border border-gray-200"
                        title="Autonomous AI cannot buzz until the k-th token is revealed (k=1 means no gate)"
                      >
                        <button
                          onClick={() => setAutonomousK(player.player_id, k - 1)}
                          disabled={k <= 1}
                          aria-label={`Decrease k for ${player.name}`}
                          className="px-1.5 py-1 text-xs bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="px-1.5 py-1 text-xs font-mono bg-gray-50 text-gray-700">
                          k={k}
                        </span>
                        <button
                          onClick={() => setAutonomousK(player.player_id, k + 1)}
                          aria-label={`Increase k for ${player.name}`}
                          className="px-1.5 py-1 text-xs bg-white text-gray-600 hover:bg-gray-100"
                        >
                          +
                        </button>
                      </div>
                    )}

                    <div className="flex rounded-md overflow-hidden border border-gray-200">
                      {BUZZ_MODE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setAiBuzzMode(player.player_id, opt.value)}
                          title={opt.title}
                          className={`px-2 py-1 text-xs transition-colors ${
                            mode === opt.value
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Player management button */}
        <button
          onClick={() => setShowPlayerDialog(true)}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            canModifyPlayers()
              ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              : 'bg-gray-100 text-gray-400'
          }`}
          title={canModifyPlayers() ? 'Add or remove human players' : 'Available at start of tossup'}
        >
          👥 Manage Players {canModifyPlayers() && '•'}
        </button>
      </div>

      {/* Player management dialog */}
      {showPlayerDialog && (
        <PlayerManagementDialog
          teamId={teamId}
          onClose={() => setShowPlayerDialog(false)}
        />
      )}
    </div>
  );
}
