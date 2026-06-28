import { useState, useEffect } from 'react';
import type { AIPlayerKwargs, AIWeightClass, ModelInfo, ModelRosterEntry, Team, Player } from '../../../../shared/types';
import { aiModelSummaryLines, aiPlayerDisplayName } from '../../../../shared/modelLabels';
import type { ApiRosterPlayer } from '../../api/rosters';
import { fetchBonusModelRoster, fetchHumanRoster, fetchTossupModelRoster } from '../../api/rosters';

type RosterPlayer = ApiRosterPlayer;

interface TeamBuilderProps {
  team: Team;
  onChange: (team: Team) => void;
  teamLabel: string;
  teamColor: string;
  availableModels?: ModelInfo[];
  datasetId?: string; // For loading dataset-specific rosters
  excludedPlayerIds?: string[]; // Player IDs already on the other team
  allUsedBuzzerKeys?: Map<string, string>; // All buzzer keys -> player_id mapping
}

/**
 * Derive the tossup/bonus/coupled model pools from a dataset's model capabilities.
 * Coupled models must serve both phases (unless the dataset exposes no bonus models
 * at all, in which case tossup-only is acceptable).
 */
export function deriveModelPools(availableModels: ModelInfo[]) {
  const hasModelInfo = availableModels.length > 0;
  const allModelNames = availableModels.map((m) => m.name);
  const tossupModelNames = availableModels.filter((m) => m.hasTossupResponses).map((m) => m.name);
  const bonusModelNames = availableModels.filter((m) => m.hasBonusResponses).map((m) => m.name);
  const datasetHasBonusModels = bonusModelNames.length > 0;
  const coupledModelNames = datasetHasBonusModels
    ? availableModels.filter((m) => m.hasTossupResponses && m.hasBonusResponses).map((m) => m.name)
    : tossupModelNames;
  return { hasModelInfo, allModelNames, tossupModelNames, bonusModelNames, coupledModelNames };
}

/** Roster entries whose model key exists in both tossup and bonus catalogs. */
export function coupledRosterEntries(
  tossupRoster: ModelRosterEntry[],
  bonusRoster: ModelRosterEntry[]
): ModelRosterEntry[] {
  const bonusModels = new Set(bonusRoster.map((e) => e.model));
  return tossupRoster.filter((e) => bonusModels.has(e.model));
}

/**
 * Whether the dataset supports a single shared response key for both phases.
 * Coupled UI is only shown when at least one model serves tossups and bonuses
 * under the same key.
 */
export function canUseCoupledMode(
  tossupRoster: ModelRosterEntry[],
  bonusRoster: ModelRosterEntry[],
  coupledModelNames: string[]
): boolean {
  return coupledRosterEntries(tossupRoster, bonusRoster).length > 0 || coupledModelNames.length > 0;
}

/** Whether an AI player's tossup/bonus models should use the coupled picker in the UI. */
export function isPlayerCoupled(
  kwargs: Partial<AIPlayerKwargs>,
  canCouple = true
): boolean {
  if (!canCouple) return false;
  // Distinct keys always use decoupled pickers, even if coupled was persisted.
  if (
    kwargs.tossup_model &&
    kwargs.bonus_model &&
    kwargs.tossup_model !== kwargs.bonus_model
  ) {
    return false;
  }
  if (typeof kwargs.coupled === 'boolean') return kwargs.coupled;
  return !kwargs.bonus_model || kwargs.bonus_model === kwargs.tossup_model;
}

/**
 * Build AI player kwargs from a legacy combined roster CSV entry.
 */
export function buildAiKwargsFromRoster(
  rosterPlayer: RosterPlayer,
  tossupRoster: ModelRosterEntry[],
  bonusRoster: ModelRosterEntry[]
): AIPlayerKwargs {
  const tossup_model = rosterPlayer.tossup_model || '';
  const bonusRaw = rosterPlayer.bonus_model?.trim();
  const bonus_model = bonusRaw && bonusRaw !== tossup_model ? bonusRaw : tossup_model;
  const hasDistinctBonus = bonus_model !== tossup_model;
  const tossupEntry = tossupRoster.find((e) => e.model === tossup_model);
  const bonusEntry = bonusRoster.find((e) => e.model === bonus_model);
  return {
    tossup_model,
    bonus_model,
    tossup_model_name: tossupEntry?.name ?? rosterPlayer.name,
    bonus_model_name: bonusEntry?.name ?? (hasDistinctBonus ? rosterPlayer.name : tossupEntry?.name ?? rosterPlayer.name),
    coupled: !hasDistinctBonus,
    tossup_weight_class: tossupEntry?.weight_class ?? rosterPlayer.weight_class,
    bonus_weight_class: bonusEntry?.weight_class ?? rosterPlayer.weight_class,
  };
}

