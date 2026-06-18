import { useState, useEffect } from 'react';
import type { Team, Player, PlayerType } from '../../../../shared/types';
import type { ApiRosterPlayer } from '../../api/rosters';

type RosterPlayer = ApiRosterPlayer;

interface TeamBuilderProps {
  team: Team;
  onChange: (team: Team) => void;
  teamLabel: string;
  teamColor: string;
  availableModels?: string[];
  datasetId?: string; // For loading dataset-specific rosters
  excludedPlayerIds?: string[]; // Player IDs already on the other team
  allUsedBuzzerKeys?: Map<string, string>; // All buzzer keys -> player_id mapping
}

export function TeamBuilder({ 
  team, 
  onChange, 
  teamLabel, 
  teamColor, 
  availableModels = [], 
  datasetId,
  excludedPlayerIds = [],
  allUsedBuzzerKeys = new Map(),
}: TeamBuilderProps) {
  const [aiRoster, setAiRoster] = useState<RosterPlayer[]>([]);
  const [humanRoster, setHumanRoster] = useState<RosterPlayer[]>([]);
  const [rosterSource, setRosterSource] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addMode, setAddMode] = useState<'roster' | 'custom'>('roster');
  const [playerTypeFilter, setPlayerTypeFilter] = useState<'all' | 'human' | 'ai'>('all');

  // Custom player form state
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState<PlayerType>('human');
  const [customBuzzerKey, setCustomBuzzerKey] = useState('');
  const [customTossupModel, setCustomTossupModel] = useState('');
  const [customBonusModel, setCustomBonusModel] = useState('');

  // Multi-select state for roster
  const [selectedRosterPlayers, setSelectedRosterPlayers] = useState<Set<string>>(new Set());

  // Load rosters on mount or when dataset changes
  useEffect(() => {
    loadRosters();
  }, [datasetId]);

  const loadRosters = async () => {
    setLoading(true);
    try {
      const queryParam = datasetId ? `?dataset=${encodeURIComponent(datasetId)}` : '';
      const [aiRes, humanRes] = await Promise.all([
        fetch(`/api/rosters/ai${queryParam}`),
        fetch(`/api/rosters/human${queryParam}`),
      ]);

      if (aiRes.ok) {
        const data = await aiRes.json();
        setAiRoster(data.players || []);
        setRosterSource(data.source || 'global');
      }
      if (humanRes.ok) {
        const data = await humanRes.json();
        setHumanRoster(data.players || []);
      }
    } catch (err) {
      console.error('Failed to load rosters:', err);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredRoster = (): RosterPlayer[] => {
    const combined = [...humanRoster, ...aiRoster];
    // Exclude players already on this team
    const existingIds = new Set(team.players.map(p => p.player_id));
    // Exclude players on the other team
    const excludedIds = new Set(excludedPlayerIds);
    
    const filtered = combined.filter(p => 
      !existingIds.has(p.player_id) && !excludedIds.has(p.player_id)
    );

    if (playerTypeFilter === 'all') return filtered;
    return filtered.filter(p => p.type === playerTypeFilter);
  };

  const addPlayerFromRoster = (rosterPlayer: RosterPlayer) => {
    const nextKey = getNextBuzzerKey();
    
    const newPlayer: Player = {
      player_id: rosterPlayer.player_id,
      name: rosterPlayer.name,
      type: rosterPlayer.type,
      extra_kwargs: rosterPlayer.type === 'human'
        ? { buzzer_key: rosterPlayer.default_buzzer_key || nextKey }
        : {
            tossup_model: rosterPlayer.tossup_model || '',
            bonus_model: rosterPlayer.bonus_model || rosterPlayer.tossup_model || '',
          },
    };

    onChange({
      ...team,
      players: [...team.players, newPlayer],
    });
  };

  const toggleRosterSelection = (playerId: string) => {
    setSelectedRosterPlayers(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const addSelectedPlayers = () => {
    const roster = [...humanRoster, ...aiRoster];
    const playersToAdd: Player[] = [];
    let keyCounter = 0;

    for (const playerId of selectedRosterPlayers) {
      const rosterPlayer = roster.find(p => p.player_id === playerId);
      if (!rosterPlayer) continue;

      // Get next available key for human players
      const getKey = () => {
        const usedKeys = new Set([
          ...team.players
            .filter(p => p.type === 'human')
            .map(p => (p.extra_kwargs as { buzzer_key?: string })?.buzzer_key),
          ...playersToAdd
            .filter(p => p.type === 'human')
            .map(p => (p.extra_kwargs as { buzzer_key?: string })?.buzzer_key),
        ]);
        for (let i = 1; i <= 9; i++) {
          if (!usedKeys.has(String(i))) return String(i);
        }
        keyCounter++;
        return String(keyCounter);
      };

      playersToAdd.push({
        player_id: rosterPlayer.player_id,
        name: rosterPlayer.name,
        type: rosterPlayer.type,
        extra_kwargs: rosterPlayer.type === 'human'
          ? { buzzer_key: rosterPlayer.default_buzzer_key || getKey() }
          : {
              tossup_model: rosterPlayer.tossup_model || '',
              bonus_model: rosterPlayer.bonus_model || rosterPlayer.tossup_model || '',
            },
      });
    }

    if (playersToAdd.length > 0) {
      onChange({
        ...team,
        players: [...team.players, ...playersToAdd],
      });
    }

    setSelectedRosterPlayers(new Set());
    setShowAddDialog(false);
  };

  const selectAllFiltered = () => {
    const filtered = getFilteredRoster();
    setSelectedRosterPlayers(new Set(filtered.map(p => p.player_id)));
  };

  const clearSelection = () => {
    setSelectedRosterPlayers(new Set());
  };

  const addCustomPlayer = () => {
    if (!customName.trim()) return;

    const playerId = `custom_${Date.now()}`;
    const newPlayer: Player = {
      player_id: playerId,
      name: customName.trim(),
      type: customType,
      extra_kwargs: customType === 'human'
        ? { buzzer_key: customBuzzerKey || getNextBuzzerKey() }
        : {
            tossup_model: customTossupModel,
            bonus_model: customBonusModel || customTossupModel,
          },
    };

    onChange({
      ...team,
      players: [...team.players, newPlayer],
    });

    // Reset form
    setCustomName('');
    setCustomBuzzerKey('');
    setCustomTossupModel('');
    setCustomBonusModel('');
    setShowAddDialog(false);
  };

  const removePlayer = (playerId: string) => {
    onChange({
      ...team,
      players: team.players.filter((p) => p.player_id !== playerId),
    });
  };

  const updatePlayer = (playerId: string, updates: Partial<Player>) => {
    onChange({
      ...team,
      players: team.players.map((p) =>
        p.player_id === playerId ? { ...p, ...updates } : p
      ),
    });
  };

  const updatePlayerKwarg = (playerId: string, key: string, value: string) => {
    onChange({
      ...team,
      players: team.players.map((p) =>
        p.player_id === playerId
          ? { ...p, extra_kwargs: { ...p.extra_kwargs, [key]: value } }
          : p
      ),
    });
  };

  const getNextBuzzerKey = (): string => {
    const usedKeys = new Set(
      team.players
        .filter(p => p.type === 'human')
        .map(p => (p.extra_kwargs as { buzzer_key?: string })?.buzzer_key)
    );
    for (let i = 1; i <= 9; i++) {
      if (!usedKeys.has(String(i))) return String(i);
    }
    return '';
  };

  const filteredRoster = getFilteredRoster();

  return (
    <div className="border-2 rounded-lg p-4" style={{ borderColor: teamColor }}>
      {/* Team header */}
      <div className="flex items-center justify-between mb-4">
        <input
          type="text"
          value={team.name}
          onChange={(e) => onChange({ ...team, name: e.target.value })}
          className="text-lg font-bold bg-transparent border-b-2 focus:outline-none"
          style={{ borderColor: teamColor, color: teamColor }}
        />
        <span className="text-sm text-gray-500">
          {team.players.length} player{team.players.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Current players */}
      <div className="space-y-2 mb-4">
        {team.players.length === 0 ? (
          <p className="text-gray-400 text-sm italic text-center py-4">
            No players added yet
          </p>
        ) : (
          team.players.map((player) => (
            <div
              key={player.player_id}
              className="flex items-center gap-2 bg-gray-50 rounded-lg p-2"
            >
              <span className="text-lg">
                {player.type === 'human' ? '👤' : '🤖'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{player.name}</div>
                {player.type === 'human' ? (
                  (() => {
                    const currentKey = (player.extra_kwargs as { buzzer_key?: string })?.buzzer_key || '';
                    const conflictPlayerId = currentKey ? allUsedBuzzerKeys.get(currentKey) : undefined;
                    const hasConflict = conflictPlayerId && conflictPlayerId !== player.player_id;
                    return (
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-gray-500">Key:</span>
                        <input
                          type="text"
                          value={currentKey}
                          onChange={(e) => updatePlayerKwarg(player.player_id, 'buzzer_key', e.target.value.slice(-1))}
                          className={`w-8 px-1 border rounded text-center ${hasConflict ? 'border-red-500 bg-red-50' : ''}`}
                          maxLength={1}
                        />
                        {hasConflict && (
                          <span className="text-red-500" title="This key is already used by another player">⚠️</span>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-xs truncate">
                    {(() => {
                      const model = (player.extra_kwargs as { tossup_model?: string })?.tossup_model;
                      const modelExists = !model || availableModels.length === 0 || availableModels.includes(model);
                      return (
                        <span className={modelExists ? 'text-gray-500' : 'text-red-500 font-medium'}>
                          {model || 'No model'}
                          {model && !modelExists && ' ⚠️ Not found'}
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>
              <button
                onClick={() => removePlayer(player.player_id)}
                className="text-red-500 hover:text-red-700 p-1"
                title="Remove player"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add player button */}
      <button
        onClick={() => setShowAddDialog(true)}
        className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
      >
        + Add Player
      </button>

      {/* Add player dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden">
            {/* Dialog header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-bold" style={{ color: teamColor }}>
                Add Player to {team.name}
              </h3>
              <button
                onClick={() => setShowAddDialog(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {/* Mode tabs */}
            <div className="flex border-b">
              <button
                onClick={() => setAddMode('roster')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  addMode === 'roster'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                📋 From Roster
              </button>
              <button
                onClick={() => setAddMode('custom')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  addMode === 'custom'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                ✏️ Custom Player
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[50vh]">
              {addMode === 'roster' ? (
                <div>
                  {/* Filter + Add button row */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPlayerTypeFilter('all')}
                        className={`px-3 py-1 rounded-full text-sm ${
                          playerTypeFilter === 'all'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setPlayerTypeFilter('human')}
                        className={`px-3 py-1 rounded-full text-sm ${
                          playerTypeFilter === 'human'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        👤 Humans
                      </button>
                      <button
                        onClick={() => setPlayerTypeFilter('ai')}
                        className={`px-3 py-1 rounded-full text-sm ${
                          playerTypeFilter === 'ai'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        🤖 AI
                      </button>
                    </div>
                    {/* Add selected button (top) */}
                    {selectedRosterPlayers.size > 0 && (
                      <button
                        onClick={addSelectedPlayers}
                        className="btn btn-primary text-sm py-1 px-3"
                      >
                        + Add {selectedRosterPlayers.size}
                      </button>
                    )}
                  </div>

                  {loading ? (
                    <div className="text-center py-8 text-gray-500">
                      Loading rosters...
                    </div>
                  ) : filteredRoster.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No available players in roster.
                      <button
                        onClick={() => setAddMode('custom')}
                        className="block mx-auto mt-2 text-blue-600 hover:text-blue-800"
                      >
                        Create a custom player →
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Select all / clear buttons */}
                      <div className="flex justify-between items-center mb-2 text-xs">
                        <span className="text-gray-500">
                          {selectedRosterPlayers.size} selected
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={selectAllFiltered}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Select All
                          </button>
                          <button
                            onClick={clearSelection}
                            className="text-gray-500 hover:text-gray-700"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        {filteredRoster.map((player) => {
                          const isSelected = selectedRosterPlayers.has(player.player_id);
                          return (
                            <div
                              key={player.player_id}
                              onClick={() => toggleRosterSelection(player.player_id)}
                              className={`w-full flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                isSelected 
                                  ? 'bg-blue-50 border-blue-300' 
                                  : 'hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="w-4 h-4 text-blue-600"
                              />
                              <span className="text-xl">
                                {player.type === 'human' ? '👤' : '🤖'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{player.name}</div>
                                {player.type === 'ai' ? (
                                  <div className="text-xs text-gray-500 truncate">
                                    {player.tossup_model}
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-500">
                                    {player.default_buzzer_key && `Key: ${player.default_buzzer_key}`}
                                    {player.description && ` • ${player.description}`}
                                  </div>
                                )}
                              </div>
                              {player.skill_level && (
                                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  {player.skill_level}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Add Selected button */}
                      {selectedRosterPlayers.size > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <button
                            onClick={addSelectedPlayers}
                            className="btn btn-primary w-full"
                          >
                            Add {selectedRosterPlayers.size} Player{selectedRosterPlayers.size !== 1 ? 's' : ''}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Player type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Player Type
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCustomType('human')}
                        className={`flex-1 py-2 rounded-lg border-2 transition-colors ${
                          customType === 'human'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200'
                        }`}
                      >
                        👤 Human
                      </button>
                      <button
                        onClick={() => setCustomType('ai')}
                        className={`flex-1 py-2 rounded-lg border-2 transition-colors ${
                          customType === 'ai'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200'
                        }`}
                      >
                        🤖 AI
                      </button>
                    </div>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Enter player name"
                      className="input"
                    />
                  </div>

                  {customType === 'human' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Buzzer Key
                      </label>
                      <input
                        type="text"
                        value={customBuzzerKey}
                        onChange={(e) => setCustomBuzzerKey(e.target.value.slice(-1))}
                        placeholder={`Default: ${getNextBuzzerKey()}`}
                        className="input w-24"
                        maxLength={1}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Press this key to buzz (1-9 recommended)
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Tossup Model *
                        </label>
                        {availableModels.length > 0 ? (
                          <select
                            value={customTossupModel}
                            onChange={(e) => {
                              setCustomTossupModel(e.target.value);
                              if (!customBonusModel) setCustomBonusModel(e.target.value);
                            }}
                            className="input"
                          >
                            <option value="">Select model...</option>
                            {availableModels.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={customTossupModel}
                            onChange={(e) => setCustomTossupModel(e.target.value)}
                            placeholder="Model name (e.g., gpt-4o)"
                            className="input"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Bonus Model
                        </label>
                        {availableModels.length > 0 ? (
                          <select
                            value={customBonusModel}
                            onChange={(e) => setCustomBonusModel(e.target.value)}
                            className="input"
                          >
                            <option value="">Same as tossup model</option>
                            {availableModels.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={customBonusModel}
                            onChange={(e) => setCustomBonusModel(e.target.value)}
                            placeholder="Leave empty to use tossup model"
                            className="input"
                          />
                        )}
                      </div>
                    </>
                  )}

                  <button
                    onClick={addCustomPlayer}
                    disabled={!customName.trim() || (customType === 'ai' && !customTossupModel)}
                    className="btn btn-primary w-full"
                  >
                    Add Player
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
