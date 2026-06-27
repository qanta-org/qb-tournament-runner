import { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import type { AIBuzzMode, AIPlayerKwargs } from '../../../../shared/types';
import { tossupModelLabel } from '../../../../shared/modelLabels';
import { aiTossupPoints } from '../../../../shared/scoring';

export function AnswerReviewDialog() {
  const { gameState, gameConfig, submitAnswerRuling, setBuzzSource, getPlayer, getTeamColor } = useGame();
  const [answer, setAnswer] = useState('');
  // Remember the human who originally buzzed so the moderator can undo a
  // delegation (switch the answer source back to that human).
  const [humanBuzzerId, setHumanBuzzerId] = useState<string | null>(null);

  // Get buzzing player info
  const buzzingPlayerId = gameState.buzzingPlayer;
  const buzzingPlayer = buzzingPlayerId ? getPlayer(buzzingPlayerId) : null;

  // Determine team and color
  const playerTeam = buzzingPlayerId
    ? gameConfig?.team_a.players.some((p) => p.player_id === buzzingPlayerId)
      ? 'team_a'
      : 'team_b'
    : null;
  const teamColor = playerTeam ? getTeamColor(playerTeam) : '#333';
  const teamName = playerTeam
    ? playerTeam === 'team_a'
      ? gameConfig?.team_a.name
      : gameConfig?.team_b.name
    : '';

  // Get AI guess if it's an AI player
  const aiGuess = buzzingPlayer?.type === 'ai'
    ? gameState.currentGuesses.find((g) => {
        const kwargs = buzzingPlayer.extra_kwargs as { tossup_model: string };
        return g.system === kwargs.tossup_model;
      })?.guess || ''
    : '';

  // Prefill answer for AI players
  useEffect(() => {
    if (aiGuess) {
      setAnswer(aiGuess);
    }
  }, [aiGuess]);

  // Track the human who buzzed (before any delegation) so we can switch back.
  useEffect(() => {
    if (buzzingPlayer?.type === 'human' && buzzingPlayerId) {
      setHumanBuzzerId(buzzingPlayerId);
    }
  }, [buzzingPlayer, buzzingPlayerId]);

  // Same-team semi-autonomous AIs the moderator can delegate the answer to.
  const teamPlayers = playerTeam
    ? playerTeam === 'team_a'
      ? gameConfig?.team_a.players ?? []
      : gameConfig?.team_b.players ?? []
    : [];
  const delegableAis = teamPlayers.filter(
    (p) =>
      p.type === 'ai' &&
      ((gameState.aiBuzzModes[p.player_id] ?? 'autonomous') as AIBuzzMode) === 'semi'
  );

  const handleDelegateToAi = (aiPlayerId: string) => {
    setBuzzSource(aiPlayerId);
  };

  const handleBackToHuman = () => {
    if (humanBuzzerId) {
      setAnswer('');
      setBuzzSource(humanBuzzerId);
    }
  };

  const handleAccept = () => {
    const finalAnswer = answer.trim() || aiGuess;
    submitAnswerRuling('accept', finalAnswer);
    setAnswer('');
  };

  const handleReject = () => {
    const finalAnswer = answer.trim() || aiGuess;
    submitAnswerRuling('reject', finalAnswer);
    setAnswer('');
  };

  const handleRejectNoPenalty = () => {
    const finalAnswer = answer.trim() || aiGuess;
    submitAnswerRuling('reject_no_penalty', finalAnswer);
    setAnswer('');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if typing in the input
      if (e.target instanceof HTMLInputElement) return;

      // While a human is the answerer, require a typed answer before ruling
      // (the moderator may still be deciding whether to delegate to an AI).
      const currentIsHuman = buzzingPlayer?.type === 'human';
      if (currentIsHuman && !answer.trim()) return;

      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        const finalAnswer = answer.trim() || aiGuess;
        submitAnswerRuling('accept', finalAnswer);
        setAnswer('');
      } else if (e.key === '-') {
        e.preventDefault();
        const finalAnswer = answer.trim() || aiGuess;
        if (gameConfig && gameConfig.tossup_penalty_value > 0) {
          submitAnswerRuling('reject', finalAnswer);
        } else {
          submitAnswerRuling('reject_no_penalty', finalAnswer);
        }
        setAnswer('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [answer, aiGuess, gameConfig, submitAnswerRuling, buzzingPlayer]);

  if (!buzzingPlayer || !gameConfig) return null;

  const isHuman = buzzingPlayer.type === 'human';
  const otherTeam = playerTeam === 'team_a' ? 'team_b' : 'team_a';
  const penaltyValue = playerTeam && gameState.teamBuzzed[otherTeam]
    ? gameConfig.tossup_penalty_value_second_team
    : gameConfig.tossup_penalty_value;
  // Points awarded if correct. For an AI answerer (including a human-delegated
  // semi AI), apply the same weight-class deflation the server uses on accept.
  const correctPoints = isHuman
    ? gameState.tossupPointsValue
    : aiTossupPoints(gameConfig, gameState.tossupPointsValue, buzzingPlayer);

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-fadeIn">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Answer Review</h2>
          <p>
            <span className="font-bold" style={{ color: teamColor }}>
              {buzzingPlayer.name}
            </span>{' '}
            <span className="text-gray-600">[{teamName}]</span> buzzed 🛎️
          </p>
          {!isHuman && (
            <p className="text-sm text-gray-500 mt-1">
              Tossup model: {tossupModelLabel(buzzingPlayer.extra_kwargs as AIPlayerKwargs)}
            </p>
          )}
        </div>

        {/* Answer display/input */}
        <div className="mb-4">
          {isHuman ? (
            // Human player - show input field
            <div>
              <label className="label">Enter their answer:</label>
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type the human player's answer..."
                className="input text-lg"
                autoFocus
              />
            </div>
          ) : (
            // AI player - show the answer
            <div className="bg-blue-50 p-3 rounded-lg text-center">
              <p className="text-xs text-gray-500 mb-1">AI Response:</p>
              <p className="text-lg font-semibold text-blue-600">{aiGuess || '(no guess available)'}</p>
            </div>
          )}
        </div>

        {/* Delegate to a same-team semi-autonomous AI (when a human buzzed) */}
        {isHuman && delegableAis.length > 0 && (
          <div className="mb-4 border border-dashed border-gray-300 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-2 text-center">
              Or delegate the answer to a semi-autonomous AI:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {delegableAis.map((ai) => (
                <button
                  key={ai.player_id}
                  onClick={() => handleDelegateToAi(ai.player_id)}
                  className="btn btn-secondary py-1 px-3 text-sm font-medium"
                >
                  🤖 {ai.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Undo a delegation - return the answer to the human who buzzed */}
        {!isHuman && humanBuzzerId && (
          <div className="mb-4 text-center">
            <button
              onClick={handleBackToHuman}
              className="text-xs text-gray-500 underline hover:text-gray-700"
            >
              ← Back to human answer
            </button>
          </div>
        )}

        {/* Correct answer reference for the moderator */}
        {gameState.currentTossupAnswer && (
          <div className="mb-4 flex items-center justify-center gap-2 bg-green-100 px-3 py-2 rounded-lg">
            <span className="text-xs text-green-600 font-medium">Correct Answer:</span>
            <span
              className="text-sm text-green-800 font-semibold"
              dangerouslySetInnerHTML={{ __html: gameState.currentTossupAnswer }}
            />
          </div>
        )}

        {/* Points info */}
        <div className="text-center text-sm text-gray-500 mb-4">
          <span className="text-green-600 font-medium">
            +{correctPoints}
          </span>{' '}
          if correct |{' '}
          {penaltyValue > 0 ? (
            <span className="text-red-600 font-medium">-{penaltyValue}</span>
          ) : (
            <span className="text-gray-500">No penalty</span>
          )}{' '}
          if wrong
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleAccept}
            className="flex-1 btn btn-success py-2 text-sm font-semibold"
            disabled={isHuman && !answer.trim()}
          >
            ✔ Accept
          </button>

          {penaltyValue > 0 && (
            <button
              onClick={handleReject}
              className="flex-1 btn btn-danger py-2 text-sm font-semibold"
              disabled={isHuman && !answer.trim()}
            >
              ✖ Reject
            </button>
          )}

          <button
            onClick={handleRejectNoPenalty}
            className="flex-1 btn btn-secondary py-2 text-sm font-semibold"
            disabled={isHuman && !answer.trim()}
          >
            ⛔ No Penalty
          </button>
        </div>

        {/* Keyboard shortcuts hint */}
        <p className="text-center text-xs text-gray-400 mt-4">
          Keyboard: <kbd className="px-1 bg-gray-100 rounded">=</kbd> Accept |{' '}
          <kbd className="px-1 bg-gray-100 rounded">-</kbd> Reject
        </p>
      </div>
    </div>
  );
}
