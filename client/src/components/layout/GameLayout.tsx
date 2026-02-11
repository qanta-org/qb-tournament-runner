import { useGame } from '../../context/GameContext';
import { Scoreboard } from '../scoreboard/Scoreboard';
import { QuestionDisplay } from '../question/QuestionDisplay';
import { GuessTable } from '../guesses/GuessTable';
import { BonusDisplay } from '../bonus/BonusDisplay';
import { ModeratorControls } from '../controls/ModeratorControls';
import { AnswerReviewDialog } from '../dialogs/AnswerReviewDialog';
import { ResponseCollectionDialog } from '../dialogs/ResponseCollectionDialog';
import { QuestionNavSidebar } from '../navigation/QuestionNavSidebar';
import type { TossupResponse } from '../../../../shared/types';

export function GameLayout() {
  const { gameState, gameConfig } = useGame();

  if (!gameConfig) {
    return <div>Loading...</div>;
  }

  const isBonusPhase = [
    'bonus_leadin',
    'bonus_part',
    'bonus_human_response',
    'bonus_final_answer',
  ].includes(gameState.phase);

  const isTossupPhase = ['tossup_ready', 'tossup_streaming', 'buzz_pending'].includes(
    gameState.phase
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Question Navigation Sidebar */}
      <QuestionNavSidebar />
      
      {/* Main content - offset for sidebar */}
      <div className="ml-40 p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <header className="text-center">
          <h1 className="text-2xl font-bold text-gray-800">Quiz Bowl Buzzer</h1>
          <p className="text-sm text-gray-500">
            {isBonusPhase 
              ? `Bonus ${gameState.currentBonusNum} of ${gameState.totalBonuses}`
              : `Tossup ${gameState.currentTossupNum} of ${gameState.totalTossups}`
            }
          </p>
        </header>

        {/* Scoreboard */}
        <Scoreboard />

        {/* Question Area */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-gray-700">
                {isBonusPhase ? 'Bonus Question' : 'Tossup Question'}
              </h2>
              {/* Compact answer display for tossups - inline with header */}
              {!isBonusPhase && gameState.currentTossupAnswer && (
                <div className="flex items-center gap-2 bg-green-100 px-3 py-1 rounded-full">
                  <span className="text-xs text-green-600 font-medium">ANS:</span>
                  <span 
                    className="text-sm text-green-800 font-semibold"
                    dangerouslySetInnerHTML={{ __html: gameState.currentTossupAnswer }}
                  />
                </div>
              )}
            </div>
            {gameState.phase === 'game_over' && (
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                Game Over
              </span>
            )}
          </div>

          {/* Tossup Display */}
          {(isTossupPhase || gameState.phase === 'answer_review') && <QuestionDisplay />}

          {/* Bonus Display */}
          {isBonusPhase && <BonusDisplay />}

          {/* Game Over */}
          {gameState.phase === 'game_over' && (
            <div className="text-center py-8">
              <h3 className="text-2xl font-bold text-gray-800 mb-4">Final Scores</h3>
              <div className="flex justify-center gap-8">
                <div className="text-center">
                  <p className="text-sm text-gray-500">{gameConfig.team_a.name}</p>
                  <p className="text-4xl font-bold text-team-a">{gameState.scores.team_a}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">{gameConfig.team_b.name}</p>
                  <p className="text-4xl font-bold text-team-b">{gameState.scores.team_b}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Top Guess Display (during tossup streaming) */}
        {isTossupPhase && gameState.currentGuesses.length > 0 && (
          <TopGuessDisplay guesses={gameState.currentGuesses} />
        )}

        {/* All Guesses Table (during tossup streaming) */}
        {isTossupPhase && gameState.currentGuesses.length > 0 && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">All AI Guesses</h2>
            <GuessTable guesses={gameState.currentGuesses} />
          </div>
        )}

        {/* Moderator Controls */}
        <ModeratorControls />

        {/* Answer Review Dialog */}
        {gameState.phase === 'answer_review' && <AnswerReviewDialog />}

        {/* Human Response Collection Dialog */}
        {gameState.phase === 'bonus_human_response' && <ResponseCollectionDialog />}

        {/* Status Bar */}
        <footer className="text-center text-sm text-gray-500">
          {gameState.phase === 'tossup_streaming' && !gameConfig.auto_stream && (
            <p>Press <kbd className="px-2 py-1 bg-gray-200 rounded">→</kbd> or <kbd className="px-2 py-1 bg-gray-200 rounded">Space</kbd> to reveal words</p>
          )}
          {isBonusPhase && (
            <p>Press <kbd className="px-2 py-1 bg-gray-200 rounded">→</kbd> to advance</p>
          )}
        </footer>
      </div>
      </div>
    </div>
  );
}

/**
 * TopGuessDisplay - Shows the top guess from each team prominently
 */
function TopGuessDisplay({ guesses }: { guesses: TossupResponse[] }) {
  const { gameConfig, getTeamColor } = useGame();

  if (!gameConfig || guesses.length === 0) return null;

  // Helper to find player info
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

  // Find top guess for each team (highest confidence)
  const teamAGuesses = guesses.filter(g => getPlayerInfo(g.system)?.teamId === 'team_a');
  const teamBGuesses = guesses.filter(g => getPlayerInfo(g.system)?.teamId === 'team_b');

  const topGuessA = teamAGuesses.length > 0 
    ? teamAGuesses.reduce((max, g) => g.confidence > max.confidence ? g : max, teamAGuesses[0])
    : null;
  const topGuessB = teamBGuesses.length > 0 
    ? teamBGuesses.reduce((max, g) => g.confidence > max.confidence ? g : max, teamBGuesses[0])
    : null;

  const renderTopGuess = (guess: TossupResponse | null, teamId: 'team_a' | 'team_b') => {
    const teamColor = getTeamColor(teamId);
    const teamName = teamId === 'team_a' ? gameConfig.team_a.name : gameConfig.team_b.name;
    const playerInfo = guess ? getPlayerInfo(guess.system) : null;

    if (!guess) {
      return (
        <div className="bg-gray-100 rounded-lg p-4 text-center text-gray-400">
          No AI players on {teamName}
        </div>
      );
    }

    const confPercent = Math.round(guess.confidence * 100);
    const confColor = getConfidenceColor(guess.confidence);

    return (
      <div 
        className="rounded-lg p-4 border-2"
        style={{ borderColor: teamColor, backgroundColor: `${teamColor}10` }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: teamColor }}>
            {teamName} - Top Guess
          </span>
          <span 
            className="text-lg font-bold"
            style={{ color: confColor }}
          >
            {confPercent}%
          </span>
        </div>
        <div className="text-xs text-gray-500 mb-1">
          {playerInfo?.player.name || guess.system}
        </div>
        <div className="text-xl font-semibold text-gray-800">
          {guess.buzz ? guess.guess : '?????'}
          {guess.buzz && <span className="ml-2 text-red-500">🚨</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">Top AI Guesses</h2>
      <div className="grid grid-cols-2 gap-4">
        {renderTopGuess(topGuessA, 'team_a')}
        {renderTopGuess(topGuessB, 'team_b')}
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
