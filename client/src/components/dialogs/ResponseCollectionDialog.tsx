import { useState } from 'react';
import { useGame } from '../../context/GameContext';
import type { Player } from '../../../../shared/types';

export function ResponseCollectionDialog() {
  const { gameState, gameConfig, submitBonusHumanResponse, getTeamColor } = useGame();
  const [responses, setResponses] = useState<Record<string, string>>({});

  if (!gameConfig || !gameState.bonusOwner) return null;

  const teamColor = getTeamColor(gameState.bonusOwner);
  const team =
    gameState.bonusOwner === 'team_a' ? gameConfig.team_a : gameConfig.team_b;
  const humanPlayers = team.players.filter((p) => p.type === 'human');

  const handleSubmit = () => {
    submitBonusHumanResponse(responses);
    setResponses({});
  };

  const handleResponseChange = (playerId: string, value: string) => {
    setResponses((prev) => ({
      ...prev,
      [playerId]: value,
    }));
  };

  const partNum = gameState.currentBonusPart + 1;
  const totalParts = gameState.bonusQuestion?.parts.length || 3;

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-fadeIn">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            Bonus Part {partNum} of {totalParts}
          </h2>
          <div
            className="inline-block px-3 py-1 rounded-full text-white text-sm"
            style={{ backgroundColor: teamColor }}
          >
            {team.name}'s Response
          </div>
        </div>

        {/* Instruction */}
        <p className="text-gray-600 mb-4 text-center">
          Enter initial responses from human players:
        </p>

        {/* Response inputs */}
        <div className="space-y-4 mb-6">
          {humanPlayers.map((player, index) => (
            <div key={player.player_id}>
              <label className="label">
                <span className="font-semibold" style={{ color: teamColor }}>
                  👤 {player.name}
                </span>
              </label>
              <input
                type="text"
                value={responses[player.player_id] || ''}
                onChange={(e) => handleResponseChange(player.player_id, e.target.value)}
                placeholder="Type their response..."
                className="input"
                autoFocus={index === 0}
              />
            </div>
          ))}

          {humanPlayers.length === 0 && (
            <p className="text-center text-gray-400 py-4">
              No human players on this team
            </p>
          )}
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          className="w-full btn btn-primary py-3 text-lg font-bold"
        >
          Continue to Final Answer
        </button>

        {/* Note */}
        <p className="text-center text-xs text-gray-400 mt-4">
          These responses will be compared with AI predictions
        </p>
      </div>
    </div>
  );
}