/**
 * Model picker backed by a phase roster when available; falls back to raw response
 * file names from the dataset scan.
 */
export function RosterModelSelect({
  value,
  onChange,
  entries,
  fallbackOptions,
  allModelNames,
  hasModelInfo,
  emptyLabel,
  placeholder,
}: {
  value: string;
  onChange: (modelKey: string, entry?: ModelRosterEntry) => void;
  entries: ModelRosterEntry[];
  fallbackOptions: string[];
  allModelNames: string[];
  hasModelInfo: boolean;
  emptyLabel: string;
  placeholder: string;
}) {
  if (entries.length > 0) {
    const knownModels = new Set(entries.map((e) => e.model));
    const notFound = !!value && !knownModels.has(value);
    return (
      <select
        value={value}
        onChange={(e) => {
          const modelKey = e.target.value;
          const entry = entries.find((x) => x.model === modelKey);
          onChange(modelKey, entry);
        }}
        className="input"
      >
        <option value="">{emptyLabel}</option>
        {notFound && <option value={value}>{value} (not found)</option>}
        {entries.map((entry) => (
          <option key={entry.id} value={entry.model}>
            {entry.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <ModelSelect
      value={value}
      onChange={(v) => onChange(v)}
      options={fallbackOptions}
      allModelNames={allModelNames}
      hasModelInfo={hasModelInfo}
      emptyLabel={emptyLabel}
      placeholder={placeholder}
    />
  );
}

/**
 * A model picker that renders a dropdown when dataset model info is available, or
 * a free-text input otherwise. Surfaces a "(not found)" option when the current
 * value is not among the available models so the selection stays visible.
 */
export function ModelSelect({
  value,
  onChange,
  options,
  allModelNames,
  hasModelInfo,
  emptyLabel,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  allModelNames: string[];
  hasModelInfo: boolean;
  emptyLabel: string;
  placeholder: string;
}) {
  if (!hasModelInfo) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
      />
    );
  }

  const notFound = !!value && !allModelNames.includes(value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
      <option value="">{emptyLabel}</option>
      {notFound && <option value={value}>{value} (not found)</option>}
      {options.map((model) => (
        <option key={model} value={model}>
          {model}
        </option>
      ))}
    </select>
  );
}

/**
 * Inline editor for an AI player's tossup/bonus models shown in the team list.
 * Supports the coupled/decoupled toggle and surfaces both models.
 */
export function AiModelEditor({
  kwargs,
  hasModelInfo,
  allModelNames,
  tossupModelNames,
  bonusModelNames,
  coupledModelNames,
  tossupRoster,
  bonusRoster,
  onChange,
}: {
  kwargs: AIPlayerKwargs;
  hasModelInfo: boolean;
  allModelNames: string[];
  tossupModelNames: string[];
  bonusModelNames: string[];
  coupledModelNames: string[];
  tossupRoster: ModelRosterEntry[];
  bonusRoster: ModelRosterEntry[];
  onChange: (next: Partial<AIPlayerKwargs>) => void;
}) {
  const coupledEntries = coupledRosterEntries(tossupRoster, bonusRoster);
  const canCouple = canUseCoupledMode(tossupRoster, bonusRoster, coupledModelNames);
  const coupled = isPlayerCoupled(kwargs, canCouple);
  const useRosterCoupled = coupledEntries.length > 0;

  return (
    <div className="space-y-1 mt-1">
      {canCouple && (
        <label className="flex items-center gap-1 text-[11px] text-gray-500">
          <input
            type="checkbox"
            checked={coupled}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? {
                      coupled: true,
                      bonus_model: kwargs.tossup_model,
                      bonus_model_name: kwargs.tossup_model_name,
                      bonus_weight_class:
                        bonusRoster.find((e) => e.model === kwargs.tossup_model)?.weight_class ??
                        kwargs.tossup_weight_class,
                    }
                  : { coupled: false }
              )
            }
            className="w-3 h-3"
          />
          Same model for both
        </label>
      )}
      {coupled && canCouple ? (
        <RosterModelSelect
          value={kwargs.tossup_model}
          onChange={(modelKey, entry) => {
            if (entry && useRosterCoupled) {
              const bonusEntry = bonusRoster.find((e) => e.model === modelKey);
              onChange({
                tossup_model: modelKey,
                bonus_model: modelKey,
                tossup_model_name: entry.name,
                bonus_model_name: bonusEntry?.name ?? entry.name,
                tossup_weight_class: entry.weight_class ?? kwargs.tossup_weight_class,
                bonus_weight_class: bonusEntry?.weight_class ?? entry.weight_class ?? kwargs.bonus_weight_class,
                coupled: true,
              });
            } else {
              onChange({
                tossup_model: modelKey,
                bonus_model: modelKey,
                tossup_model_name: entry?.name,
                bonus_model_name: entry?.name,
                tossup_weight_class: entry?.weight_class ?? kwargs.tossup_weight_class,
                bonus_weight_class: entry?.weight_class ?? kwargs.bonus_weight_class,
                coupled: true,
              });
            }
          }}
          entries={useRosterCoupled ? coupledEntries : []}
          fallbackOptions={coupledModelNames}
          allModelNames={allModelNames}
          hasModelInfo={hasModelInfo}
          emptyLabel="Select model..."
          placeholder="Model name"
        />
      ) : (
        <>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-gray-400 w-3" title="Tossup model">T</span>
            <RosterModelSelect
              value={kwargs.tossup_model}
              onChange={(modelKey, entry) =>
                onChange({
                  tossup_model: modelKey,
                  tossup_model_name: entry?.name,
                  tossup_weight_class: entry?.weight_class ?? kwargs.tossup_weight_class,
                })
              }
              entries={tossupRoster}
              fallbackOptions={tossupModelNames}
              allModelNames={allModelNames}
              hasModelInfo={hasModelInfo}
              emptyLabel="Tossup model..."
              placeholder="Tossup model"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-gray-400 w-3" title="Bonus model">B</span>
            <RosterModelSelect
              value={kwargs.bonus_model}
              onChange={(modelKey, entry) =>
                onChange({
                  bonus_model: modelKey,
                  bonus_model_name: entry?.name,
                  bonus_weight_class: entry?.weight_class ?? kwargs.bonus_weight_class,
                })
              }
              entries={bonusRoster}
              fallbackOptions={bonusModelNames}
              allModelNames={allModelNames}
              hasModelInfo={hasModelInfo}
              emptyLabel="Bonus model..."
              placeholder="Bonus model"
            />
          </div>
        </>
      )}
    </div>
  );
}

/** A selectable AI model row in the checklist (one phase). */
interface AiModelRow {
  model: string;
  name: string;
  weight_class?: AIWeightClass;
}

const WEIGHT_LABELS: Record<AIWeightClass, string> = {
  lightweight: 'LW',
  midweight: 'MW',
  heavyweight: 'HW',
};

const WEIGHT_BADGE_CLASS: Record<AIWeightClass, string> = {
  lightweight: 'bg-green-100 text-green-700',
  midweight: 'bg-amber-100 text-amber-700',
  heavyweight: 'bg-red-100 text-red-700',
};

const WEIGHT_RANK: Record<AIWeightClass, number> = {
  lightweight: 0,
  midweight: 1,
  heavyweight: 2,
};

function weightRank(weightClass?: AIWeightClass): number {
  return weightClass ? WEIGHT_RANK[weightClass] : 3;
}

/** Small LW/MW/HW chip; renders nothing when the weight class is unknown. */
function WeightBadge({ weightClass }: { weightClass?: AIWeightClass }) {
  if (!weightClass) return null;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${WEIGHT_BADGE_CLASS[weightClass]}`}>
      {WEIGHT_LABELS[weightClass]}
    </span>
  );
}

/**
 * Build the selectable rows for one phase: prefer the phase roster (with weight
 * classes), fall back to raw dataset model names, drop models already on the team
 * for that phase, and sort by weight class then name.
 */
function buildPhaseRows(
  roster: ModelRosterEntry[],
  fallbackNames: string[],
  usedModels: Set<string>
): AiModelRow[] {
  const base: AiModelRow[] =
    roster.length > 0
      ? roster.map((e) => ({ model: e.model, name: e.name, weight_class: e.weight_class }))
      : fallbackNames.map((n) => ({ model: n, name: n }));
  return base
    .filter((r) => !usedModels.has(r.model))
    .sort((a, b) => {
      const d = weightRank(a.weight_class) - weightRank(b.weight_class);
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });
}

/** A checkbox group of AI models for one phase, with Select All / Clear. */
function AiModelChecklist({
  title,
  rows,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  title: string;
  rows: AiModelRow[];
  selected: Set<string>;
  onToggle: (model: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
        {rows.length > 0 && (
          <div className="flex gap-2 text-xs">
            <button onClick={onSelectAll} className="text-blue-600 hover:text-blue-800">
              Select All
            </button>
            <button onClick={onClear} className="text-gray-500 hover:text-gray-700">
              Clear
            </button>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No models available.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((row) => {
            const isSelected = selected.has(row.model);
            return (
              <div
                key={row.model}
                onClick={() => onToggle(row.model)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {}}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-xl">🤖</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{row.name}</div>
                </div>
                <WeightBadge weightClass={row.weight_class} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
  const [humanRoster, setHumanRoster] = useState<RosterPlayer[]>([]);
  const [tossupRoster, setTossupRoster] = useState<ModelRosterEntry[]>([]);
  const [bonusRoster, setBonusRoster] = useState<ModelRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addMode, setAddMode] = useState<'roster' | 'custom' | 'ai'>('roster');

  // Custom human form state
  const [customName, setCustomName] = useState('');
  const [customBuzzerKey, setCustomBuzzerKey] = useState('');

  // Add AI checklist state (response-file keys selected per phase)
  const [selectedTossupModels, setSelectedTossupModels] = useState<Set<string>>(new Set());
  const [selectedBonusModels, setSelectedBonusModels] = useState<Set<string>>(new Set());

  // Multi-select state for roster
  const [selectedRosterPlayers, setSelectedRosterPlayers] = useState<Set<string>>(new Set());

  const { hasModelInfo, allModelNames, tossupModelNames, bonusModelNames, coupledModelNames } =
    deriveModelPools(availableModels);

  // Load rosters on mount or when dataset changes
  useEffect(() => {
    loadRosters();
  }, [datasetId]);

  const loadRosters = async () => {
    setLoading(true);
    try {
      const [humanData, tossupData, bonusData] = await Promise.all([
        fetchHumanRoster(datasetId),
        fetchTossupModelRoster(datasetId),
        fetchBonusModelRoster(datasetId),
      ]);
      setHumanRoster(humanData.players || []);
      setTossupRoster(tossupData.entries || []);
      setBonusRoster(bonusData.entries || []);
    } catch (err) {
      console.error('Failed to load rosters:', err);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredRoster = (): RosterPlayer[] => {
    const existingIds = new Set(team.players.map(p => p.player_id));
    const excludedIds = new Set(excludedPlayerIds);
    return humanRoster.filter(p =>
      !existingIds.has(p.player_id) && !excludedIds.has(p.player_id)
    );
  };

  const addPlayerFromRoster = (rosterPlayer: RosterPlayer) => {
    const nextKey = getNextBuzzerKey();
    const newPlayer: Player = {
      player_id: rosterPlayer.player_id,
      name: rosterPlayer.name,
      type: 'human',
      extra_kwargs: { buzzer_key: rosterPlayer.default_buzzer_key || nextKey },
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
    const playersToAdd: Player[] = [];
    let keyCounter = 0;

    for (const playerId of selectedRosterPlayers) {
      const rosterPlayer = humanRoster.find(p => p.player_id === playerId);
      if (!rosterPlayer) continue;

      const getKey = () => {
        const usedKeys = new Set([
          ...team.players
            .filter(p => p.type === 'human')
            .map(p => (p.extra_kwargs as { buzzer_key?: string })?.buzzer_key),
          ...playersToAdd
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
        type: 'human',
        extra_kwargs: { buzzer_key: rosterPlayer.default_buzzer_key || getKey() },
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
    const newPlayer: Player = {
      player_id: `custom_${Date.now()}`,
      name: customName.trim(),
      type: 'human',
      extra_kwargs: { buzzer_key: customBuzzerKey || getNextBuzzerKey() },
    };
    onChange({ ...team, players: [...team.players, newPlayer] });
    setCustomName('');
    setCustomBuzzerKey('');
    setShowAddDialog(false);
  };

  const toggleTossupModel = (model: string) => {
    setSelectedTossupModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  const toggleBonusModel = (model: string) => {
    setSelectedBonusModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  // Pair selected tossup and bonus models (in displayed order) into combined AI
  // players: the first min(#tossup, #bonus) selections become tossup+bonus players,
  // and any leftover selections in the longer column are added as single-phase players.
  const addSelectedAIPlayers = () => {
    const selT = tossupRows.filter((r) => selectedTossupModels.has(r.model));
    const selB = bonusRows.filter((r) => selectedBonusModels.has(r.model));
    const pairCount = Math.min(selT.length, selB.length);

    const newPlayers: Player[] = [];
    let idx = 0;
    const addPlayer = (extra_kwargs: AIPlayerKwargs) => {
      newPlayers.push({
        player_id: `custom_ai_${Date.now()}_${idx++}`,
        name: aiPlayerDisplayName(extra_kwargs),
        type: 'ai',
        extra_kwargs,
      });
    };

    // Paired tossup + bonus players
    for (let i = 0; i < pairCount; i++) {
      const t = selT[i];
      const b = selB[i];
      addPlayer({
        tossup_model: t.model,
        bonus_model: b.model,
        tossup_model_name: t.name,
        bonus_model_name: b.name,
        tossup_weight_class: t.weight_class,
        bonus_weight_class: b.weight_class,
        coupled: false,
      });
    }

    // Leftover tossup-only players (when more tossups than bonuses were selected)
    for (let i = pairCount; i < selT.length; i++) {
      const t = selT[i];
      addPlayer({
        tossup_model: t.model,
        bonus_model: '',
        tossup_model_name: t.name,
        tossup_weight_class: t.weight_class,
        coupled: false,
      });
    }

    // Leftover bonus-only players (when more bonuses than tossups were selected)
    for (let i = pairCount; i < selB.length; i++) {
      const b = selB[i];
      addPlayer({
        tossup_model: '',
        bonus_model: b.model,
        bonus_model_name: b.name,
        bonus_weight_class: b.weight_class,
        coupled: false,
      });
    }

    if (newPlayers.length > 0) {
      onChange({ ...team, players: [...team.players, ...newPlayers] });
    }
    setSelectedTossupModels(new Set());
    setSelectedBonusModels(new Set());
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

  // AI model checklist rows (exclude models already on this team for that phase)
  const aiPlayers = team.players.filter((p) => p.type === 'ai');
  const usedTossupModels = new Set(
    aiPlayers
      .map((p) => (p.extra_kwargs as AIPlayerKwargs).tossup_model)
      .filter((m): m is string => !!m)
  );
  const usedBonusModels = new Set(
    aiPlayers
      .map((p) => (p.extra_kwargs as AIPlayerKwargs).bonus_model)
      .filter((m): m is string => !!m)
  );
  const tossupRows = buildPhaseRows(tossupRoster, tossupModelNames, usedTossupModels);
  const bonusRows = buildPhaseRows(bonusRoster, bonusModelNames, usedBonusModels);
  const totalSelectedAi = selectedTossupModels.size + selectedBonusModels.size;

  const coupledEntries = coupledRosterEntries(tossupRoster, bonusRoster);
  const canCoupleModels = canUseCoupledMode(tossupRoster, bonusRoster, coupledModelNames);

  /** Update an AI player's model fields (and coupling) in one shot. */
  const updateAiPlayerModels = (playerId: string, next: Partial<AIPlayerKwargs>) => {
    onChange({
      ...team,
      players: team.players.map((p) => {
        if (p.player_id !== playerId) return p;
        const extra_kwargs = { ...(p.extra_kwargs as AIPlayerKwargs), ...next };
        return { ...p, extra_kwargs, name: aiPlayerDisplayName(extra_kwargs) };
      }),
    });
  };

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
                {player.type === 'ai' && (() => {
                  const { tossup, bonus } = aiModelSummaryLines(player.extra_kwargs as AIPlayerKwargs);
                  return (
                    <div className="text-[11px] space-y-0.5">
                      <div className={tossup ? 'text-gray-400' : 'text-gray-300 italic'}>
                        T: {tossup ?? '[None]'}
                      </div>
                      <div className={bonus ? 'text-gray-400' : 'text-gray-300 italic'}>
                        B: {bonus ?? '[None]'}
                      </div>
                    </div>
                  );
                })()}
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
                  <AiModelEditor
                    kwargs={player.extra_kwargs as AIPlayerKwargs}
                    hasModelInfo={hasModelInfo}
                    allModelNames={allModelNames}
                    tossupModelNames={tossupModelNames}
                    bonusModelNames={bonusModelNames}
                    coupledModelNames={coupledModelNames}
                    tossupRoster={tossupRoster}
                    bonusRoster={bonusRoster}
                    onChange={(next) => updateAiPlayerModels(player.player_id, next)}
                  />
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
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
                onClick={() => setAddMode('ai')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  addMode === 'ai'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                🤖 Add AI
              </button>
              <button
                onClick={() => setAddMode('custom')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  addMode === 'custom'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                ✏️ Custom Human
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[50vh]">
              {addMode === 'roster' ? (
                <div>
                  {/* Add selected button (top) */}
                  {selectedRosterPlayers.size > 0 && (
                    <div className="flex justify-end mb-3">
                      <button
                        onClick={addSelectedPlayers}
                        className="btn btn-primary text-sm py-1 px-3"
                      >
                        + Add {selectedRosterPlayers.size}
                      </button>
                    </div>
                  )}

                  {loading ? (
                    <div className="text-center py-8 text-gray-500">
                      Loading rosters...
                    </div>
                  ) : filteredRoster.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No human players available in roster.
                      <button
                        onClick={() => setAddMode('custom')}
                        className="block mx-auto mt-2 text-blue-600 hover:text-blue-800"
                      >
                        Create a custom player →
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Select all / clear */}
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
                              <span className="text-xl">👤</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{player.name}</div>
                                <div className="text-xs text-gray-500">
                                  {player.default_buzzer_key && `Key: ${player.default_buzzer_key}`}
                                  {player.description && ` • ${player.description}`}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

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
              ) : addMode === 'ai' ? (
                <div className="space-y-4">
                  {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading models...</div>
                  ) : tossupRows.length === 0 && bonusRows.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No AI models available in this dataset.
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500">
                        Tossup and bonus selections are paired top-to-bottom into combined AI
                        players. Extra selections in one column are added as single-phase players.
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        <AiModelChecklist
                          title="Tossup Models"
                          rows={tossupRows}
                          selected={selectedTossupModels}
                          onToggle={toggleTossupModel}
                          onSelectAll={() => setSelectedTossupModels(new Set(tossupRows.map((r) => r.model)))}
                          onClear={() => setSelectedTossupModels(new Set())}
                        />

                        <AiModelChecklist
                          title="Bonus Models"
                          rows={bonusRows}
                          selected={selectedBonusModels}
                          onToggle={toggleBonusModel}
                          onSelectAll={() => setSelectedBonusModels(new Set(bonusRows.map((r) => r.model)))}
                          onClear={() => setSelectedBonusModels(new Set())}
                        />
                      </div>

                      <button
                        onClick={addSelectedAIPlayers}
                        disabled={totalSelectedAi === 0}
                        className="btn btn-primary w-full"
                      >
                        {totalSelectedAi === 0
                          ? 'Add AI Players'
                          : `Add ${totalSelectedAi} AI Player${totalSelectedAi !== 1 ? 's' : ''}`}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
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

                  <button
                    onClick={addCustomPlayer}
                    disabled={!customName.trim()}
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
