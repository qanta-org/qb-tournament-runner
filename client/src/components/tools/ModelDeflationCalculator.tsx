import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchRulePreset, fetchRulePresets, type RulePresetSummary } from '../../api/config';
import type { DatasetInfo } from '../../api/datasets';
import { fetchBonusModelRoster, fetchTossupModelRoster } from '../../api/rosters';
import {
  DEFAULT_DEFLATION_CALC_SETTINGS,
  explainBonusConsult,
  explainTossupPoints,
  groupModelsByWeight,
  WEIGHT_GROUP_LABEL,
  WEIGHT_GROUP_ORDER,
  type DeflationCalcSettings,
  type WeightGroup,
} from '../../utils/modelDeflationCalc';
import type { DeflationMode, ModelRosterEntry } from '../../../../shared/types';

const WEIGHT_BADGE: Record<WeightGroup, string> = {
  lightweight: 'bg-green-100 text-green-700',
  midweight: 'bg-amber-100 text-amber-700',
  heavyweight: 'bg-red-100 text-red-700',
  unknown: 'bg-gray-100 text-gray-600',
};

function applyPresetToSettings(
  prev: DeflationCalcSettings,
  presetConfig: Partial<{
    enable_power_points: boolean;
    default_points_value: number;
    power_points_value: number;
    bonus_part_points: number;
    tossup_deflation_mode: DeflationMode;
    tossup_static_deflation: number;
    ai_tossup_score_factors: DeflationCalcSettings['aiTossupScoreFactors'];
    bonus_deflation_mode: DeflationMode;
    bonus_static_deflation: number;
    bonus_weight_deflation: DeflationCalcSettings['bonusWeightDeflation'];
  }>
): DeflationCalcSettings {
  return {
    enablePowerPoints: presetConfig.enable_power_points ?? prev.enablePowerPoints,
    defaultPointsValue: presetConfig.default_points_value ?? prev.defaultPointsValue,
    powerPointsValue: presetConfig.power_points_value ?? prev.powerPointsValue,
    bonusPartPoints: presetConfig.bonus_part_points ?? prev.bonusPartPoints,
    tossupDeflationMode: presetConfig.tossup_deflation_mode ?? prev.tossupDeflationMode,
    tossupStaticDeflation: presetConfig.tossup_static_deflation ?? prev.tossupStaticDeflation,
    aiTossupScoreFactors: presetConfig.ai_tossup_score_factors
      ? { ...presetConfig.ai_tossup_score_factors }
      : prev.aiTossupScoreFactors,
    bonusDeflationMode: presetConfig.bonus_deflation_mode ?? prev.bonusDeflationMode,
    bonusStaticDeflation: presetConfig.bonus_static_deflation ?? prev.bonusStaticDeflation,
    bonusWeightDeflation: presetConfig.bonus_weight_deflation
      ? { ...presetConfig.bonus_weight_deflation }
      : prev.bonusWeightDeflation,
  };
}

