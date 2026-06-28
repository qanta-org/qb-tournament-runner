import { useEffect, useState } from 'react';
import { useGame } from '../../context/GameContext';
import type { Team, TeamId, Player, TossupResponse, AIBuzzMode, AIPlayerKwargs } from '../../../../shared/types';
import { bonusSystemLabelForOwner, tossupModelLabel } from '../../../../shared/modelLabels';
import { BONUS_AI_EXPLANATION_MAX_WORDS } from '../../constants/playerView';
import { truncateWords } from '../../utils/text';
import { maxAiTossupPoints } from '../../utils/aiScoring';
import { bonusConsultPoints } from '../../../../shared/scoring';
import {
  MS_PER_SECOND,
  REVEAL_LOCKOUT_SECONDS_DECIMALS,
  REVEAL_LOCKOUT_TICK_INTERVAL_MS,
} from '../../constants/time';

/**
 * PlayerView - Read-only game display for spectators/players
 *
 * Layout (fixed 3-column grid, center never shifts):
 *   Left column  : Team A panel, then Team A AI outputs (tossup confidences / bonus suggestions)
 *   Center column: Question type/number header + question content (tossup or bonus)
 *   Right column : Team B panel, then Team B AI outputs
 */
export function PlayerView() {
  const { gameState, gameConfig, roomCode, leaveRoom, getPlayer, getTeamColor } = useGame();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!gameState.revealLockoutUntilMs) return;
    const interval = window.setInterval(() => setNowMs(Date.now()), REVEAL_LOCKOUT_TICK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [gameState.revealLockoutUntilMs]);

  // Warm the browser cache with every image in the current tossup so each one
  // paints the instant its token is revealed (large packet images otherwise pop
  // in a token late on remote displays). Preloading only fetches into cache; the
  // images are still displayed solely when their token is revealed.
  const tossupImageKey = gameState.tossupImageUrls.join('|');
  useEffect(() => {
    if (!tossupImageKey) return;
    for (const url of tossupImageKey.split('|')) {
      const img = new Image();
      img.src = url;
    }
  }, [tossupImageKey]);

  if (!gameConfig) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center p-8">
        <div className="text-center">
          <div className="text-6xl mb-6">⏳</div>
          <h1 className="text-3xl font-bold mb-2">Waiting for Game</h1>
          <p className="text-gray-600 mb-4">
            Room Code: <span className="font-mono text-2xl text-blue-600">{roomCode}</span>
          </p>
          <p className="text-gray-500">The moderator is setting up the game...</p>
          <button
            onClick={leaveRoom}
            className="mt-8 px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
          >
            Leave Room
          </button>
        </div>
      </div>
    );
  }

  const buzzingPlayer = gameState.buzzingPlayer ? getPlayer(gameState.buzzingPlayer) : null;

  const getBuzzingPlayerTeam = (): 'team_a' | 'team_b' | null => {
    if (!gameState.buzzingPlayer || !gameConfig) return null;
    const inTeamA = gameConfig.team_a.players.some(p => p.player_id === gameState.buzzingPlayer);
    return inTeamA ? 'team_a' : 'team_b';
  };
  const buzzingTeam = getBuzzingPlayerTeam();
  const buzzTeamColor = buzzingTeam ? getTeamColor(buzzingTeam) : '#eab308';

  const isTossupPhase = ['tossup_ready', 'tossup_streaming', 'answer_review'].includes(gameState.phase);
  const isBonusPhase = [
    'bonus_leadin',
    'bonus_part',
    'bonus_part_reveal',
    'bonus_human_response',
    'bonus_final_answer',
  ].includes(gameState.phase);

  const bonusOwner = gameState.bonusOwner;

  const lockoutRemainingMs = Math.max(0, (gameState.revealLockoutUntilMs ?? 0) - nowMs);
  const revealedTokens = gameState.revealedTossupTokens;
  const renderableRevealedTokens = revealedTokens.filter(
    (token) => token.kind === 'text' || (token.kind === 'multimodal' && token.tokenType !== 'delay')
  );
  const lastRevealedImageToken = (() => {
    for (let i = revealedTokens.length - 1; i >= 0; i--) {
      const token = revealedTokens[i];
      if (token.kind === 'multimodal' && token.tokenType === 'img') return token;
    }
    return null;
  })();

  const playAudioToken = (assetUrl?: string) => {
    if (!assetUrl) return;
    const audio = new Audio(assetUrl);
    void audio.play();
  };

  const showBonusResponsesForTeam = (teamId: TeamId) =>
    isBonusPhase &&
    bonusOwner === teamId &&
    gameState.bonusAiRevealed &&
    gameState.bonusResponses.length > 0;

  return (
    <div className="pv-screen">
      {/* Full-width 3-column grid — proportions fixed so center never shifts */}
      <div
        className="w-full max-w-screen-2xl mx-auto min-h-screen grid gap-3 p-3"
        style={{ gridTemplateColumns: '22% 1fr 22%' }}
      >
        {/* ── LEFT COLUMN: Team A ── */}
        <div className="flex flex-col gap-3 min-w-0">
          <PlayerTeamPanel
            team={gameConfig.team_a}
            teamId="team_a"
            score={gameState.scores.team_a}
            buzzingPlayer={gameState.buzzingPlayer}
            aiBuzzModes={gameState.aiBuzzModes}
            teamColor={getTeamColor('team_a')}
          />

          {/* Team A tossup AI confidences */}
          {isTossupPhase && gameState.currentGuesses.length > 0 && (
            <TeamTossupConfidences
              teamId="team_a"
              guesses={gameState.currentGuesses}
              buzzingPlayer={gameState.buzzingPlayer}
            />
          )}

          {/* Team A bonus AI suggestions */}
          {showBonusResponsesForTeam('team_a') && (
            <PlayerBonusResponses />
          )}
        </div>

        {/* ── CENTER COLUMN: Question content ── */}
        <div className="flex flex-col gap-3 min-w-0">
          {/* Header: question type + number */}
          <div className="flex items-center justify-between px-1 pt-1">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-widest">
                {isBonusPhase ? 'Bonus Question' : 'Tossup Question'}
              </div>
              <div className="text-base text-gray-700 font-medium">
                {isBonusPhase
                  ? `Bonus ${gameState.currentBonusNum} of ${gameState.totalBonuses}`
                  : `Tossup ${gameState.currentTossupNum} of ${gameState.totalTossups}`}
              </div>
            </div>
            <button
              onClick={leaveRoom}
              className="text-gray-400 hover:text-gray-700 text-xs transition-colors"
            >
              Leave
            </button>
          </div>

          {/* Tossup question */}
          {isTossupPhase && (
            <div className="pv-question-card">
              {gameConfig.enable_power_points && gameState.tossupPointsValue > gameConfig.default_points_value && (
                <div className="text-center mb-4">
                  <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm">
                    ⚡ POWER ({gameState.tossupPointsValue} pts)
                  </span>
                </div>
              )}

              <div className="text-xl leading-relaxed text-gray-900 flex flex-wrap items-center gap-x-2 gap-y-2">
                {renderableRevealedTokens.length > 0 ? (
                  renderableRevealedTokens.map((token, index) => {
                    if (token.kind === 'text') {
                      return <span key={index}>{token.text}</span>;
                    }
                    if (token.tokenType === 'audio') {
                      return (
                        <span
                          key={index}
                          title={token.hash || ''}
                          className="pv-token-audio"
                        >
                          <button
                            type="button"
                            onClick={() => playAudioToken(token.assetUrl)}
                            className="h-4 w-4 rounded-full text-[10px] leading-none bg-emerald-500 text-white hover:bg-emerald-400"
                            aria-label={`Play ${token.displayText || 'audio clip'}`}
                          >
                            ▶
                          </button>
                          <span>{token.displayText || '[AUDIO]'}</span>
                        </span>
                      );
                    }
                    return (
                      <span
                        key={index}
                        title={token.hash || ''}
                        className="pv-token-img"
                      >
                        [IMG]
                      </span>
                    );
                  })
                ) : (
                  <span className="text-gray-400 italic">Waiting for question...</span>
                )}
                {gameState.phase === 'tossup_streaming' && (
                  <span className="inline-block w-2 h-5 ml-1 bg-blue-500 animate-pulse" />
                )}
              </div>

              {lockoutRemainingMs > 0 && (
                <div className="mt-3 text-amber-600 text-sm">
                  Next token unlocks in {(lockoutRemainingMs / MS_PER_SECOND).toFixed(REVEAL_LOCKOUT_SECONDS_DECIMALS)}s
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-200"
                    style={{
                      width: `${gameState.totalTokens > 0 ? (gameState.tokenIndex / gameState.totalTokens) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-gray-500">
                  {gameState.tokenIndex}/{gameState.totalTokens}
                </span>
              </div>

              {gameState.currentTossupAnswer && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="text-sm text-green-600 mb-1">Answer:</div>
                  <div
                    className="text-lg text-green-700 font-semibold"
                    dangerouslySetInnerHTML={{ __html: gameState.currentTossupAnswer }}
                  />
                </div>
              )}

              {lastRevealedImageToken && (
                <div className="mt-6 flex flex-col items-center">
                  <div className="pv-section-label text-gray-500 mb-2 w-full">
                    Image
                  </div>
                  <div className="pv-image-frame">
                    <img
                      key={lastRevealedImageToken.assetUrl}
                      src={lastRevealedImageToken.assetUrl}
                      alt={lastRevealedImageToken.hash || 'multimodal image'}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Buzz indicator */}
          {gameState.phase === 'answer_review' && buzzingPlayer && (
            <div
              className="rounded-xl p-4 animate-pulse"
              style={{
                backgroundColor: `${buzzTeamColor}15`,
                border: `2px solid ${buzzTeamColor}`,
              }}
            >
              <div className="text-center">
                <div className="text-lg mb-1" style={{ color: buzzTeamColor }}>🔔 BUZZ!</div>
                <div className="text-xl font-bold text-gray-900 mb-1">{buzzingPlayer.name}</div>
                {gameState.buzzingPlayerGuess && (
                  <div className="text-lg text-gray-700">"{gameState.buzzingPlayerGuess}"</div>
                )}
                <div className="text-sm text-gray-500 mt-2">Awaiting moderator ruling...</div>
              </div>
            </div>
          )}

          {/* Bonus question */}
          {isBonusPhase && gameState.bonusQuestion && <PlayerBonusDisplay />}

          {/* Game over */}
          {gameState.phase === 'game_over' && (
            <div className="pv-gameover-card">
              <h2 className="text-4xl font-bold mb-4">🎉 Game Over!</h2>
              <div className="text-2xl text-gray-600">
                Final Score: {gameState.scores.team_a} – {gameState.scores.team_b}
              </div>
              <div className="mt-4 text-xl">
                {gameState.scores.team_a > gameState.scores.team_b ? (
                  <span style={{ color: getTeamColor('team_a') }}>{gameConfig.team_a.name} Wins!</span>
                ) : gameState.scores.team_b > gameState.scores.team_a ? (
                  <span style={{ color: getTeamColor('team_b') }}>{gameConfig.team_b.name} Wins!</span>
                ) : (
                  <span className="text-gray-600">It's a Tie!</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN: Team B ── */}
        <div className="flex flex-col gap-3 min-w-0">
          <PlayerTeamPanel
            team={gameConfig.team_b}
            teamId="team_b"
            score={gameState.scores.team_b}
            buzzingPlayer={gameState.buzzingPlayer}
            aiBuzzModes={gameState.aiBuzzModes}
            teamColor={getTeamColor('team_b')}
          />

          {/* Team B tossup AI confidences */}
          {isTossupPhase && gameState.currentGuesses.length > 0 && (
            <TeamTossupConfidences
              teamId="team_b"
              guesses={gameState.currentGuesses}
              buzzingPlayer={gameState.buzzingPlayer}
            />
          )}

          {/* Team B bonus AI suggestions */}
          {showBonusResponsesForTeam('team_b') && (
            <PlayerBonusResponses />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Team panel
// ─────────────────────────────────────────────────────────────────────────────

function PlayerTeamPanel({
  team,
  teamId,
  score,
  buzzingPlayer,
  aiBuzzModes,
  teamColor,
}: {
  team: Team;
  teamId: TeamId;
  score: number;
  buzzingPlayer: string | null;
  aiBuzzModes: Record<string, AIBuzzMode>;
  teamColor: string;
}) {
  const { gameConfig } = useGame();
  const humanPlayers = team.players.filter((p) => p.type === 'human');
  const aiPlayers = team.players.filter((p) => p.type === 'ai');

  const consultPoints = gameConfig ? bonusConsultPoints(gameConfig, team.players) : null;

  const renderPlayer = (player: Player) => {
    const mode = player.type === 'ai' ? aiBuzzModes[player.player_id] ?? 'autonomous' : 'autonomous';
    const isMuted = player.type === 'ai' && mode === 'muted';
    const isSemi = player.type === 'ai' && mode === 'semi';
    const isBuzzing = buzzingPlayer === player.player_id;
    const buzzerKey =
      player.type === 'human'
        ? (player.extra_kwargs as { buzzer_key: string }).buzzer_key
        : null;
    const maxPoints =
      player.type === 'ai' && gameConfig ? maxAiTossupPoints(gameConfig, player) : null;

    return (
      <div
        key={player.player_id}
        className={`flex items-center gap-2 py-0.5 ${isBuzzing ? 'animate-pulse bg-yellow-100 rounded px-1 -mx-1' : ''}`}
      >
        <span className="text-sm">{player.type === 'human' ? '👤' : '🤖'}</span>
        {buzzerKey && (
          <span className="pv-key-chip">
            {buzzerKey}
          </span>
        )}
        <span className={`text-base leading-snug ${isMuted ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {player.name}
        </span>
        {maxPoints !== null && (
          <span
            className="pv-points-badge"
            title="Maximum tossup points this model can score"
          >
            {maxPoints} pts
          </span>
        )}
        {isMuted && <span className="text-gray-400 text-xs ml-auto">🔇</span>}
        {isSemi && <span className="text-blue-500 text-xs ml-auto" title="Semi-autonomous">🎮</span>}
        {isBuzzing && <span className="text-yellow-500 text-xs ml-auto">🚨</span>}
      </div>
    );
  };

  // Suppress unused variable warning — teamId may be used by callers for layout decisions
  void teamId;

  return (
    <div
      className="pv-team-panel"
      style={{ borderTop: `4px solid ${teamColor}` }}
    >
      {/* Team name + score */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xl font-bold truncate pr-2" style={{ color: teamColor }}>
          {team.name}
        </h3>
        <div className="text-5xl font-bold tabular-nums shrink-0" style={{ color: teamColor }}>
          {score}
        </div>
      </div>

      <div className="space-y-0.5">
        {humanPlayers.map(renderPlayer)}
        {aiPlayers.length > 0 && humanPlayers.length > 0 && (
          <div className="border-t border-gray-200 my-1.5" />
        )}
        {aiPlayers.map(renderPlayer)}
      </div>

      {/* Per-team bonus consult cap (team aggregate, not per-agent) */}
      {aiPlayers.length > 0 && consultPoints !== null && (
        <div className="mt-1.5">
          <span
            className="pv-points-badge"
            title="Points per bonus part if this team consults its AI"
          >
            Bonus consult: +{consultPoints} / part
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-team tossup AI confidence panel (goes in side column)
// ─────────────────────────────────────────────────────────────────────────────

function TeamTossupConfidences({
  teamId,
  guesses,
  buzzingPlayer,
}: {
  teamId: TeamId;
  guesses: TossupResponse[];
  buzzingPlayer: string | null;
}) {
  const { gameConfig, getTeamColor } = useGame();
  if (!gameConfig) return null;

  const team = teamId === 'team_a' ? gameConfig.team_a : gameConfig.team_b;
  const aiPlayers = team.players.filter((p) => p.type === 'ai');
  if (aiPlayers.length === 0) return null;

  const teamColor = getTeamColor(teamId);

  return (
    <div className="pv-side-panel">
      <div className="pv-section-label mb-2" style={{ color: teamColor }}>
        AI Confidence
      </div>
      <div className="space-y-1.5">
        {aiPlayers.map((player) => {
          const kwargs = player.extra_kwargs as AIPlayerKwargs;
          const guess = guesses.find((g) => g.system === kwargs.tossup_model);
          const confColor = guess ? getConfidenceColor(guess.confidence) : '#888888';
          return (
            <div
              key={player.player_id}
              className="pv-conf-row"
            >
              <div className="min-w-0 pr-2">
                <div className="text-sm text-gray-700 truncate">{player.name}</div>
                <div className="text-[11px] text-gray-400 truncate">{tossupModelLabel(kwargs)}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {buzzingPlayer === player.player_id && (
                  <span className="text-red-500 text-xs">🚨</span>
                )}
                <span className="font-bold text-sm" style={{ color: confColor }}>
                  {guess ? `${Math.round(guess.confidence * 100)}%` : '–'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bonus question display (center column)
// ─────────────────────────────────────────────────────────────────────────────

function PlayerBonusDisplay() {
  const { gameState, gameConfig, getTeamColor } = useGame();

  if (!gameConfig || !gameState.bonusQuestion || !gameState.bonusOwner) return null;

  const bonus = gameState.bonusQuestion;
  const teamColor = getTeamColor(gameState.bonusOwner);
  const teamName =
    gameState.bonusOwner === 'team_a' ? gameConfig.team_a.name : gameConfig.team_b.name;

  const currentPart = gameState.currentBonusPart;
  const totalParts = bonus.parts.length;
  const showPart = gameState.bonusStage !== 'leadin';
  const isReveal = gameState.phase === 'bonus_part_reveal';
  const answerImageUrl = bonus.parts[currentPart]?.answerMedia?.imageUrl;

  return (
    <div className="pv-bonus-card">
      <div className="p-3 text-white text-center" style={{ backgroundColor: teamColor }}>
        <h3 className="text-lg font-bold">BONUS for {teamName}</h3>
      </div>

      <div className="p-6 space-y-4">
        {/* Lead-in */}
        <div
          className="text-lg text-gray-700 pv-inset p-4"
          style={{ borderLeft: `4px solid ${teamColor}` }}
        >
          <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Lead-in</div>
          <div>{bonus.leadin}</div>
          {bonus.leadinMedia?.audioUrl && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  const audio = new Audio(bonus.leadinMedia!.audioUrl!);
                  audio.play().catch(() => {});
                }}
                className="pv-audio-btn"
              >
                <span>▶</span>
                <span>{bonus.leadinMedia.audioDisplayText || 'Play audio'}</span>
              </button>
            </div>
          )}
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
            <div className="space-y-3 mt-2">
              <div className="text-xl text-gray-900">{bonus.parts[currentPart]?.text}</div>
              {bonus.parts[currentPart].media?.audioUrl && (
                <button
                  type="button"
                  onClick={() => {
                    const audio = new Audio(bonus.parts[currentPart].media!.audioUrl!);
                    audio.play().catch(() => {});
                  }}
                  className="pv-audio-btn"
                >
                  <span>▶</span>
                  <span>{bonus.parts[currentPart].media!.audioDisplayText || 'Play audio'}</span>
                </button>
              )}
            </div>
            {gameState.currentBonusPartAnswer && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="text-sm text-green-600 mb-1">Answer:</div>
                <div
                  className="text-lg text-green-700 font-semibold"
                  dangerouslySetInnerHTML={{ __html: gameState.currentBonusPartAnswer }}
                />
              </div>
            )}
          </div>
        )}

        {/* Image — shows the answer image in the same box during the per-part reveal */}
        {(() => {
          const leadinImg = bonus.leadinMedia?.imageUrl;
          const partImg =
            showPart && currentPart < totalParts ? bonus.parts[currentPart].media?.imageUrl : undefined;
          const showAnswerImg = isReveal && !!answerImageUrl;
          const displayImg = showAnswerImg ? answerImageUrl : partImg ?? leadinImg;
          if (!displayImg) return null;
          return (
            <div className="flex flex-col items-center">
              <div
                className={`pv-section-label mb-2 w-full ${
                  showAnswerImg ? 'text-green-600' : 'text-gray-500'
                }`}
              >
                {showAnswerImg ? 'Answer Image' : 'Image'}
              </div>
              <div
                className={`pv-image-frame ${
                  showAnswerImg ? 'border-green-400' : 'border-gray-200'
                }`}
              >
                <img
                  src={displayImg}
                  alt={
                    showAnswerImg
                      ? `Bonus part ${currentPart + 1} answer image`
                      : partImg
                        ? `Bonus part ${currentPart + 1} image`
                        : 'Bonus lead-in image'
                  }
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            </div>
          );
        })()}

        {/* Progress bar */}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${((currentPart + 1) / totalParts) * 100}%`,
                backgroundColor: teamColor,
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

// ─────────────────────────────────────────────────────────────────────────────
// Bonus AI responses panel (side columns)
// ─────────────────────────────────────────────────────────────────────────────

function PlayerBonusResponses() {
  const { gameState, gameConfig, getTeamColor } = useGame();

  if (!gameConfig || !gameState.bonusOwner) return null;

  const teamColor = getTeamColor(gameState.bonusOwner);
  const bonusOwner = gameState.bonusOwner;

  return (
    <div className="pv-side-panel">
      <div
        className="pv-section-label mb-3"
        style={{ color: teamColor }}
      >
        AI Suggestion
      </div>
      <div className="space-y-2">
        {gameState.bonusResponses.map((response, idx) => {
          const confColor = getConfidenceColor(response.confidence);
          const bonusName = bonusSystemLabelForOwner(
            response.system,
            bonusOwner,
            gameConfig.team_a,
            gameConfig.team_b
          );
          const explanationText = response.explanation
            ? truncateWords(response.explanation, BONUS_AI_EXPLANATION_MAX_WORDS)
            : '';

          return (
            <div key={idx} className="pv-inset p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-sm" style={{ color: teamColor }}>
                  {bonusName}
                </span>
                <span className="font-bold text-sm" style={{ color: confColor }}>
                  {Math.round(response.confidence * 100)}%
                </span>
              </div>
              <div className="mb-1">
                <span className="text-xs text-gray-500">Guess: </span>
                <span className="text-blue-600 font-semibold text-base">
                  {response.guess}
                </span>
              </div>
              {response.explanation && (
                <div className="mt-1.5 pt-1.5 border-t border-gray-200">
                  <div className="text-xs text-gray-500 mb-1">Explanation:</div>
                  <div className="text-xs text-gray-700 font-mono whitespace-pre-wrap bg-gray-200 p-2 rounded">
                    {explanationText}
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
  if (confidence >= 0.9) return '#16a34a';
  if (confidence >= 0.8) return '#65a30d';
  if (confidence >= 0.6) return '#ca8a04';
  if (confidence >= 0.5) return '#ea580c';
  return '#6b7280';
}
