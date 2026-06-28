import { useState } from 'react';
import { useGame } from '../../context/GameContext';
import type { TeamId, Player, PlayerType } from '../../../../shared/types';

interface PlayerManagementDialogProps {
  teamId: TeamId;
  onClose: () => void;
}

export function PlayerManagementDialog({ teamId, onClose }: PlayerManagementDialogProps) {
  const { gameConfig, getTeamColor, addPlayer, removePlayer, updateBuzzerKey, canModifyPlayers } = useGame();

  const [mode, setMode] = useState<'list' | 'add'>('list');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerKey, setNewPlayerKey] = useState('');
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!gameConfig) return null;

  const team = teamId === 'team_a' ? gameConfig.team_a : gameConfig.team_b;
  const teamColor = getTeamColor(teamId);
  const humanPlayers = team.players.filter(p => p.type === 'human');
  const canModify = canModifyPlayers();

  // Get all used buzzer keys
  const usedKeys = new Set<string>();
  [...gameConfig.team_a.players, ...gameConfig.team_b.players].forEach(p => {
    if (p.type === 'human') {
      const key = (p.extra_kwargs as { buzzer_key?: string })?.buzzer_key;
      if (key) usedKeys.add(key.toUpperCase());
    }
  });

  const getNextAvailableKey = (): string => {
    for (let i = 1; i <= 9; i++) {
      if (!usedKeys.has(String(i))) return String(i);
    }
    return '';
  };

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) {
      setError('Please enter a player name');
      return;
    }

    const buzzerKey = newPlayerKey || getNextAvailableKey();
    if (!buzzerKey) {
      setError('No available buzzer keys');
      return;
    }

    if (usedKeys.has(buzzerKey.toUpperCase())) {
      setError(`Buzzer key "${buzzerKey}" is already in use`);
      return;
    }

    setLoading(true);
    setError(null);

    const player: Player = {
      player_id: `midgame_${Date.now()}`,
      name: newPlayerName.trim(),
      type: 'human' as PlayerType,
      extra_kwargs: { buzzer_key: buzzerKey },
    };

    const result = await addPlayer(teamId, player);

    setLoading(false);

    if (result.success) {
      setNewPlayerName('');
      setNewPlayerKey('');
      setMode('list');
    } else {
      setError(result.error || 'Failed to add player');
    }
  };

  const startEditKey = (playerId: string, currentKey: string) => {
    setEditingPlayerId(playerId);
    setEditKey(currentKey || '');
    setError(null);
  };

  const cancelEditKey = () => {
    setEditingPlayerId(null);
    setEditKey('');
  };

  const handleSaveKey = async (playerId: string) => {
    const key = editKey.trim();
    if (!key) {
      setError('Buzzer key cannot be empty');
      return;
    }

    const currentKey = (
      [...gameConfig.team_a.players, ...gameConfig.team_b.players].find(
        (p) => p.player_id === playerId
      )?.extra_kwargs as { buzzer_key?: string } | undefined
    )?.buzzer_key;

    if (key.toUpperCase() === (currentKey || '').toUpperCase()) {
      cancelEditKey();
      return;
    }

    if (usedKeys.has(key.toUpperCase())) {
      setError(`Buzzer key "${key}" is already in use`);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await updateBuzzerKey(playerId, key);

    setLoading(false);

    if (result.success) {
      cancelEditKey();
    } else {
      setError(result.error || 'Failed to update buzzer key');
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    setLoading(true);
    setError(null);

    const result = await removePlayer(playerId);

    setLoading(false);

    if (!result.success) {
      setError(result.error || 'Failed to remove player');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-fadeIn max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: teamColor }}>
            Manage Players - {team.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>

        {/* Phase warning */}
        {!canModify && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <p className="text-yellow-800 text-sm">
              ⚠️ Players can only be added or removed at the start of a tossup 
              (within the first 5 words).
            </p>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {mode === 'list' ? (
          <>
            {/* Player list */}
            <div className="space-y-2 mb-4">
              {humanPlayers.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  No human players on this team
                </p>
              ) : (
                humanPlayers.map(player => {
                  const buzzerKey = (player.extra_kwargs as { buzzer_key?: string })?.buzzer_key;
                  const isEditing = editingPlayerId === player.player_id;
                  return (
                    <div
                      key={player.player_id}
                      className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span>👤</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editKey}
                            onChange={(e) => setEditKey(e.target.value.slice(-1))}
                            className="input w-12 px-1.5 py-0.5 text-xs font-mono text-center"
                            maxLength={1}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveKey(player.player_id);
                              if (e.key === 'Escape') cancelEditKey();
                            }}
                          />
                        ) : (
                          buzzerKey && (
                            <button
                              onClick={() => canModify && startEditKey(player.player_id, buzzerKey)}
                              disabled={!canModify || loading}
                              className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono hover:bg-gray-300 disabled:cursor-not-allowed disabled:hover:bg-gray-200"
                              title={canModify ? 'Click to change buzzer key' : 'Cannot change key now'}
                            >
                              {buzzerKey} ✎
                            </button>
                          )
                        )}
                        <span className="font-medium">{player.name}</span>
                      </div>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleSaveKey(player.player_id)}
                            disabled={loading}
                            className="text-green-600 hover:text-green-800 disabled:opacity-50 px-2 py-1 text-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEditKey}
                            disabled={loading}
                            className="text-gray-500 hover:text-gray-700 disabled:opacity-50 px-2 py-1 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleRemovePlayer(player.player_id)}
                          disabled={!canModify || loading}
                          className="text-red-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed px-2 py-1"
                          title={canModify ? 'Remove player' : 'Cannot remove now'}
                        >
                          ✕ Remove
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Add player button */}
            <button
              onClick={() => setMode('add')}
              disabled={!canModify}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Human Player
            </button>
          </>
        ) : (
          <>
            {/* Add player form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Player Name *
                </label>
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Enter player name"
                  className="input"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Buzzer Key
                </label>
                <input
                  type="text"
                  value={newPlayerKey}
                  onChange={(e) => setNewPlayerKey(e.target.value.slice(-1))}
                  placeholder={`Default: ${getNextAvailableKey()}`}
                  className="input w-24"
                  maxLength={1}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Press this key to buzz (1-9 recommended)
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setMode('list');
                    setError(null);
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddPlayer}
                  disabled={loading || !newPlayerName.trim()}
                  className="btn btn-primary flex-1"
                >
                  {loading ? 'Adding...' : 'Add Player'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Close button */}
        <div className="mt-4 pt-4 border-t">
          <button
            onClick={onClose}
            className="btn btn-secondary w-full"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
