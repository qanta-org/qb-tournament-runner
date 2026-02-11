import { useState } from 'react';
import { useGame } from '../../context/GameContext';

interface AdjustPointsDialogProps {
  onClose: () => void;
}

export function AdjustPointsDialog({ onClose }: AdjustPointsDialogProps) {
  const { gameConfig, gameState, adjustPoints, getTeamColor } = useGame();
  const [teamADelta, setTeamADelta] = useState(0);
  const [teamBDelta, setTeamBDelta] = useState(0);

  if (!gameConfig) return null;

  const handleSubmit = () => {
    if (teamADelta !== 0 || teamBDelta !== 0) {
      adjustPoints({ team_a: teamADelta, team_b: teamBDelta });
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-fadeIn" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">Adjust Team Points</h2>
          <p className="text-gray-600">Enter positive or negative values</p>
        </div>

        {/* Team A adjustment */}
        <div className="mb-4">
          <label className="label">
            <span style={{ color: getTeamColor('team_a') }} className="font-bold">
              {gameConfig.team_a.name}
            </span>{' '}
            <span className="text-gray-500">(Current: {gameState.scores.team_a})</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTeamADelta((d) => d - 5)}
              className="btn btn-secondary"
            >
              -5
            </button>
            <input
              type="number"
              value={teamADelta}
              onChange={(e) => setTeamADelta(parseInt(e.target.value) || 0)}
              className="input text-center text-lg font-bold flex-1"
            />
            <button
              onClick={() => setTeamADelta((d) => d + 5)}
              className="btn btn-secondary"
            >
              +5
            </button>
          </div>
          {teamADelta !== 0 && (
            <p className="text-sm mt-1 text-gray-500">
              New score: {gameState.scores.team_a + teamADelta}
            </p>
          )}
        </div>

        {/* Team B adjustment */}
        <div className="mb-6">
          <label className="label">
            <span style={{ color: getTeamColor('team_b') }} className="font-bold">
              {gameConfig.team_b.name}
            </span>{' '}
            <span className="text-gray-500">(Current: {gameState.scores.team_b})</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTeamBDelta((d) => d - 5)}
              className="btn btn-secondary"
            >
              -5
            </button>
            <input
              type="number"
              value={teamBDelta}
              onChange={(e) => setTeamBDelta(parseInt(e.target.value) || 0)}
              className="input text-center text-lg font-bold flex-1"
            />
            <button
              onClick={() => setTeamBDelta((d) => d + 5)}
              className="btn btn-secondary"
            >
              +5
            </button>
          </div>
          {teamBDelta !== 0 && (
            <p className="text-sm mt-1 text-gray-500">
              New score: {gameState.scores.team_b + teamBDelta}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 btn btn-secondary py-3">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 btn btn-primary py-3"
            disabled={teamADelta === 0 && teamBDelta === 0}
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
