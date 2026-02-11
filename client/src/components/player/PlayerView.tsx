import { useGame } from '../../context/GameContext';
import type { Team, TeamId, Player, TossupResponse } from '../../../../shared/types';

/**
 * PlayerView - Read-only game display for spectators/players
 * 
 * Layout:
 * - Row 1: Team A panel (left) | Room info (center) | Team B panel (right)
 * - Row 2: Question display with AI outputs
 * 
 * Shows:
 * - Team panels with player names and mute status
 * - Current scores
 * - Question text (as revealed)
 * - Who buzzed and their guess
 * - Bonus questions with lead-in visible for all parts
 * - AI confidences (not guesses for tossups)
 * - Full AI model outputs with explanations
 */
export function PlayerView() {
  const { gameState, gameConfig, roomCode, leaveRoom, getPlayer, getTeamColor } = useGame();

  if (!gameConfig) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
        <div className="text-center">
          <div className="text-6xl mb-6">⏳</div>
          <h1 className="text-3xl font-bold mb-2">Waiting for Game</h1>
          <p className="text-gray-400 mb-4">
            Room Code: <span className="font-mono text-2xl text-blue-400">{roomCode}</span>
          </p>
          <p className="text-gray-500">The moderator is setting up the game...</p>
          <button
            onClick={leaveRoom}
            className="mt-8 px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            Leave Room
          </button>
        </div>
      </div>
    );
  }

  const buzzingPlayer = gameState.buzzingPlayer ? getPlayer(gameState.buzzingPlayer) : null;
  
  // Get the team of the buzzing player for color
  const getBuzzingPlayerTeam = (): 'team_a' | 'team_b' | null => {
    if (!gameState.buzzingPlayer || !gameConfig) return null;
    const inTeamA = gameConfig.team_a.players.some(p => p.player_id === gameState.buzzingPlayer);
    return inTeamA ? 'team_a' : 'team_b';
  };
  const buzzingTeam = getBuzzingPlayerTeam();
  const buzzTeamColor = buzzingTeam ? getTeamColor(buzzingTeam) : '#eab308'; // fallback to yellow

  const isTossupPhase = ['tossup_ready', 'tossup_streaming', 'answer_review'].includes(gameState.phase);
  const isBonusPhase = [
    'bonus_leadin',
    'bonus_part',
    'bonus_human_response',
    'bonus_final_answer',
  ].includes(gameState.phase);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Row 1: Team panels at corners with room info in center */}
      <div className="flex-shrink-0 p-4">
        <div className="max-w-7xl mx-auto grid grid-cols-3 gap-4">
          {/* Team A Panel (Left) */}
          <PlayerTeamPanel
            team={gameConfig.team_a}
            teamId="team_a"
            score={gameState.scores.team_a}
            buzzingPlayer={gameState.buzzingPlayer}
            mutedPlayers={gameState.mutedPlayers}
            teamColor={getTeamColor('team_a')}
          />

          {/* Center: Room info and question progress */}
          <div className="flex flex-col items-center justify-center">
            <div className="text-center mb-2">
              <div className="text-xs text-gray-500">Join Code</div>
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono text-xl text-blue-400 bg-gray-800 px-3 py-1 rounded tracking-wider">{roomCode}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(roomCode || '')}
                  className="text-gray-500 hover:text-blue-400 text-sm"
                  title="Copy code"
                >
                  📋
                </button>
              </div>
            </div>
            <div className="text-gray-400 text-sm">
              {isBonusPhase 
                ? `Bonus ${gameState.currentBonusNum} of ${gameState.totalBonuses}`
                : `Tossup ${gameState.currentTossupNum} of ${gameState.totalTossups}`
              }
            </div>
            <button
              onClick={leaveRoom}
              className="mt-2 text-gray-500 hover:text-white text-xs transition-colors"
            >
              Leave Room
            </button>
          </div>

          {/* Team B Panel (Right) */}
          <PlayerTeamPanel
            team={gameConfig.team_b}
            teamId="team_b"
            score={gameState.scores.team_b}
            buzzingPlayer={gameState.buzzingPlayer}
            mutedPlayers={gameState.mutedPlayers}
            teamColor={getTeamColor('team_b')}
          />
        </div>
      </div>

      {/* Row 2: Question display */}
      <div className="flex-1 overflow-auto p-4 pt-0">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Tossup display */}
          {isTossupPhase && (
            <div className="bg-gray-800 rounded-2xl p-6">
              {/* Power indicator */}
              {gameConfig.enable_power_points && gameState.tossupPointsValue > gameConfig.default_points_value && (
                <div className="text-center mb-4">
                  <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-sm">
                    ⚡ POWER ({gameState.tossupPointsValue} pts)
                  </span>
                </div>
              )}

              {/* Question text */}
              <div className="text-xl leading-relaxed text-gray-100">
                {gameState.revealedText || (
                  <span className="text-gray-500 italic">Waiting for question...</span>
                )}
                {gameState.phase === 'tossup_streaming' && (
                  <span className="inline-block w-2 h-5 ml-1 bg-blue-500 animate-pulse" />
                )}
              </div>

              {/* Word progress bar */}
              <div className="mt-4 flex items-center gap-2">
                <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-200"
                    style={{
                      width: `${gameState.totalWords > 0 ? (gameState.wordIndex / gameState.totalWords) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-gray-500">
                  {gameState.wordIndex}/{gameState.totalWords}
                </span>
              </div>

              {/* Answer line (when revealed) - rendered as HTML */}
              {gameState.currentTossupAnswer && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="text-sm text-green-400 mb-1">Answer:</div>
                  <div 
                    className="text-lg text-green-300 font-semibold"
                    dangerouslySetInnerHTML={{ __html: gameState.currentTossupAnswer }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Buzz indicator - uses team color */}
          {gameState.phase === 'answer_review' && buzzingPlayer && (
            <div 
              className="rounded-xl p-4 animate-pulse"
              style={{ 
                backgroundColor: `${buzzTeamColor}15`,
                border: `2px solid ${buzzTeamColor}` 
              }}
            >
              <div className="text-center">
                <div className="text-lg mb-1" style={{ color: buzzTeamColor }}>🔔 BUZZ!</div>
                <div className="text-xl font-bold text-white mb-1">
                  {buzzingPlayer.name}
                </div>
                {gameState.buzzingPlayerGuess && (
                  <div className="text-lg text-gray-300">
                    "{gameState.buzzingPlayerGuess}"
                  </div>
                )}
                <div className="text-sm text-gray-500 mt-2">
                  Awaiting moderator ruling...
                </div>
              </div>
            </div>
          )}

          {/* Bonus display */}
          {isBonusPhase && gameState.bonusQuestion && (
            <PlayerBonusDisplay />
          )}

          {/* AI Outputs - Tossup confidences only (no guesses) */}
          {isTossupPhase && gameState.currentGuesses.length > 0 && (
            <PlayerTossupConfidences guesses={gameState.currentGuesses} />
          )}

          {/* AI Outputs - Bonus responses with full explanation */}
          {isBonusPhase && gameState.bonusStage === 'final_answer' && gameState.bonusResponses.length > 0 && (
            <PlayerBonusResponses />
          )}

          {/* Game over */}
          {gameState.phase === 'game_over' && (
            <div className="text-center py-12 bg-gray-800 rounded-2xl">
              <h2 className="text-4xl font-bold mb-4">🎉 Game Over!</h2>
              <div className="text-2xl text-gray-400">
                Final Score: {gameState.scores.team_a} - {gameState.scores.team_b}
              </div>
              <div className="mt-4 text-xl">
                {gameState.scores.team_a > gameState.scores.team_b ? (
                  <span style={{ color: getTeamColor('team_a') }}>
                    {gameConfig.team_a.name} Wins!
                  </span>
                ) : gameState.scores.team_b > gameState.scores.team_a ? (
                  <span style={{ color: getTeamColor('team_b') }}>
                    {gameConfig.team_b.name} Wins!
                  </span>
                ) : (
                  <span className="text-gray-400">It's a Tie!</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Team panel for player view - shows team name, players, and mute status
 */
function PlayerTeamPanel({
  team,
  teamId,
  score,
  buzzingPlayer,
  mutedPlayers,
  teamColor,
}: {
  team: Team;
  teamId: TeamId;
  score: number;
  buzzingPlayer: string | null;
  mutedPlayers: string[];
  teamColor: string;
}) {
  const humanPlayers = team.players.filter((p) => p.type === 'human');
  const aiPlayers = team.players.filter((p) => p.type === 'ai');

  const renderPlayer = (player: Player) => {
    const isMuted = mutedPlayers.includes(player.player_id);
    const isBuzzing = buzzingPlayer === player.player_id;
    const buzzerKey = player.type === 'human' 
      ? (player.extra_kwargs as { buzzer_key: string }).buzzer_key 
      : null;

    return (
      <div
        key={player.player_id}
        className={`flex items-center gap-2 text-sm py-0.5 ${isBuzzing ? 'animate-pulse bg-yellow-500/20 rounded px-1 -mx-1' : ''}`}
      >
        <span className="text-xs">{player.type === 'human' ? '👤' : '🤖'}</span>
        {buzzerKey && (
          <span className="px-1 py-0.5 bg-gray-700 rounded text-xs font-mono text-gray-300">
            {buzzerKey}
          </span>
        )}
        <span className={`text-sm ${isMuted ? 'line-through text-gray-500' : 'text-gray-200'}`}>
          {player.name}
        </span>
        {isMuted && <span className="text-gray-500 text-xs">🔇</span>}
        {isBuzzing && <span className="text-yellow-400 text-xs">🚨</span>}
      </div>
    );
  };

  return (
    <div
      className="bg-gray-800 rounded-xl p-3"
      style={{ borderTop: `3px solid ${teamColor}` }}
    >
      {/* Team name and score in same row */}
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-base font-bold" style={{ color: teamColor }}>
          {team.name}
        </h3>
        <div
          className="text-3xl font-bold"
          style={{ color: teamColor }}
        >
          {score}
        </div>
      </div>

      {/* Players list - compact */}
      <div className="space-y-0.5">
        {humanPlayers.map(renderPlayer)}
        {aiPlayers.length > 0 && humanPlayers.length > 0 && (
          <div className="border-t border-gray-700 my-1" />
        )}
        {aiPlayers.map(renderPlayer)}
      </div>
    </div>
  );
}

/**
 * Tossup confidences display - shows only confidence levels, NOT guesses
 */
function PlayerTossupConfidences({ guesses }: { guesses: TossupResponse[] }) {
  const { gameConfig, getTeamColor } = useGame();

  if (!gameConfig) return null;

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

  const sortedGuesses = [...guesses].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">AI Confidence Levels</h3>
      <div className="grid grid-cols-2 gap-4">
        {/* Team A */}
        <div>
          <div
            className="text-xs font-medium mb-2"
            style={{ color: getTeamColor('team_a') }}
          >
            {gameConfig.team_a.name}
          </div>
          {gameConfig.team_a.players
            .filter(p => p.type === 'ai')
            .map(player => {
              const model = (player.extra_kwargs as { tossup_model: string }).tossup_model;
              const guess = sortedGuesses.find(g => g.system === model);
              const confColor = guess ? getConfidenceColor(guess.confidence) : '#888888';
              return (
                <div key={player.player_id} className="mb-2 p-2 bg-gray-900 rounded flex items-center justify-between">
                  <span className="text-sm text-gray-300">{player.name}</span>
                  <div className="flex items-center gap-2">
                    {guess?.buzz && <span className="text-red-400 text-xs">🚨</span>}
                    <span 
                      className="font-bold text-sm"
                      style={{ color: confColor }}
                    >
                      {guess ? `${Math.round(guess.confidence * 100)}%` : '-'}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Team B */}
        <div>
          <div
            className="text-xs font-medium mb-2"
            style={{ color: getTeamColor('team_b') }}
          >
            {gameConfig.team_b.name}
          </div>
          {gameConfig.team_b.players
            .filter(p => p.type === 'ai')
            .map(player => {
              const model = (player.extra_kwargs as { tossup_model: string }).tossup_model;
              const guess = sortedGuesses.find(g => g.system === model);
              const confColor = guess ? getConfidenceColor(guess.confidence) : '#888888';
              return (
                <div key={player.player_id} className="mb-2 p-2 bg-gray-900 rounded flex items-center justify-between">
                  <span className="text-sm text-gray-300">{player.name}</span>
                  <div className="flex items-center gap-2">
                    {guess?.buzz && <span className="text-red-400 text-xs">🚨</span>}
                    <span 
                      className="font-bold text-sm"
                      style={{ color: confColor }}
                    >
                      {guess ? `${Math.round(guess.confidence * 100)}%` : '-'}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

/**
 * Bonus display for player view - shows lead-in for ALL parts
 */
function PlayerBonusDisplay() {
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

  const currentPart = gameState.currentBonusPart;
  const totalParts = bonus.parts.length;
  const showPart = gameState.bonusStage !== 'leadin';

  return (
    <div className="bg-gray-800 rounded-2xl overflow-hidden">
      {/* Bonus header */}
      <div
        className="p-3 text-white text-center"
        style={{ backgroundColor: teamColor }}
      >
        <h3 className="text-lg font-bold">BONUS for {teamName}</h3>
      </div>

      <div className="p-6 space-y-4">
        {/* Lead-in - ALWAYS visible for all parts */}
        <div 
          className="text-lg text-gray-200 pb-4 border-b border-gray-700 bg-gray-900/50 p-4 rounded-lg"
          style={{ borderLeft: `4px solid ${teamColor}` }}
        >
          <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Lead-in</div>
          {bonus.leadin}
        </div>

        {/* Current part */}
        {showPart && currentPart < totalParts && (
          <div>
            <div 
              className="text-sm font-semibold mb-2 px-3 py-1 rounded inline-block"
              style={{ backgroundColor: teamColor, color: 'white' }}
            >
              Part {currentPart + 1} of {totalParts} ({gameConfig.bonus_part_points} pts)
            </div>
            <div className="text-xl text-gray-100 mt-2">
              {bonus.parts[currentPart]?.text}
            </div>

            {/* Answer line (rendered as HTML) */}
            {gameState.currentBonusPartAnswer && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <div className="text-sm text-green-400 mb-1">Answer:</div>
                <div 
                  className="text-lg text-green-300 font-semibold"
                  dangerouslySetInnerHTML={{ __html: gameState.currentBonusPartAnswer }}
                />
              </div>
            )}
          </div>
        )}

        {/* Progress indicator */}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-700">
          <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{ 
                width: `${((currentPart + 1) / totalParts) * 100}%`, 
                backgroundColor: teamColor 
              }}
            />
          </div>
          <span className="text-sm text-gray-500">
            {Math.min(currentPart + 1, totalParts)}/{totalParts}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Bonus responses display - shows full AI outputs with explanations
 */
function PlayerBonusResponses() {
  const { gameState, gameConfig, getTeamColor } = useGame();

  if (!gameConfig || !gameState.bonusOwner) return null;

  const teamColor = getTeamColor(gameState.bonusOwner);

  const getPlayerName = (systemName: string): string => {
    const team = gameState.bonusOwner === 'team_a' ? gameConfig.team_a : gameConfig.team_b;
    for (const player of team.players) {
      if (player.type === 'ai') {
        const kwargs = player.extra_kwargs as { bonus_model: string };
        if (kwargs.bonus_model === systemName) {
          return player.name;
        }
      }
    }
    return systemName;
  };

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">AI Model Outputs</h3>
      <div className="space-y-3">
        {gameState.bonusResponses.map((response, idx) => {
          const confColor = getConfidenceColor(response.confidence);
          const playerName = getPlayerName(response.system);

          return (
            <div
              key={idx}
              className="bg-gray-900 p-4 rounded-lg"
            >
              {/* Header: Player name and confidence */}
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold" style={{ color: teamColor }}>
                  {playerName}
                </span>
                <span className="font-bold" style={{ color: confColor }}>
                  {Math.round(response.confidence * 100)}%
                </span>
              </div>

              {/* Guess */}
              <div className="mb-2">
                <span className="text-xs text-gray-500">Guess: </span>
                <span className="text-blue-400 font-medium">{response.guess}</span>
              </div>

              {/* Full explanation */}
              {response.explanation && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Explanation:</div>
                  <div className="text-sm text-gray-300 font-mono whitespace-pre-wrap bg-gray-950 p-2 rounded max-h-32 overflow-y-auto">
                    {response.explanation}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return '#22c55e'; // Green
  if (confidence >= 0.8) return '#84cc16'; // Lime
  if (confidence >= 0.6) return '#eab308'; // Yellow
  if (confidence >= 0.5) return '#f97316'; // Orange
  return '#6b7280'; // Gray
}
