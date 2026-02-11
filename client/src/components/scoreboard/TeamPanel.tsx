import { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { PlayerManagementDialog } from '../dialogs/PlayerManagementDialog';
import type { Team, TeamId, Player } from '../../../../shared/types';

interface TeamPanelProps {
  team: Team;
  teamId: TeamId;
  score: number;
  hasBuzzed: boolean;
  buzzingPlayer: string | null;
  mutedPlayers: string[];
}

export function TeamPanel({
  team,
  teamId,
  score,
  hasBuzzed,
  buzzingPlayer,
  mutedPlayers,
}: TeamPanelProps) {
  const { toggleMute, getTeamColor, canModifyPlayers } = useGame();
  const [showPlayerDialog, setShowPlayerDialog] = useState(false);

  const teamColor = getTeamColor(teamId);
  const isTeamA = teamId === 'team_a';

  const humanPlayers = team.players.filter((p) => p.type === 'human');
  const aiPlayers = team.players.filter((p) => p.type === 'ai');

  const renderPlayer = (player: Player) => {
    const isMuted = mutedPlayers.includes(player.player_id);
    const isBuzzing = buzzingPlayer === player.player_id;
    const buzzerKey = player.type === 'human' 
      ? (player.extra_kwargs as { buzzer_key: string }).buzzer_key 
      : null;

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

        {/* Mute indicator */}
        {isMuted && <span className="text-gray-400">🔇</span>}

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
        {/* Mute buttons for AI players */}
        {aiPlayers.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Mute during Toss-ups:</p>
            <div className="flex flex-wrap gap-2">
              {aiPlayers.map((player) => {
                const isMuted = mutedPlayers.includes(player.player_id);
                return (
                  <button
                    key={player.player_id}
                    onClick={() => toggleMute(player.player_id)}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      isMuted
                        ? 'bg-gray-200 text-gray-500'
                        : 'bg-red-50 text-red-600 hover:bg-red-100'
                    }`}
                  >
                    {isMuted ? '🔇' : '🤫'} {player.name}
                  </button>
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
