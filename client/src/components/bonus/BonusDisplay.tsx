import { useGame } from '../../context/GameContext';
import type { TeamId } from '../../../../shared/types';

export function BonusDisplay() {
  const { gameState, gameConfig, getTeamColor } = useGame();

  if (!gameConfig || !gameState.bonusQuestion || !gameState.bonusOwner) {
    return null;
  }

  const bonus = gameState.bonusQuestion;
  const teamColor = getTeamColor(gameState.bonusOwner);
  const teamName =
    gameState.bonusOwner === 'team_a'
      ? gameConfig.team_a.name
      : gameConfig.team_b.name;

  const totalParts = bonus.parts.length;
  const currentPart = gameState.currentBonusPart;
  const showPart = gameState.bonusStage !== 'leadin';

  return (
    <div className="space-y-4">
      {/* Bonus header */}
      <div
        className="rounded-t-lg p-3 text-white text-center"
        style={{ backgroundColor: teamColor }}
      >
        <h3 className="text-lg font-bold">BONUS for {teamName}</h3>
      </div>

      <div className="bg-white border rounded-b-lg p-6 space-y-4">
        {/* Lead-in - ALWAYS visible for all parts */}
        <div
          className="bg-gray-100 p-4 rounded-lg border-l-4"
          style={{ borderColor: teamColor }}
        >
          <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Lead-in</p>
          <p className="text-lg text-gray-800">{bonus.leadin}</p>
          {(bonus.leadinMedia?.imageUrl || bonus.leadinMedia?.audioUrl) && (
            <div className="mt-3 flex flex-col sm:flex-row gap-3 items-start">
              {bonus.leadinMedia.imageUrl && (
                <div className="w-full sm:w-1/2 border rounded-md overflow-hidden bg-black/5">
                  <img
                    src={bonus.leadinMedia.imageUrl}
                    alt="Bonus lead-in image"
                    className="w-full h-48 object-contain bg-black/10"
                  />
                </div>
              )}
              {bonus.leadinMedia.audioUrl && (
                <button
                  type="button"
                  onClick={() => {
                    const audio = new Audio(bonus.leadinMedia!.audioUrl!);
                    audio.play().catch(() => {
                      // ignore playback errors
                    });
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-blue-50 text-blue-700 text-sm font-medium border border-blue-100"
                >
                  <span>▶</span>
                  <span>{bonus.leadinMedia.audioDisplayText || 'Play audio'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Current part */}
        {showPart && currentPart < totalParts && (
          <>
            {/* Part header with inline answer */}
            <div className="flex items-center gap-3 flex-wrap">
              <div
                className="rounded-lg px-3 py-2 text-white font-semibold"
                style={{ backgroundColor: teamColor }}
              >
                Part {currentPart + 1} of {totalParts} ({gameConfig.bonus_part_points} pts)
              </div>
              {/* Compact answer display - inline with part chip */}
              {gameState.currentBonusPartAnswer && (
                <div className="flex items-center gap-2 bg-green-100 px-3 py-1.5 rounded-full">
                  <span className="text-xs text-green-600 font-medium">ANS:</span>
                  <span 
                    className="text-sm text-green-800 font-semibold"
                    dangerouslySetInnerHTML={{ __html: gameState.currentBonusPartAnswer }}
                  />
                </div>
              )}
            </div>

            {/* Part content */}
            <div className="space-y-3">
              <div className="text-lg text-gray-800">
                {bonus.parts[currentPart].text}
              </div>
              {(bonus.parts[currentPart].media?.imageUrl ||
                bonus.parts[currentPart].media?.audioUrl) && (
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  {bonus.parts[currentPart].media?.imageUrl && (
                    <div className="w-full sm:w-1/2 border rounded-md overflow-hidden bg-black/5">
                      <img
                        src={bonus.parts[currentPart].media!.imageUrl!}
                        alt={`Bonus part ${currentPart + 1} image`}
                        className="w-full h-48 object-contain bg-black/10"
                      />
                    </div>
                  )}
                  {bonus.parts[currentPart].media?.audioUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        const audio = new Audio(
                          bonus.parts[currentPart].media!.audioUrl!
                        );
                        audio.play().catch(() => {
                          // ignore playback errors
                        });
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-blue-50 text-blue-700 text-sm font-medium border border-blue-100"
                    >
                      <span>▶</span>
                      <span>
                        {bonus.parts[currentPart].media!.audioDisplayText ||
                          'Play audio'}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* AI Responses (during final_answer stage) */}
        {gameState.bonusStage === 'final_answer' && gameState.bonusResponses.length > 0 && (
          <div className="border-t pt-4 mt-4">
            <h4 className="font-semibold text-gray-700 mb-3">AI Responses:</h4>
            <div className="space-y-2">
              {gameState.bonusResponses.map((response, idx) => {
                const confColor = getConfidenceColor(response.confidence);
                // bonusOwner is guaranteed to be non-null due to component-level check
                const playerName = getPlayerName(response.system, gameConfig, gameState.bonusOwner as TeamId);

                return (
                  <div
                    key={idx}
                    className="bg-gray-50 p-3 rounded-lg flex items-start gap-4"
                  >
                    <div className="flex-shrink-0">
                      <span
                        className="font-semibold"
                        style={{ color: teamColor }}
                      >
                        {playerName}
                      </span>
                    </div>
                    <div className="flex-1">
                      <span className="text-blue-600 font-medium">{response.guess}</span>
                      {response.explanation && (
                        <p className="text-sm text-gray-500 mt-1 font-mono">
                          {response.explanation.slice(0, 100)}
                          {response.explanation.length > 100 ? '...' : ''}
                        </p>
                      )}
                    </div>
                    <div
                      className="font-bold"
                      style={{ color: confColor }}
                    >
                      {Math.round(response.confidence * 100)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Progress indicator */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{ 
                width: `${((currentPart + 1) / totalParts) * 100}%`, 
                backgroundColor: teamColor 
              }}
            />
          </div>
          <span className="text-sm text-gray-500">
            Part {Math.min(currentPart + 1, totalParts)}/{totalParts}
          </span>
        </div>

        {/* Stage indicator */}
        <div className="text-center text-sm text-gray-500">
          {gameState.bonusStage === 'leadin' && 'Press → to show the question'}
          {gameState.bonusStage === 'question' && 'Press → to collect human responses'}
          {gameState.bonusStage === 'human_response' && 'Collecting responses...'}
          {gameState.bonusStage === 'final_answer' && 'Enter final answer below'}
        </div>
      </div>
    </div>
  );
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return '#006400';
  if (confidence >= 0.8) return '#66bb6a';
  if (confidence >= 0.6) return '#e1b800';
  return '#888888';
}

function getPlayerName(
  systemName: string,
  gameConfig: any,
  bonusOwner: 'team_a' | 'team_b'
): string {
  const team = bonusOwner === 'team_a' ? gameConfig.team_a : gameConfig.team_b;
  for (const player of team.players) {
    if (player.type === 'ai') {
      const kwargs = player.extra_kwargs as { bonus_model: string };
      if (kwargs.bonus_model === systemName) {
        return player.name;
      }
    }
  }
  return systemName;
}
