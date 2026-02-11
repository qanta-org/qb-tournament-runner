import { useState } from 'react';
import { useGame } from '../../context/GameContext';
import type { QuestionResult, TeamId } from '../../../../shared/types';

/**
 * QuestionNavSidebar - Vertical sidebar showing all questions with color-coded outcomes
 * 
 * Color coding:
 * - Gray: pending (not played yet)
 * - Team A color (default red): Team A got it right
 * - Team B color (default blue): Team B got it right  
 * - Yellow/Orange: Dead (both teams failed) or skipped
 * - Green ring: Currently active question
 */
export function QuestionNavSidebar() {
  const { gameState, gameConfig, getTeamColor, socket } = useGame();
  const [previewQuestion, setPreviewQuestion] = useState<QuestionResult | null>(null);
  const [bonusOwnerSelect, setBonusOwnerSelect] = useState<TeamId | null>(null);

  if (!gameConfig) return null;

  const teamAColor = getTeamColor('team_a');
  const teamBColor = getTeamColor('team_b');

  const formatPoints = (points: number) => {
    if (points > 0) return `+${points}`;
    if (points < 0) return `${points}`;
    return '0';
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case 'team_a':
        return teamAColor;
      case 'team_b':
        return teamBColor;
      case 'dead':
        return '#8b7355'; // Dull gray-orange
      case 'skipped':
        return '#fbbf24'; // Yellow
      default:
        return '#d1d5db'; // Lighter gray for pending
    }
  };

  const handleQuestionClick = (result: QuestionResult) => {
    setPreviewQuestion(result);
    if (result.type === 'bonus') {
      setBonusOwnerSelect(null); // Reset selection
    }
  };

  const handlePlay = () => {
    if (!previewQuestion || !socket) return;

    if (previewQuestion.type === 'tossup') {
      socket.emit('moderator:play_tossup', previewQuestion.index);
    } else if (previewQuestion.type === 'bonus' && bonusOwnerSelect) {
      socket.emit('moderator:play_bonus', {
        bonusIndex: previewQuestion.index,
        owner: bonusOwnerSelect
      });
    }
    setPreviewQuestion(null);
    setBonusOwnerSelect(null);
  };

  const closePreview = () => {
    setPreviewQuestion(null);
    setBonusOwnerSelect(null);
  };

  // Determine current question index
  const currentTossupIndex = gameState.currentTossupNum > 0 ? gameState.currentTossupNum - 1 : -1;
  const currentBonusIndex = gameState.currentBonusNum > 0 ? gameState.currentBonusNum - 1 : -1;

  const isBonusPhase = ['bonus_leadin', 'bonus_part', 'bonus_human_response', 'bonus_final_answer'].includes(gameState.phase);

  return (
    <>
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-40 border-r shadow-md z-40 flex flex-col overflow-hidden" style={{ backgroundColor: '#FFFEF5', borderColor: '#F5E6D3' }}>
        {/* Header */}
        <div className="flex-shrink-0 p-2 border-b" style={{ backgroundColor: '#FFF8E7', borderColor: '#F5E6D3' }}>
          <div className="text-xs font-semibold text-center mb-1" style={{ color: '#6B5B4F' }}>NAV</div>
          <div className="grid grid-cols-2 gap-1 text-[10px] font-medium" style={{ color: '#8B7355' }}>
            <div className="text-center">T</div>
            <div className="text-center">B</div>
          </div>
        </div>

        {/* Scrollable content - Two columns side by side */}
        <div className="flex-1 overflow-y-auto py-2 px-1" style={{ backgroundColor: '#FFFEF5' }}>
          <div className="grid grid-cols-2 gap-1">
            {/* Tossups Column */}
            <div className="space-y-1">
              {gameState.tossupResults.map((result) => (
                <button
                  key={`t-${result.index}`}
                  onClick={() => handleQuestionClick(result)}
                  className={`w-full h-8 rounded text-xs font-bold transition-all flex items-center justify-center
                    ${!isBonusPhase && currentTossupIndex === result.index
                      ? 'ring-2 ring-green-500 ring-offset-1'
                      : ''
                    }
                    hover:scale-105 hover:opacity-80
                  `}
                  style={{
                    backgroundColor: getOutcomeColor(result.outcome),
                    color: result.outcome === 'pending' ? '#1f2937' : 'white'
                  }}
                  title={`Tossup ${result.index + 1} - ${result.outcome}`}
                >
                  {result.index + 1}
                </button>
              ))}
            </div>

            {/* Bonuses Column */}
            <div className="space-y-1">
              {gameState.bonusResults.map((result) => (
                <button
                  key={`b-${result.index}`}
                  onClick={() => handleQuestionClick(result)}
                  className={`w-full h-8 rounded text-xs font-bold transition-all flex items-center justify-center
                    ${isBonusPhase && currentBonusIndex === result.index
                      ? 'ring-2 ring-green-500 ring-offset-1'
                      : ''
                    }
                    hover:scale-105 hover:opacity-80
                  `}
                  style={{
                    backgroundColor: getOutcomeColor(result.outcome),
                    color: result.outcome === 'pending' ? '#1f2937' : 'white'
                  }}
                  title={`Bonus ${result.index + 1} - ${result.outcome}`}
                >
                  {result.index + 1}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-shrink-0 p-2 border-t space-y-2" style={{ backgroundColor: '#FFF8E7', borderColor: '#F5E6D3' }}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: teamAColor }} />
            <span className="text-xs font-medium" style={{ color: '#6B5B4F' }}>{gameConfig.team_a.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: teamBColor }} />
            <span className="text-xs font-medium" style={{ color: '#6B5B4F' }}>{gameConfig.team_b.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: '#8b7355' }} />
            <span className="text-xs font-medium" style={{ color: '#6B5B4F' }}>Dead</span>
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      {previewQuestion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
            {/* Header */}
            <div
              className="px-4 py-3 text-white font-semibold"
              style={{
                backgroundColor: getOutcomeColor(previewQuestion.outcome)
              }}
            >
              {previewQuestion.type === 'tossup'
                ? `Tossup ${previewQuestion.index + 1}`
                : `Bonus ${previewQuestion.index + 1}`
              }
              <span className="ml-2 text-sm font-normal opacity-80">
                ({previewQuestion.outcome === 'pending' ? 'Not played' : previewQuestion.outcome})
              </span>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              {/* Answer (tossups only) */}
              {previewQuestion.type === 'tossup' && previewQuestion.answer && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="text-xs text-green-600 font-medium mb-1">Answer</div>
                  <div
                    className="text-green-800 font-semibold"
                    dangerouslySetInnerHTML={{ __html: previewQuestion.answer }}
                  />
                </div>
              )}

              {/* Preview text */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 font-medium mb-1">
                  {previewQuestion.type === 'tossup' ? 'First words' : 'Lead-in'}
                </div>
                <div className="text-gray-700">
                  {previewQuestion.previewText}
                </div>
              </div>

              {/* Score summary for this question (if already played) */}
              {previewQuestion.previousScore && (
                <div className="rounded-lg p-3 border" style={{ borderColor: '#F5E6D3', backgroundColor: '#FFFEF5' }}>
                  <div className="text-xs font-semibold mb-2" style={{ color: '#6B5B4F' }}>
                    Score for this question
                  </div>
                  <div className="flex justify-between text-xs">
                    <div>
                      <div className="font-medium" style={{ color: teamAColor }}>
                        {gameConfig.team_a.name}
                      </div>
                      <div className="font-mono">
                        {formatPoints(previewQuestion.previousScore.team_a)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium" style={{ color: teamBColor }}>
                        {gameConfig.team_b.name}
                      </div>
                      <div className="font-mono">
                        {formatPoints(previewQuestion.previousScore.team_b)}
                      </div>
                    </div>
                  </div>
                  {previewQuestion.previousScore.team_a === 0 &&
                    previewQuestion.previousScore.team_b === 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        No points awarded for this question.
                      </div>
                    )}
                </div>
              )}

              {/* Bonus owner selection (for bonuses) - REQUIRED */}
              {previewQuestion.type === 'bonus' && (
                <div className="space-y-3 border-2 border-blue-200 bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎯</span>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">
                        Select team to receive bonus:
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        Required to play this bonus question
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBonusOwnerSelect('team_a')}
                      className={`flex-1 py-3 rounded-lg font-semibold transition-all transform ${bonusOwnerSelect === 'team_a'
                          ? 'ring-4 ring-offset-2 scale-105 shadow-lg'
                          : 'opacity-70 hover:opacity-100 hover:scale-[1.02]'
                        }`}
                      style={{
                        backgroundColor: teamAColor,
                        color: 'white',
                        // Use CSS custom property for ring color
                        ['--tw-ring-color' as string]: teamAColor,
                      }}
                    >
                      {gameConfig.team_a.name}
                    </button>
                    <button
                      onClick={() => setBonusOwnerSelect('team_b')}
                      className={`flex-1 py-3 rounded-lg font-semibold transition-all transform ${bonusOwnerSelect === 'team_b'
                          ? 'ring-4 ring-offset-2 scale-105 shadow-lg'
                          : 'opacity-70 hover:opacity-100 hover:scale-[1.02]'
                        }`}
                      style={{
                        backgroundColor: teamBColor,
                        color: 'white',
                        // Use CSS custom property for ring color
                        ['--tw-ring-color' as string]: teamBColor,
                      }}
                    >
                      {gameConfig.team_b.name}
                    </button>
                  </div>
                  {!bonusOwnerSelect && (
                    <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-center gap-1">
                      <span>⚠️</span>
                      <span>Please select a team before playing</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-3 bg-gray-50 border-t flex justify-end gap-2">
              <button
                onClick={closePreview}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePlay}
                disabled={previewQuestion.type === 'bonus' && !bonusOwnerSelect}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${previewQuestion.type === 'bonus' && !bonusOwnerSelect
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
              >
                {previewQuestion.outcome !== 'pending' && previewQuestion.outcome !== 'skipped'
                  ? 'Replay'
                  : '▶ Play'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
