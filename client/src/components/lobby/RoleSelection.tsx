import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGame } from '../../context/GameContext';

export function RoleSelection() {
  const { createRoom, joinRoom, isConnected, error, clearError } = useGame();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'select' | 'join' | 'join_tournament'>('select');

  // Auto-join if ?join=ROOMCODE is in the URL
  useEffect(() => {
    const autoJoinCode = searchParams.get('join');
    if (autoJoinCode && isConnected) {
      joinRoom(autoJoinCode.toUpperCase());
    }
  }, [searchParams, isConnected]);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length >= 5) {
      joinRoom(joinCode.trim().toUpperCase());
    }
  };

  const handleJoinTournamentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = tournamentCode.trim().toUpperCase();
    if (code.length >= 6) {
      navigate(`/tournament/${code}`);
    }
  };

  const [tournamentCode, setTournamentCode] = useState('');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Quiz Bowl</h1>
          <p className="text-blue-200">Human-AI Hybrid Tournament System</p>
          {!isConnected && (
            <div className="mt-4 text-yellow-400 text-sm animate-pulse">
              Connecting to server...
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-400 rounded-lg text-red-200">
            <div className="flex justify-between items-start">
              <span>{error}</span>
              <button onClick={clearError} className="text-red-300 hover:text-white ml-2">
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {mode === 'select' ? (
            <div className="p-8">
              <h2 className="text-xl font-semibold text-gray-800 text-center mb-6">
                How would you like to connect?
              </h2>

              {/* Moderator option */}
              <button
                onClick={() => createRoom()}
                disabled={!isConnected}
                className="w-full mb-4 p-4 rounded-xl border-2 border-blue-500 bg-blue-50 hover:bg-blue-100 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-4">
                  <div className="text-4xl">🎙️</div>
                  <div>
                    <h3 className="text-lg font-semibold text-blue-800">Start a single game</h3>
                    <p className="text-sm text-blue-600">
                      Create a new game room and control the match
                    </p>
                  </div>
                </div>
              </button>

              {/* Player option */}
              <button
                onClick={() => setMode('join')}
                disabled={!isConnected}
                className="w-full mb-4 p-4 rounded-xl border-2 border-green-500 bg-green-50 hover:bg-green-100 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-4">
                  <div className="text-4xl">📺</div>
                  <div>
                    <h3 className="text-lg font-semibold text-green-800">Join as Viewer</h3>
                    <p className="text-sm text-green-600">
                      Enter a room code to watch the game
                    </p>
                  </div>
                </div>
              </button>

              {/* Tournament options */}
              <button
                onClick={() => navigate('/tournament/new')}
                disabled={!isConnected}
                className="w-full mb-4 p-4 rounded-xl border-2 border-amber-500 bg-amber-50 hover:bg-amber-100 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-4">
                  <div className="text-4xl">🏆</div>
                  <div>
                    <h3 className="text-lg font-semibold text-amber-800">Start a Tournament</h3>
                    <p className="text-sm text-amber-600">
                      Create a multi-game bracket with teams from roster
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setMode('join_tournament')}
                disabled={!isConnected}
                className="w-full p-4 rounded-xl border-2 border-purple-500 bg-purple-50 hover:bg-purple-100 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-4">
                  <div className="text-4xl">🎯</div>
                  <div>
                    <h3 className="text-lg font-semibold text-purple-800">Manage a Tournament</h3>
                    <p className="text-sm text-purple-600">
                      Enter a tournament code to manage games in a tournament
                    </p>
                  </div>
                </div>
              </button>
            </div>
          ) : mode === 'join_tournament' ? (
            <div className="p-8">
              <button
                onClick={() => {
                  setMode('select');
                  setTournamentCode('');
                  clearError();
                }}
                className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-1"
              >
                ← Back
              </button>

              <h2 className="text-xl font-semibold text-gray-800 text-center mb-6">
                Enter Tournament Code
              </h2>

              <form onSubmit={handleJoinTournamentSubmit}>
                <input
                  type="text"
                  value={tournamentCode}
                  onChange={(e) => setTournamentCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="TRN123"
                  className="w-full text-center text-3xl font-mono tracking-[0.5em] py-4 px-6 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none uppercase"
                  maxLength={6}
                  autoFocus
                />
                <p className="text-center text-gray-500 text-sm mt-2">
                  Ask the tournament creator for the 6-character code
                </p>

                <button
                  type="submit"
                  disabled={tournamentCode.length < 6 || !isConnected}
                  className="w-full mt-6 py-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Join Tournament
                </button>
              </form>
            </div>
          ) : (
            <div className="p-8">
              <button
                onClick={() => {
                  setMode('select');
                  setJoinCode('');
                  clearError();
                }}
                className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-1"
              >
                ← Back
              </button>

              <h2 className="text-xl font-semibold text-gray-800 text-center mb-6">
                Enter Room Code
              </h2>

              <form onSubmit={handleJoinSubmit}>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 5))}
                  placeholder="XXXXX"
                  className="w-full text-center text-3xl font-mono tracking-[0.5em] py-4 px-6 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none uppercase"
                  maxLength={5}
                  autoFocus
                />
                <p className="text-center text-gray-500 text-sm mt-2">
                  Ask the moderator for the 5-letter room code
                </p>

                <button
                  type="submit"
                  disabled={joinCode.length < 5 || !isConnected}
                  className="w-full mt-6 py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Join Room
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-blue-300 text-sm mt-6">
          QANTA 2025 • Quiz Bowl AI Competition
        </p>
      </div>
    </div>
  );
}
