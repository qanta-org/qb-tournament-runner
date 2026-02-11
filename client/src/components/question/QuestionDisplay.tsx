import { useGame } from '../../context/GameContext';

/**
 * QuestionDisplay - Moderator's tossup question display
 * 
 * Shows ALL words with:
 * - Revealed words: fully visible (dark text)
 * - Unrevealed words: grayed out (light text)
 * 
 * This allows moderator to read ahead while tracking progress.
 */
export function QuestionDisplay() {
  const { gameState, gameConfig } = useGame();

  if (!gameConfig) return null;

  // Progress percentage
  const progress =
    gameState.totalWords > 0
      ? Math.round((gameState.wordIndex / gameState.totalWords) * 100)
      : 0;

  // Power indicator
  const isPowerPhase =
    gameConfig.enable_power_points &&
    gameState.tossupPointsValue === gameConfig.power_points_value;

  // Split full text into words for moderator preview
  const fullWords = gameState.fullTossupText?.split(/\s+/) || [];
  const revealedCount = gameState.wordIndex;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="progress-bar flex-1">
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm text-gray-500 min-w-[3rem] text-right">
          {gameState.wordIndex}/{gameState.totalWords}
        </span>
      </div>

      {/* Power indicator */}
      {gameConfig.enable_power_points && (
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded text-sm font-medium ${
              isPowerPhase
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            ⚡ Power: {isPowerPhase ? `${gameConfig.power_points_value} pts` : 'Expired'}
          </span>
          <span className="text-sm text-gray-500">
            Current value: {gameState.tossupPointsValue} pts
          </span>
        </div>
      )}

      {/* Question text - Full preview for moderator */}
      <div className="bg-gray-50 rounded-lg p-6 border-l-4 border-blue-500">
        <p className="question-text leading-relaxed text-lg">
          {fullWords.length > 0 ? (
            fullWords.map((word, index) => {
              const isRevealed = index < revealedCount;
              const isNextWord = index === revealedCount;
              return (
                <span
                  key={index}
                  className={`${
                    isRevealed
                      ? 'text-gray-900 font-medium'
                      : isNextWord
                      ? 'text-gray-400 bg-yellow-50 px-1 rounded'
                      : 'text-gray-300'
                  } transition-colors duration-150`}
                >
                  {word}
                  {index < fullWords.length - 1 ? ' ' : ''}
                </span>
              );
            })
          ) : (
            <span className="text-gray-400 italic">
              Press arrow key to begin revealing the question...
            </span>
          )}
        </p>
      </div>

      {/* Buzzing player indicator */}
      {gameState.buzzingPlayer && (
        <div className="animate-fadeIn bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="font-semibold text-red-800">
              Buzz from {getPlayerName(gameState.buzzingPlayer, gameConfig)}!
            </p>
            <p className="text-sm text-red-600">Awaiting answer...</p>
          </div>
        </div>
      )}
    </div>
  );
}

function getPlayerName(playerId: string, config: any): string {
  const allPlayers = [...config.team_a.players, ...config.team_b.players];
  const player = allPlayers.find((p: any) => p.player_id === playerId);
  return player?.name || playerId;
}
