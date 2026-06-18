import { useEffect, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { useKeyboardBuzzer } from '../../hooks/useKeyboardBuzzer';
import { AdjustPointsDialog } from '../dialogs/AdjustPointsDialog';
import { REVEAL_LOCKOUT_TICK_INTERVAL_MS } from '../../constants/time';
import { bonusConsultPoints } from '../../../../shared/scoring';

export function ModeratorControls() {
  const {
    gameState,
    gameConfig,
    nextWord,
    advanceBonusStage,
    advanceBonusPart,
    revealBonusAi,
    submitBonusPartResult,
  } = useGame();

  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [partAnswer, setPartAnswer] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Keyboard buzzer hook
  useKeyboardBuzzer();

  if (!gameConfig) return null;

  const isTossupPhase = ['tossup_ready', 'tossup_streaming'].includes(gameState.phase);
  const isBonusLeadin = gameState.phase === 'bonus_leadin';
  const isBonusPart = gameState.phase === 'bonus_part';
  const isBonusPartReveal = gameState.phase === 'bonus_part_reveal';
  const isGameOver = gameState.phase === 'game_over';
  const isRevealLocked =
    !!gameState.revealLockoutUntilMs && nowMs < gameState.revealLockoutUntilMs;

  const fullPoints = gameConfig.bonus_part_points;
  const owningTeamPlayers = gameState.bonusOwner ? gameConfig[gameState.bonusOwner].players : [];
  const consultPoints = bonusConsultPoints(gameConfig, owningTeamPlayers);
  const abstainPoints = gameConfig.bonus_abstain_points ?? 1;
  const aiRevealed = gameState.bonusAiRevealed;

  useEffect(() => {
    if (!gameState.revealLockoutUntilMs) {
      return;
    }
    const interval = window.setInterval(() => setNowMs(Date.now()), REVEAL_LOCKOUT_TICK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [gameState.revealLockoutUntilMs]);

  const handleNextWord = () => {
    if (isTossupPhase && !gameConfig.auto_stream && !isRevealLocked) {
      nextWord();
    }
  };

  const handleAdvanceLeadin = () => {
    if (isBonusLeadin) {
      advanceBonusStage();
    }
  };

  const totalBonusParts = gameState.bonusQuestion?.parts.length ?? 0;
  const isLastBonusPart = gameState.currentBonusPart >= totalBonusParts - 1;

  const handleAdvanceReveal = () => {
    if (isBonusPartReveal) {
      advanceBonusPart();
    }
  };

  const submitPart = (
    decision: 'own' | 'consult_ai' | 'abstain',
    correct: boolean
  ) => {
    submitBonusPartResult({
      decision,
      correct,
      answer: decision === 'abstain' ? '' : partAnswer.trim(),
    });
    setPartAnswer('');
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      if (isTossupPhase) {
        handleNextWord();
      } else if (isBonusLeadin) {
        handleAdvanceLeadin();
      } else if (isBonusPartReveal) {
        handleAdvanceReveal();
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

          {/* Advance bonus lead-in to first part */}
          {isBonusLeadin && (
            <button className="btn btn-primary" onClick={handleAdvanceLeadin}>
              Start Parts →
            </button>
          )}

          {/* Advance from per-part reveal to next part / tossup */}
          {isBonusPartReveal && (
            <button className="btn btn-primary" onClick={handleAdvanceReveal}>
              {isLastBonusPart ? 'Next Question →' : 'Next Part →'}
            </button>
          )}
        </div>

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

      {/* Bonus part 3-way decision controls */}
      {isBonusPart && (
        <div className="mt-4 border-t pt-4 space-y-3">
          <input
            type="text"
            value={partAnswer}
            onChange={(e) => setPartAnswer(e.target.value)}
            placeholder="Team's answer for this part..."
            className="input w-full"
            autoFocus
          />

          {!aiRevealed ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500 w-full">
                Team submits own answer (full credit), consults AI for partial credit, or abstains:
              </span>
              <button
                className="btn bg-green-600 hover:bg-green-700 text-white"
                onClick={() => submitPart('own', true)}
                disabled={!partAnswer.trim()}
                title={`Own answer correct (+${fullPoints})`}
              >
                ✓ Correct (+{fullPoints})
              </button>
              <button
                className="btn bg-red-600 hover:bg-red-700 text-white"
                onClick={() => submitPart('own', false)}
                title="Own answer incorrect (0)"
              >
                ✕ Incorrect (0)
              </button>
              <button
                className="btn btn-secondary"
                onClick={revealBonusAi}
                title="Reveal AI responses, then submit for partial credit"
              >
                🤖 See AI responses
              </button>
              <span className="mx-1 text-gray-300">|</span>
              <button
                className="btn bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => submitPart('abstain', true)}
                title={`Abstain — nobody was correct (+${abstainPoints})`}
              >
                Abstain ✓ (+{abstainPoints})
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => submitPart('abstain', false)}
                title="Abstain — but someone was actually correct (0)"
              >
                Abstain ✕ (0)
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500 w-full">
                AI revealed — team submits a final answer for partial credit, or abstains:
              </span>
              <button
                className="btn bg-green-600 hover:bg-green-700 text-white"
                onClick={() => submitPart('consult_ai', true)}
                disabled={!partAnswer.trim()}
                title={`Correct with AI consult (+${consultPoints})`}
              >
                ✓ Correct (+{consultPoints})
              </button>
              <button
                className="btn bg-red-600 hover:bg-red-700 text-white"
                onClick={() => submitPart('consult_ai', false)}
                title="Incorrect (0)"
              >
                ✕ Incorrect (0)
              </button>
              <span className="mx-1 text-gray-300">|</span>
              <button
                className="btn bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => submitPart('abstain', true)}
                title={`Abstain — nobody was correct (+${abstainPoints})`}
              >
                Abstain ✓ (+{abstainPoints})
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => submitPart('abstain', false)}
                title="Abstain — but someone was actually correct (0)"
              >
                Abstain ✕ (0)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      {showAdjustDialog && (
        <AdjustPointsDialog onClose={() => setShowAdjustDialog(false)} />
      )}
    </div>
  );
}
