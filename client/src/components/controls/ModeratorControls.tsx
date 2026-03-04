import { useEffect, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { useKeyboardBuzzer } from '../../hooks/useKeyboardBuzzer';
import { AdjustPointsDialog } from '../dialogs/AdjustPointsDialog';

export function ModeratorControls() {
  const {
    gameState,
    gameConfig,
    nextWord,
    advanceBonusStage,
    submitBonusFinalAnswer,
  } = useGame();

  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [finalAnswer, setFinalAnswer] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Keyboard buzzer hook
  useKeyboardBuzzer();

  if (!gameConfig) return null;

  const isTossupPhase = ['tossup_ready', 'tossup_streaming'].includes(gameState.phase);
  const isBonusPhase = [
    'bonus_leadin',
    'bonus_part',
    'bonus_human_response',
    'bonus_final_answer',
  ].includes(gameState.phase);
  const isGameOver = gameState.phase === 'game_over';
  const isRevealLocked =
    !!gameState.revealLockoutUntilMs && nowMs < gameState.revealLockoutUntilMs;

  useEffect(() => {
    if (!gameState.revealLockoutUntilMs) {
      return;
    }
    const interval = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, [gameState.revealLockoutUntilMs]);

  const handleNextWord = () => {
    if (isTossupPhase && !gameConfig.auto_stream && !isRevealLocked) {
      nextWord();
    }
  };

  const handleAdvanceBonus = () => {
    if (isBonusPhase && gameState.bonusStage !== 'final_answer') {
      advanceBonusStage();
    }
  };

  const handleSubmitFinalAnswer = () => {
    if (finalAnswer.trim()) {
      submitBonusFinalAnswer(finalAnswer.trim());
      setFinalAnswer('');
    }
  };

  const handleAcceptBonusAnswer = () => {
    if (finalAnswer.trim()) {
      // Submit with the answer - server will award points
      submitBonusFinalAnswer(finalAnswer.trim());
      setFinalAnswer('');
    }
  };

  const handleRejectBonusAnswer = () => {
    // Submit empty string to indicate rejection - server awards 0 points
    submitBonusFinalAnswer('');
    setFinalAnswer('');
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      if (isTossupPhase) {
        handleNextWord();
      } else if (isBonusPhase) {
        handleAdvanceBonus();
      }
    }
  };

  if (isGameOver) {
    return (
      <div className="card p-4">
        <div className="text-center">
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Start New Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left side: Navigation controls */}
        <div className="flex items-center gap-2">
          {/* Next word button (manual mode) */}
          {isTossupPhase && !gameConfig.auto_stream && (
            <button
              className="btn btn-primary"
              onClick={handleNextWord}
              disabled={isRevealLocked}
            >
              {isRevealLocked ? 'Locked…' : 'Next Token →'}
            </button>
          )}

          {/* Advance bonus button */}
          {isBonusPhase && gameState.bonusStage !== 'final_answer' && (
            <button
              className="btn btn-primary"
              onClick={handleAdvanceBonus}
            >
              Next →
            </button>
          )}

        </div>

        {/* Center: Final answer input (bonus) with Accept/Reject */}
        {gameState.bonusStage === 'final_answer' && (
          <div className="flex items-center gap-2 flex-1 max-w-lg mx-4">
            <input
              type="text"
              value={finalAnswer}
              onChange={(e) => setFinalAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAcceptBonusAnswer();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleRejectBonusAnswer();
                }
              }}
              placeholder="Enter final answer..."
              className="input flex-1"
              autoFocus
            />
            <button
              className="btn bg-green-600 hover:bg-green-700 text-white"
              onClick={handleAcceptBonusAnswer}
              disabled={!finalAnswer.trim()}
              title="Accept answer (+10 pts) - Enter"
            >
              ✓ Accept
            </button>
            <button
              className="btn bg-red-600 hover:bg-red-700 text-white"
              onClick={handleRejectBonusAnswer}
              title="Reject answer (0 pts) - Escape"
            >
              ✕ Reject
            </button>
          </div>
        )}

        {/* Right side: Other controls */}
        <div className="flex items-center gap-2">
          <button
            className="btn btn-secondary"
            onClick={() => setShowAdjustDialog(true)}
          >
            Adjust Points
          </button>

          {/* Mode indicator */}
          {!gameConfig.auto_stream && (
            <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-medium">
              👀 Manual Mode
            </span>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {showAdjustDialog && (
        <AdjustPointsDialog onClose={() => setShowAdjustDialog(false)} />
      )}
    </div>
  );
}
