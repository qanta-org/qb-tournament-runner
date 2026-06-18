import { useGame } from '../../context/GameContext';
import { TeamPanel } from './TeamPanel';

export function Scoreboard() {
  const { gameConfig, gameState } = useGame();

  if (!gameConfig) return null;

  return (
    <div className="grid grid-cols-2 gap-4">
      <TeamPanel
        team={gameConfig.team_a}
        teamId="team_a"
        score={gameState.scores.team_a}
        hasBuzzed={gameState.teamBuzzed.team_a}
        buzzingPlayer={gameState.buzzingPlayer}
        aiBuzzModes={gameState.aiBuzzModes}
        aiAutonomousK={gameState.aiAutonomousK}
      />
      <TeamPanel
        team={gameConfig.team_b}
        teamId="team_b"
        score={gameState.scores.team_b}
        hasBuzzed={gameState.teamBuzzed.team_b}
        buzzingPlayer={gameState.buzzingPlayer}
        aiBuzzModes={gameState.aiBuzzModes}
        aiAutonomousK={gameState.aiAutonomousK}
      />
    </div>
  );
}