interface ModelSelectorProps {
  title: string;
  subtitle: string;
  entries: ModelRosterEntry[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectGroup: (group: WeightGroup, select: boolean) => void;
}

function ModelSelector({
  title,
  subtitle,
  entries,
  selectedIds,
  onToggle,
  onSelectGroup,
}: ModelSelectorProps) {
  const grouped = useMemo(() => groupModelsByWeight(entries), [entries]);

  return (
    <div className="card p-4 h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
        <p className="text-sm text-gray-500">{subtitle}</p>
        <p className="text-xs text-gray-400 mt-1">{selectedIds.size} selected</p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No models loaded for this dataset.</p>
      ) : (
        <div className="space-y-4 max-h-[32rem] overflow-y-auto pr-1">
          {WEIGHT_GROUP_ORDER.map((group) => {
            const models = grouped.get(group) ?? [];
            if (models.length === 0) return null;
            const allSelected = models.every((m) => selectedIds.has(m.id));
            const someSelected = models.some((m) => selectedIds.has(m.id));

            return (
              <div key={group} className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${WEIGHT_BADGE[group]}`}>
                      {WEIGHT_GROUP_LABEL[group]}
                    </span>
                    <span className="text-xs text-gray-500">{models.length} models</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectGroup(group, !allSelected)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {allSelected ? 'Clear group' : someSelected ? 'Select group' : 'Select all'}
                  </button>
                </div>
                <div className="divide-y">
                  {models.map((entry) => {
                    const checked = selectedIds.has(entry.id);
                    return (
                      <label
                        key={entry.id}
                        className={`flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-blue-50/50 ${
                          checked ? 'bg-blue-50' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggle(entry.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-gray-800">{entry.name}</div>
                          <div className="text-xs text-gray-400 truncate" title={entry.model}>
                            {entry.model}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ModelDeflationCalculator() {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [datasetId, setDatasetId] = useState('');
  const [tossupModels, setTossupModels] = useState<ModelRosterEntry[]>([]);
  const [bonusModels, setBonusModels] = useState<ModelRosterEntry[]>([]);
  const [rosterSource, setRosterSource] = useState('');
  const [presets, setPresets] = useState<RulePresetSummary[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [settings, setSettings] = useState<DeflationCalcSettings>(DEFAULT_DEFLATION_CALC_SETTINGS);
  const [selectedTossupIds, setSelectedTossupIds] = useState<Set<string>>(new Set());
  const [selectedBonusIds, setSelectedBonusIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/datasets/list')
      .then((r) => r.json())
      .then((data: { datasets: DatasetInfo[] }) => setDatasets(data.datasets ?? []))
      .catch(() => setDatasets([]));

    fetchRulePresets()
      .then((list) => {
        setPresets(list);
        const qanta = list.find((p) => p.id === 'qanta26');
        if (qanta) setSelectedPresetId(qanta.id);
      })
      .catch(() => setPresets([]));
  }, []);

  useEffect(() => {
    if (!selectedPresetId) return;
    fetchRulePreset(selectedPresetId)
      .then((preset) => setSettings((prev) => applyPresetToSettings(prev, preset.config)))
      .catch(() => {});
  }, [selectedPresetId]);

  useEffect(() => {
    const query = datasetId || undefined;
    Promise.all([fetchTossupModelRoster(query), fetchBonusModelRoster(query)]).then(
      ([tossupRes, bonusRes]) => {
        setTossupModels(tossupRes.entries);
        setBonusModels(bonusRes.entries);
        setRosterSource(tossupRes.source || bonusRes.source || 'none');
        setSelectedTossupIds(new Set());
        setSelectedBonusIds(new Set());
      }
    );
  }, [datasetId]);

  const selectedTossupEntries = useMemo(
    () => tossupModels.filter((m) => selectedTossupIds.has(m.id)),
    [tossupModels, selectedTossupIds]
  );
  const selectedBonusEntries = useMemo(
    () => bonusModels.filter((m) => selectedBonusIds.has(m.id)),
    [bonusModels, selectedBonusIds]
  );

  const tossupBreakdowns = useMemo(
    () => selectedTossupEntries.map((entry) => explainTossupPoints(settings, entry)),
    [selectedTossupEntries, settings]
  );
  const maxTossupPoints = tossupBreakdowns.length
    ? Math.max(...tossupBreakdowns.map((b) => b.points))
    : null;
  const bonusBreakdown = useMemo(
    () => explainBonusConsult(settings, selectedBonusEntries),
    [selectedBonusEntries, settings]
  );

  const toggleTossup = (id: string) => {
    setSelectedTossupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBonus = (id: string) => {
    setSelectedBonusIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectTossupGroup = (group: WeightGroup, select: boolean) => {
    const ids = (groupModelsByWeight(tossupModels).get(group) ?? []).map((m) => m.id);
    setSelectedTossupIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const selectBonusGroup = (group: WeightGroup, select: boolean) => {
    const ids = (groupModelsByWeight(bonusModels).get(group) ?? []).map((m) => m.id);
    setSelectedBonusIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const baseTossup = settings.enablePowerPoints
    ? settings.powerPointsValue
    : settings.defaultPointsValue;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-indigo-700 text-white px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Model Deflation Calculator</h1>
            <p className="text-indigo-200 text-sm">
              Compare max tossup and bonus consult points by model weight class
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-indigo-200 hover:text-white text-sm whitespace-nowrap"
          >
            ← Back to home
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Config row */}
        <div className="card p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Dataset (model rosters)</label>
            <select
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              className="input"
            >
              <option value="">Global / default rosters</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {rosterSource && rosterSource !== 'none' && (
              <p className="text-xs text-gray-400 mt-1">Source: {rosterSource}</p>
            )}
          </div>
          <div>
            <label className="label">Rule preset</label>
            <select
              value={selectedPresetId}
              onChange={(e) => setSelectedPresetId(e.target.value)}
              className="input"
            >
              <option value="">Custom settings</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Tossup base pts</label>
              <input
                type="number"
                min={0}
                value={settings.defaultPointsValue}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultPointsValue: Math.max(0, parseInt(e.target.value) || 0),
                  })
                }
                className="input"
              />
            </div>
            <div>
              <label className="label">Bonus part pts</label>
              <input
                type="number"
                min={0}
                value={settings.bonusPartPoints}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    bonusPartPoints: Math.max(0, parseInt(e.target.value) || 0),
                  })
                }
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Deflation settings */}
        <div className="card p-4">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Deflation rules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border rounded-lg p-3 space-y-3">
              <label className="label">Tossup deflation</label>
              <select
                value={settings.tossupDeflationMode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    tossupDeflationMode: e.target.value as DeflationMode,
                  })
                }
                className="input"
              >
                <option value="none">None (full points)</option>
                <option value="static">Static (fixed deflation)</option>
                <option value="weighted">Weighted (by model size)</option>
              </select>
              {settings.tossupDeflationMode === 'static' && (
                <div>
                  <label className="label">Static deflation (points)</label>
                  <input
                    type="number"
                    min={0}
                    value={settings.tossupStaticDeflation}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        tossupStaticDeflation: Math.max(0, parseInt(e.target.value) || 0),
                      })
                    }
                    className="input"
                  />
                </div>
              )}
              {settings.tossupDeflationMode === 'weighted' && (
                <div className="grid grid-cols-3 gap-2">
                  {(['lightweight', 'midweight', 'heavyweight'] as const).map((wc) => (
                    <div key={wc}>
                      <label className="label">
                        {wc === 'lightweight' ? 'LW' : wc === 'midweight' ? 'MW' : 'HW'} ×
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={settings.aiTossupScoreFactors[wc]}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            aiTossupScoreFactors: {
                              ...settings.aiTossupScoreFactors,
                              [wc]: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                        className="input"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border rounded-lg p-3 space-y-3">
              <label className="label">Bonus consult deflation</label>
              <select
                value={settings.bonusDeflationMode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    bonusDeflationMode: e.target.value as DeflationMode,
                  })
                }
                className="input"
              >
                <option value="none">None (full points)</option>
                <option value="static">Static (fixed deflation)</option>
                <option value="weighted">Weighted (sum by team AI models)</option>
              </select>
              {settings.bonusDeflationMode === 'static' && (
                <div>
                  <label className="label">Static deflation (points)</label>
                  <input
                    type="number"
                    min={0}
                    value={settings.bonusStaticDeflation}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        bonusStaticDeflation: Math.max(0, parseInt(e.target.value) || 0),
                      })
                    }
                    className="input"
                  />
                </div>
              )}
              {settings.bonusDeflationMode === 'weighted' && (
                <div className="grid grid-cols-3 gap-2">
                  {(['lightweight', 'midweight', 'heavyweight'] as const).map((wc) => (
                    <div key={wc}>
                      <label className="label">
                        {wc === 'lightweight' ? 'LW' : wc === 'midweight' ? 'MW' : 'HW'} −
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={settings.bonusWeightDeflation[wc]}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            bonusWeightDeflation: {
                              ...settings.bonusWeightDeflation,
                              [wc]: Math.max(0, parseInt(e.target.value) || 0),
                            },
                          })
                        }
                        className="input"
                      />
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500">
                Weighted bonus deflation sums over all selected bonus models on the team.
              </p>
            </div>
          </div>
        </div>

        {/* Model selectors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ModelSelector
            title="Tossup models"
            subtitle="Select models that could buzz on tossups"
            entries={tossupModels}
            selectedIds={selectedTossupIds}
            onToggle={toggleTossup}
            onSelectGroup={selectTossupGroup}
          />
          <ModelSelector
            title="Bonus models"
            subtitle="Select models used for bonus AI consultation"
            entries={bonusModels}
            selectedIds={selectedBonusIds}
            onToggle={toggleBonus}
            onSelectGroup={selectBonusGroup}
          />
        </div>

        {/* Results */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5 border-l-4 border-blue-500">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Tossup points</h2>
            <p className="text-sm text-gray-500 mb-4">
              Max correct buzz value if any selected tossup model answers correctly
              (base: {baseTossup} pts)
            </p>

            {tossupBreakdowns.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Select one or more tossup models.</p>
            ) : (
              <>
                <div className="text-3xl font-bold text-blue-700 mb-4">
                  {maxTossupPoints} pts max
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 font-medium">Model</th>
                      <th className="pb-2 font-medium">Weight</th>
                      <th className="pb-2 font-medium text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tossupBreakdowns
                      .slice()
                      .sort((a, b) => b.points - a.points)
                      .map(({ entry, points, detail }) => (
                        <tr
                          key={entry.id}
                          className={`border-b border-gray-100 ${
                            points === maxTossupPoints ? 'bg-blue-50 font-medium' : ''
                          }`}
                        >
                          <td className="py-2 pr-2">
                            <div>{entry.name}</div>
                            <div className="text-xs text-gray-400">{detail}</div>
                          </td>
                          <td className="py-2">
                            {entry.weight_class ? (
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  WEIGHT_BADGE[entry.weight_class]
                                }`}
                              >
                                {entry.weight_class === 'lightweight'
                                  ? 'LW'
                                  : entry.weight_class === 'midweight'
                                    ? 'MW'
                                    : 'HW'}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums">{points}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="card p-5 border-l-4 border-purple-500">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Bonus consult points</h2>
            <p className="text-sm text-gray-500 mb-4">
              Points for a correct bonus part when consulting the selected bonus models
            </p>

            {selectedBonusEntries.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Select one or more bonus models.</p>
            ) : (
              <>
                <div className="text-3xl font-bold text-purple-700 mb-2">
                  {bonusBreakdown.points} pts
                </div>
                <p className="text-sm text-gray-600 mb-4">{bonusBreakdown.detail}</p>

                {bonusBreakdown.contributions.length > 0 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="pb-2 font-medium">Model</th>
                        <th className="pb-2 font-medium">Weight</th>
                        <th className="pb-2 font-medium text-right">Deflation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bonusBreakdown.contributions.map(({ entry, weightClass, subtract }) => (
                        <tr key={entry.id} className="border-b border-gray-100">
                          <td className="py-2">{entry.name}</td>
                          <td className="py-2">
                            {weightClass ? (
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${WEIGHT_BADGE[weightClass]}`}
                              >
                                {weightClass === 'lightweight'
                                  ? 'LW'
                                  : weightClass === 'midweight'
                                    ? 'MW'
                                    : 'HW'}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 text-right tabular-nums text-red-600">
                            −{subtract}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-medium">
                        <td className="pt-2" colSpan={2}>
                          Total deflation
                        </td>
                        <td className="pt-2 text-right tabular-nums text-red-600">
                          −{bonusBreakdown.totalDeflation}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
