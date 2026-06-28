import { useEffect, useState } from 'react';
import { useGame } from '../../context/GameContext';
import {
  MS_PER_SECOND,
  REVEAL_LOCKOUT_SECONDS_DECIMALS,
  REVEAL_LOCKOUT_TICK_INTERVAL_MS,
} from '../../constants/time';

/**
 * QuestionDisplay - Moderator's tossup question display
 *
 * Shows all revealable tokens with:
 * - Revealed tokens: fully visible
 * - Unrevealed tokens: grayed out
 */
export function QuestionDisplay() {
  const { gameState, gameConfig } = useGame();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!gameState.revealLockoutUntilMs) return;
    const interval = window.setInterval(() => setNowMs(Date.now()), REVEAL_LOCKOUT_TICK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [gameState.revealLockoutUntilMs]);

  // Warm the browser cache with every image in the current tossup so each one
  // paints the instant its token is revealed instead of downloading on reveal.
  const tossupImageKey = gameState.tossupImageUrls.join('|');
  useEffect(() => {
    if (!tossupImageKey) return;
    for (const url of tossupImageKey.split('|')) {
      const img = new Image();
      img.src = url;
    }
  }, [tossupImageKey]);

  if (!gameConfig) return null;

  // Progress percentage
  const progress =
    gameState.totalTokens > 0
      ? Math.round((gameState.tokenIndex / gameState.totalTokens) * 100)
      : 0;
  const lockoutRemainingMs = Math.max(0, (gameState.revealLockoutUntilMs ?? 0) - nowMs);
  const lockoutRemainingSec = (lockoutRemainingMs / MS_PER_SECOND).toFixed(REVEAL_LOCKOUT_SECONDS_DECIMALS);

  // Power indicator
  const isPowerPhase =
    gameConfig.enable_power_points &&
    gameState.tossupPointsValue === gameConfig.power_points_value;

  const fullTokens = gameState.fullTossupTokens || [];
  const renderableTokens = fullTokens
    .map((token, index) => ({ token, index }))
    .filter(
      ({ token }) =>
        token.kind === 'text' || (token.kind === 'multimodal' && token.tokenType !== 'delay')
    );
  const revealedCount = gameState.tokenIndex;
  // For moderator UX, treat the *current* spoken token as the highlighted one,
  // and everything before it as fully revealed. This keeps moderator highlight
  // in sync with what players see on their screen.
  const currentTokenIndex = revealedCount > 0 ? revealedCount - 1 : -1;
  const lastRevealedImageToken = (() => {
    const start = Math.min(revealedCount, fullTokens.length) - 1;
    for (let i = start; i >= 0; i--) {
      const token = fullTokens[i];
      if (token.kind === 'multimodal' && token.tokenType === 'img') {
        return token;
      }
    }
    return null;
  })();

  const playAudioToken = (assetUrl?: string) => {
    if (!assetUrl) return;
    const audio = new Audio(assetUrl);
    void audio.play();
  };

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
          {gameState.tokenIndex}/{gameState.totalTokens}
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

      {lockoutRemainingMs > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-amber-800 text-sm">
          Next token locked for {lockoutRemainingSec}s
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-4">
        {/* Question text - Full preview for moderator */}
        <div className="bg-gray-50 rounded-lg p-6 border-l-4 border-blue-500">
          <p className="question-text leading-relaxed text-lg">
            {renderableTokens.length > 0 ? (
              renderableTokens.map(({ token, index }, displayIndex) => {
                const isCurrentToken = index === currentTokenIndex;
                const isPastToken = index < currentTokenIndex;

                if (token.kind === 'text') {
                  return (
                    <span key={index} className="transition-colors duration-150">
                      <span
                        className={`${
                          isCurrentToken
                            ? 'text-gray-900 font-semibold bg-yellow-50 px-1 rounded'
                            : isPastToken
                              ? 'text-gray-900 font-medium'
                              : 'text-gray-300'
                        }`}
                      >
                        {token.text}
                      </span>
                      {displayIndex < renderableTokens.length - 1 ? ' ' : ''}
                    </span>
                  );
                }

                if (token.tokenType === 'audio') {
                  const isRevealed = isPastToken || isCurrentToken;
                  return (
                    <span key={index} className="transition-colors duration-150">
                      <span
                        title={token.hash || ''}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          isCurrentToken
                            ? 'bg-yellow-50 text-emerald-700 border-yellow-200'
                            : isPastToken
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                              : 'bg-gray-100 text-gray-400 border-gray-200'
                        }`}
                      >
                        <button
                          type="button"
                          disabled={!isPastToken && !isCurrentToken}
                          onClick={() => playAudioToken(token.assetUrl)}
                          className={`h-4 w-4 rounded-full text-[10px] leading-none ${
                            isRevealed
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                          aria-label={`Play ${token.displayText || 'audio clip'}`}
                        >
                          ▶
                        </button>
                        <span>{token.displayText || '[AUDIO]'}</span>
                      </span>
                      {displayIndex < renderableTokens.length - 1 ? ' ' : ''}
                    </span>
                  );
                }

                return (
                  <span key={index} className="transition-colors duration-150">
                    <span
                      title={token.hash || ''}
                      className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                        isCurrentToken
                          ? 'bg-yellow-50 text-indigo-700 border-yellow-200'
                          : isPastToken
                            ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                            : 'bg-gray-100 text-gray-400 border-gray-200'
                      }`}
                    >
                      [IMG]
                    </span>
                    {displayIndex < renderableTokens.length - 1 ? ' ' : ''}
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

        {/* Right-side sticky image frame */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            Image
          </div>
          {lastRevealedImageToken ? (
            <div className="flex-1 min-h-[260px] max-h-[320px] border border-slate-200 rounded bg-white flex items-center justify-center overflow-hidden">
              <img
                key={lastRevealedImageToken.assetUrl}
                src={lastRevealedImageToken.assetUrl}
                alt={lastRevealedImageToken.hash || 'multimodal image'}
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="flex-1 min-h-[260px] border border-dashed border-slate-300 rounded bg-white/70 flex items-center justify-center text-sm text-slate-400">
              No revealed image
            </div>
          )}
        </div>
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
