import { useGame } from '../../context/GameContext';
import type { AIPlayerKwargs, TossupResponse } from '../../../../shared/types';
import {
  aiPlayersForTossupSystem,
  tossupSystemLabelInGame,
} from '../../../../shared/modelLabels';

interface GuessTableProps {
  guesses: TossupResponse[];
}

export function GuessTable({ guesses }: GuessTableProps) {
  const { gameConfig, getTeamColor } = useGame();

  if (!gameConfig || guesses.length === 0) {
    return (
      <div className="text-center text-gray-400 py-4">
        No guesses yet
      </div>
    );
  }

  // Map tossup response system keys to players on each team.
  const getTeamPlayers = (systemName: string, teamId: 'team_a' | 'team_b') => {
    const team = teamId === 'team_a' ? gameConfig.team_a : gameConfig.team_b;
    return aiPlayersForTossupSystem(team, systemName);
  };

  const modelLabel = (systemName: string) =>
    tossupSystemLabelInGame(systemName, gameConfig.team_a, gameConfig.team_b);

  // Sort by confidence
  const sortedGuesses = [...guesses].sort((a, b) => b.confidence - a.confidence);

  // Split into team A and team B
  const teamAGuesses = sortedGuesses.filter((g) => getTeamPlayers(g.system, 'team_a').length > 0);
  const teamBGuesses = sortedGuesses.filter((g) => getTeamPlayers(g.system, 'team_b').length > 0);

  const renderGuessRow = (guess: TossupResponse, teamId: 'team_a' | 'team_b') => {
    const players = getTeamPlayers(guess.system, teamId);
    const teamColor = getTeamColor(teamId);
    const confColor = getConfidenceColor(guess.confidence);
    const showGuess = guess.buzz ? guess.guess : '?????';
    const tossupName = modelLabel(guess.system);
    const displayName =
      players.length > 0
        ? players.map((p) => p.name).join(', ')
        : tossupName;

    return (
      <tr key={`${teamId}-${guess.system}`} className="border-b border-gray-100 last:border-b-0">
        <td className="py-3 px-4 font-medium" style={{ color: teamColor }}>
          <div>{displayName}</div>
          <div className="text-xs font-normal text-gray-400 truncate">{tossupName}</div>
        </td>
        <td className="py-3 px-4 text-right font-semibold" style={{ color: confColor }}>
          {Math.round(guess.confidence * 100)}%
        </td>
        <td className="py-3 px-4" style={{ color: confColor }}>
          {showGuess}
          {guess.buzz ? ' 🚨' : ''}
        </td>
      </tr>
    );
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="grid grid-cols-2 gap-8">
        {/* Team A */}
        <div>
          <h4
            className="font-semibold mb-2 pb-2 border-b-2"
            style={{
              color: getTeamColor('team_a'),
              borderColor: getTeamColor('team_a'),
            }}
          >
            {gameConfig.team_a.name}
          </h4>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 uppercase">
                <th className="py-2 px-4 text-left">Player</th>
                <th className="py-2 px-4 text-right">Conf</th>
                <th className="py-2 px-4 text-left">Guess</th>
              </tr>
            </thead>
            <tbody>
              {teamAGuesses.length > 0 ? (
                teamAGuesses.map((g) => renderGuessRow(g, 'team_a'))
              ) : (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-gray-400 text-sm">
                    No guesses
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Team B */}
        <div>
          <h4
            className="font-semibold mb-2 pb-2 border-b-2"
            style={{
              color: getTeamColor('team_b'),
              borderColor: getTeamColor('team_b'),
            }}
          >
            {gameConfig.team_b.name}
          </h4>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 uppercase">
                <th className="py-2 px-4 text-left">Player</th>
                <th className="py-2 px-4 text-right">Conf</th>
                <th className="py-2 px-4 text-left">Guess</th>
              </tr>
            </thead>
            <tbody>
              {teamBGuesses.length > 0 ? (
                teamBGuesses.map((g) => renderGuessRow(g, 'team_b'))
              ) : (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-gray-400 text-sm">
                    No guesses
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return '#006400'; // Dark green
  if (confidence >= 0.8) return '#66bb6a'; // Light green
  if (confidence >= 0.6) return '#e1b800'; // Yellow
  if (confidence >= 0.5) return '#d9a86c'; // Orange
  return '#888888'; // Gray
}
