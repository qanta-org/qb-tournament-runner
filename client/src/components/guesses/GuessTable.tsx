import { useGame } from '../../context/GameContext';
import type { TossupResponse } from '../../../../shared/types';

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

  // Map system names to players and teams
  const getPlayerInfo = (systemName: string) => {
    for (const player of gameConfig.team_a.players) {
      if (player.type === 'ai') {
        const kwargs = player.extra_kwargs as { tossup_model: string };
        if (kwargs.tossup_model === systemName) {
          return { player, teamId: 'team_a' as const };
        }
      }
    }
    for (const player of gameConfig.team_b.players) {
      if (player.type === 'ai') {
        const kwargs = player.extra_kwargs as { tossup_model: string };
        if (kwargs.tossup_model === systemName) {
          return { player, teamId: 'team_b' as const };
        }
      }
    }
    return null;
  };

  // Sort by confidence
  const sortedGuesses = [...guesses].sort((a, b) => b.confidence - a.confidence);

  // Split into team A and team B
  const teamAGuesses = sortedGuesses.filter((g) => {
    const info = getPlayerInfo(g.system);
    return info?.teamId === 'team_a';
  });
  const teamBGuesses = sortedGuesses.filter((g) => {
    const info = getPlayerInfo(g.system);
    return info?.teamId === 'team_b';
  });

  const renderGuessRow = (guess: TossupResponse, teamId: 'team_a' | 'team_b') => {
    const info = getPlayerInfo(guess.system);
    const teamColor = getTeamColor(teamId);
    const confColor = getConfidenceColor(guess.confidence);
    const showGuess = guess.buzz ? guess.guess : '?????';

    return (
      <tr key={guess.system} className="border-b border-gray-100 last:border-b-0">
        <td className="py-3 px-4 font-medium" style={{ color: teamColor }}>
          {info?.player.name || guess.system.slice(0, 18)}
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
