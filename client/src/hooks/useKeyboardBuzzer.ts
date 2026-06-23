import { useEffect, useCallback } from 'react';
import { useGame } from '../context/GameContext';

/**
 * Hook that handles keyboard-based buzzing and navigation
 */
export function useKeyboardBuzzer() {
  const { gameState, gameConfig, buzz, nextWord, advanceBonusStage, advanceBonusPart } = useGame();

  // Build buzzer key map from human players
  const buzzerKeyMap = useCallback((): Record<string, string> => {
    if (!gameConfig) return {};

    const map: Record<string, string> = {};

    for (const player of gameConfig.team_a.players) {
      if (player.type === 'human') {
        const kwargs = player.extra_kwargs as { buzzer_key: string };
        map[kwargs.buzzer_key.toUpperCase()] = player.player_id;
      }
    }

    for (const player of gameConfig.team_b.players) {
      if (player.type === 'human') {
        const kwargs = player.extra_kwargs as { buzzer_key: string };
        map[kwargs.buzzer_key.toUpperCase()] = player.player_id;
      }
    }

    return map;
  }, [gameConfig]);

  useEffect(() => {
    if (!gameConfig) return;

    const keyMap = buzzerKeyMap();
    const isTossupPhase = ['tossup_ready', 'tossup_streaming'].includes(gameState.phase);
    const isBonusLeadin = gameState.phase === 'bonus_leadin';
    const isBonusPartReveal = gameState.phase === 'bonus_part_reveal';

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key.toUpperCase();

      // Handle human buzzer keys during tossup
      if (isTossupPhase && keyMap[key]) {
        e.preventDefault();
        const playerId = keyMap[key];

        // Check if player's team has already buzzed
        const playerTeam = getPlayerTeam(playerId, gameConfig);
        if (playerTeam && !gameState.teamBuzzed[playerTeam]) {
          buzz(playerId);
        }
        return;
      }

      // Handle arrow right / space for word reveal (tossup manual mode)
      const isRevealLocked =
        !!gameState.revealLockoutUntilMs && Date.now() < gameState.revealLockoutUntilMs;
      if (
        (e.key === 'ArrowRight' || e.key === ' ') &&
        isTossupPhase &&
        !gameConfig.auto_stream &&
        !isRevealLocked
      ) {
        e.preventDefault();
        nextWord();
        return;
      }

      // Handle arrow right for bonus lead-in advancement (to first part)
      if (e.key === 'ArrowRight' && isBonusLeadin) {
        e.preventDefault();
        advanceBonusStage();
        return;
      }

      // Handle arrow right to advance from the per-part reveal screen
      if (e.key === 'ArrowRight' && isBonusPartReveal) {
        e.preventDefault();
        advanceBonusPart();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    gameConfig,
    gameState.phase,
    gameState.bonusStage,
    gameState.teamBuzzed,
    gameState.revealLockoutUntilMs,
    buzzerKeyMap,
    buzz,
    nextWord,
    advanceBonusStage,
    advanceBonusPart,
  ]);
}

function getPlayerTeam(
  playerId: string,
  gameConfig: any
): 'team_a' | 'team_b' | null {
  if (gameConfig.team_a.players.some((p: any) => p.player_id === playerId)) {
    return 'team_a';
  }
  if (gameConfig.team_b.players.some((p: any) => p.player_id === playerId)) {
    return 'team_b';
  }
  return null;
}
