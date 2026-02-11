import { GameProvider, useGame } from './context/GameContext';
import { GameLayout } from './components/layout/GameLayout';
import { GameSetup } from './components/setup/GameSetup';
import { RoleSelection } from './components/lobby/RoleSelection';
import { PlayerView } from './components/player/PlayerView';

function AppContent() {
  const {
    gameState,
    gameConfig,
    isConnected,
    clientRole,
    roomCode,
    playerCount,
    error,
    clearError
  } = useGame();

  // Step 1: Not connected yet - show in role selection screen
  // Step 2: No role selected - show role selection
  if (!clientRole || !roomCode) {
    return <RoleSelection />;
  }

  // Step 3: Player role - show player view
  if (clientRole === 'player') {
    return <PlayerView />;
  }

  // Step 4: Moderator role - show moderator views
  // Show setup if game not started
  if (gameState.phase === 'setup' || !gameConfig) {
    return (
      <ModeratorSetupWrapper
        roomCode={roomCode}
        playerCount={playerCount}
      />
    );
  }

  // Show game
  return (
    <ModeratorGameWrapper
      roomCode={roomCode}
      playerCount={playerCount}
    />
  );
}

/**
 * Wrapper for moderator setup screen - adds room info bar
 */
function ModeratorSetupWrapper({
  roomCode,
  playerCount
}: {
  roomCode: string;
  playerCount: number;
}) {
  const { leaveRoom } = useGame();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Room info bar */}
      <div className="bg-blue-600 text-white px-4 py-2">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-blue-200">Room Code:</span>
            <span className="font-mono text-xl font-bold tracking-wider">{roomCode}</span>
            <button
              onClick={() => navigator.clipboard.writeText(roomCode)}
              className="text-blue-200 hover:text-white text-sm"
              title="Copy code"
            >
              📋 Copy
            </button>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-blue-200">
              {playerCount === 0 ? 'No viewers' : `${playerCount} viewer${playerCount !== 1 ? 's' : ''}`}
            </span>
            <button
              onClick={leaveRoom}
              className="text-blue-200 hover:text-white text-sm"
            >
              Leave Room
            </button>
          </div>
        </div>
      </div>
      <GameSetup />
    </div>
  );
}

/**
 * Wrapper for moderator game screen - adds room info
 */
function ModeratorGameWrapper({
  roomCode,
  playerCount
}: {
  roomCode: string;
  playerCount: number;
}) {
  const { leaveRoom, gameState } = useGame();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Room info bar */}
      <div className="bg-blue-600 text-white px-4 py-1 text-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-blue-200">Join Code:</span>
            <span className="font-mono font-bold text-lg tracking-wider bg-blue-700 px-2 py-0.5 rounded">{roomCode}</span>
            <button
              onClick={() => navigator.clipboard.writeText(roomCode)}
              className="text-blue-200 hover:text-white text-xs"
              title="Copy code"
            >
              📋
            </button>
            <span className="text-blue-300">•</span>
            <span className="text-blue-200">
              {playerCount} viewer{playerCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {/* Show current answer for moderator */}
            {gameState.currentTossupAnswer && (
              <span className="bg-blue-700 px-2 py-0.5 rounded text-xs">
                Answer: <span className="font-semibold">{gameState.currentTossupAnswer}</span>
              </span>
            )}
            {gameState.currentBonusPartAnswer && (
              <span className="bg-blue-700 px-2 py-0.5 rounded text-xs">
                Answer: <span className="font-semibold">{gameState.currentBonusPartAnswer}</span>
              </span>
            )}
            <button
              onClick={leaveRoom}
              className="text-blue-200 hover:text-white"
            >
              End Session
            </button>
          </div>
        </div>
      </div>
      <GameLayout />
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}
