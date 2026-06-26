import { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { TeamBuilder } from './TeamBuilder';
import { FileUploader } from './FileUploader';
import { fetchRulePresets, fetchRulePreset, type RulePresetSummary } from '../../api/config';
import { fetchHumanRoster } from '../../api/rosters';
import type { AIPlayerKwargs, DeflationMode, GameConfig, ModelInfo, Player, Team } from '../../../../shared/types';
import { aiModelSummaryLines } from '../../../../shared/modelLabels';
import {
  DEFAULT_AI_TOSSUP_SCORE_FACTORS,
  DEFAULT_AUTONOMOUS_K,
  DEFAULT_BONUS_ABSTAIN_POINTS,
  DEFAULT_BONUS_AI_CONSULT_FACTOR,
  DEFAULT_BONUS_DEFLATION_MODE,
  DEFAULT_BONUS_PART_POINTS,
  DEFAULT_BONUS_STATIC_DEFLATION,
  DEFAULT_BONUS_WEIGHT_DEFLATION,
  DEFAULT_ENABLE_POWER_POINTS,
  DEFAULT_MULTIMODAL_REVEAL_LOCKOUT_SECONDS,
  DEFAULT_POWER_POINTS_VALUE,
  DEFAULT_STREAMING_SPEED_WPM,
  DEFAULT_SUPPRESS_EARLY_AI_SECOND_BUZZES,
  DEFAULT_TOSSUP_DEFLATION_MODE,
  DEFAULT_TOSSUP_PENALTY_VALUE,
  DEFAULT_TOSSUP_PENALTY_VALUE_SECOND_TEAM,
  DEFAULT_TOSSUP_POINTS_VALUE,
  DEFAULT_TOSSUP_STATIC_DEFLATION,
  STREAMING_SPEED_MAX_WPM,
  STREAMING_SPEED_MIN_WPM,
} from '../../constants/gameDefaults';

type SetupStep = 'files' | 'teams' | 'settings' | 'review';

const DEFAULT_TEAM_A: Team = {
  name: 'Team 1',
  players: [],
};

const DEFAULT_TEAM_B: Team = {
  name: 'Team 2',
  players: [],
};

interface PresetTeamPickerProps {
  datasetId: string;
  teamColor: string;
  currentTeam: Team;
  onChange: (team: Team) => void;
}

function PresetTeamPicker({ datasetId, teamColor, currentTeam, onChange }: PresetTeamPickerProps) {
  const [presets, setPresets] = useState<Map<string, Player[]>>(new Map());

  useEffect(() => {
    if (!datasetId) { setPresets(new Map()); return; }
    fetchHumanRoster(datasetId).then((data) => {
      const byTeam = new Map<string, Player[]>();
      for (const p of data.players) {
        const groupName = p.team;
        if (!groupName) continue;
        if (!byTeam.has(groupName)) byTeam.set(groupName, []);
        byTeam.get(groupName)!.push({
          player_id: p.player_id,
          name: p.name,
          type: 'human',
          extra_kwargs: { buzzer_key: p.default_buzzer_key || '' },
        });
      }
      // Assign sequential buzzer keys where missing
      for (const players of byTeam.values()) {
        let keyIdx = 1;
        for (const p of players) {
          const bk = (p.extra_kwargs as { buzzer_key: string }).buzzer_key;
          if (!bk) {
            (p.extra_kwargs as { buzzer_key: string }).buzzer_key = String(keyIdx);
          }
          keyIdx++;
        }
      }
      setPresets(byTeam.size >= 2 ? byTeam : new Map());
    }).catch(() => setPresets(new Map()));
  }, [datasetId]);

  if (presets.size < 2) return null;

  const loadPreset = (groupName: string) => {
    const humanPlayers = presets.get(groupName) ?? [];
    const existingAI = currentTeam.players.filter(p => p.type === 'ai');
    onChange({ name: groupName, players: [...existingAI, ...humanPlayers] });
  };

  return (
    <div className="mb-3">
      <p className="text-xs text-gray-500 mb-1">Load preset team:</p>
      <div className="flex flex-wrap gap-2">
        {Array.from(presets.entries()).map(([name, players]) => (
          <button
            key={name}
            onClick={() => loadPreset(name)}
            className="px-3 py-1 text-xs rounded-full border transition-colors hover:opacity-90"
            style={{ borderColor: teamColor, color: teamColor }}
          >
            {name} ({players.length})
          </button>
        ))}
      </div>
    </div>
  );
}

export function GameSetup() {
  const { startGame, isConnected } = useGame();

  const [step, setStep] = useState<SetupStep>('files');
  const [teamA, setTeamA] = useState<Team>(DEFAULT_TEAM_A);
  const [teamB, setTeamB] = useState<Team>(DEFAULT_TEAM_B);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [files, setFiles] = useState({
    tossupFile: '',
    bonusFile: '',
    modelDirectory: '',
  });
  const [settings, setSettings] = useState({
    autoStream: false,
    streamingSpeed: DEFAULT_STREAMING_SPEED_WPM,
    autoEvaluate: false,
    enablePowerPoints: DEFAULT_ENABLE_POWER_POINTS,
    powerPointsValue: DEFAULT_POWER_POINTS_VALUE,
    defaultPointsValue: DEFAULT_TOSSUP_POINTS_VALUE,
    tossupPenaltyValue: DEFAULT_TOSSUP_PENALTY_VALUE,
    bonusPartPoints: DEFAULT_BONUS_PART_POINTS,
    multimodalRevealLockoutSeconds: DEFAULT_MULTIMODAL_REVEAL_LOCKOUT_SECONDS,
    aiTossupScoreFactors: DEFAULT_AI_TOSSUP_SCORE_FACTORS as {
      lightweight: number;
      midweight: number;
      heavyweight: number;
    },
    tossupDeflationMode: DEFAULT_TOSSUP_DEFLATION_MODE as DeflationMode,
    tossupStaticDeflation: DEFAULT_TOSSUP_STATIC_DEFLATION,
    autonomousK: DEFAULT_AUTONOMOUS_K,
    bonusAiConsultFactor: DEFAULT_BONUS_AI_CONSULT_FACTOR,
    bonusDeflationMode: DEFAULT_BONUS_DEFLATION_MODE as DeflationMode,
    bonusStaticDeflation: DEFAULT_BONUS_STATIC_DEFLATION,
    bonusWeightDeflation: DEFAULT_BONUS_WEIGHT_DEFLATION as {
      lightweight: number;
      midweight: number;
      heavyweight: number;
    },
    bonusAbstainPoints: DEFAULT_BONUS_ABSTAIN_POINTS,
  });

  const [rulePresets, setRulePresets] = useState<RulePresetSummary[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  useEffect(() => {
    fetchRulePresets()
      .then((presets) => {
        setRulePresets(presets);
        if (presets.some((p) => p.id === 'qanta26')) {
          void applyPreset('qanta26');
        }
      })
      .catch((err) => console.error('Failed to load rule presets:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = async (id: string) => {
    setSelectedPresetId(id);
    if (!id) return;
    try {
      const preset = await fetchRulePreset(id);
      const c = preset.config;
      setSettings((prev) => ({
        ...prev,
        aiTossupScoreFactors: c.ai_tossup_score_factors ?? prev.aiTossupScoreFactors,
        tossupDeflationMode: c.tossup_deflation_mode ?? prev.tossupDeflationMode,
        tossupStaticDeflation: c.tossup_static_deflation ?? prev.tossupStaticDeflation,
        autonomousK: c.autonomous_default_k ?? prev.autonomousK,
        bonusAiConsultFactor: c.bonus_ai_consult_factor ?? prev.bonusAiConsultFactor,
        bonusDeflationMode: c.bonus_deflation_mode ?? prev.bonusDeflationMode,
        bonusStaticDeflation: c.bonus_static_deflation ?? prev.bonusStaticDeflation,
        bonusWeightDeflation: c.bonus_weight_deflation ?? prev.bonusWeightDeflation,
        bonusAbstainPoints: c.bonus_abstain_points ?? prev.bonusAbstainPoints,
        bonusPartPoints: c.bonus_part_points ?? prev.bonusPartPoints,
      }));
    } catch (err) {
      console.error('Failed to apply rule preset:', err);
    }
  };

  // When files change, try to load available models
  useEffect(() => {
    if (files.modelDirectory) {
      loadModelsFromDirectory(files.modelDirectory);
    } else {
      setAvailableModels([]);
    }
  }, [files.modelDirectory]);

  const loadModelsFromDirectory = async (dir: string) => {
    try {
      // Try to find models by scanning the directory
      // This will work for datasets that were selected from the browser
      const response = await fetch(`/api/datasets/list`);
      if (response.ok) {
        const data = await response.json();
        const dataset = data.datasets?.find((d: any) => d.responsesDir === dir);
        if (dataset?.models) {
          setAvailableModels(dataset.models);
          return;
        }
      }
    } catch {
      // Ignore errors
    }
    setAvailableModels([]);
  };

  // Handle dataset selection from FileUploader - update available models
  const handleFilesChange = (newFiles: typeof files, models?: ModelInfo[], datasetId?: string) => {
    setFiles(newFiles);
    if (models) {
      setAvailableModels(models);
    }
    if (datasetId) {
      setSelectedDatasetId(datasetId);
    }
  };

  // Get all buzzer keys used across both teams (for uniqueness validation)
  const getAllUsedBuzzerKeys = (): Map<string, string> => {
    const keyMap = new Map<string, string>(); // key -> player_id
    [...teamA.players, ...teamB.players].forEach(player => {
      if (player.type === 'human') {
        const key = (player.extra_kwargs as { buzzer_key?: string })?.buzzer_key;
        if (key) {
          keyMap.set(key, player.player_id);
        }
      }
    });
    return keyMap;
  };

  const handleStartGame = () => {
    const config: GameConfig = {
      team_a: teamA,
      team_b: teamB,
      tossup_file: files.tossupFile,
      bonus_file: files.bonusFile,
      model_directory: files.modelDirectory,
      auto_stream: settings.autoStream,
      streaming_speed: settings.streamingSpeed,
      auto_evaluate: settings.autoEvaluate,
      suppress_early_ai_second_buzzes: DEFAULT_SUPPRESS_EARLY_AI_SECOND_BUZZES,
      enable_power_points: settings.enablePowerPoints,
      power_points_value: settings.powerPointsValue,
      default_points_value: settings.defaultPointsValue,
      tossup_penalty_value: settings.tossupPenaltyValue,
      tossup_penalty_value_second_team: DEFAULT_TOSSUP_PENALTY_VALUE_SECOND_TEAM,
      bonus_part_points: settings.bonusPartPoints,
      multimodal_reveal_lockout_seconds: settings.multimodalRevealLockoutSeconds,
      ai_tossup_score_factors: settings.aiTossupScoreFactors,
      tossup_deflation_mode: settings.tossupDeflationMode,
      tossup_static_deflation: settings.tossupStaticDeflation,
      autonomous_default_k: settings.autonomousK,
      bonus_ai_consult_factor: settings.bonusAiConsultFactor,
      bonus_deflation_mode: settings.bonusDeflationMode,
      bonus_static_deflation: settings.bonusStaticDeflation,
      bonus_weight_deflation: settings.bonusWeightDeflation,
      bonus_abstain_points: settings.bonusAbstainPoints,
    };

    startGame(config);
  };

  const canProceedFromFiles = files.tossupFile && files.modelDirectory;
  const canProceedFromTeams = teamA.players.length > 0 && teamB.players.length > 0;

  // Get AI models used by teams
  const getUsedModels = () => {
    const models = new Set<string>();
    [...teamA.players, ...teamB.players].forEach((p) => {
      if (p.type === 'ai') {
        const kwargs = p.extra_kwargs as { tossup_model: string; bonus_model: string };
        models.add(kwargs.tossup_model);
        if (kwargs.bonus_model) models.add(kwargs.bonus_model);
      }
    });
    return Array.from(models);
  };

  const STEPS: SetupStep[] = ['files', 'teams', 'settings', 'review'];
  const STEP_LABELS: Record<SetupStep, string> = {
    files: 'Load Data',
    teams: 'Configure Teams',
    settings: 'Settings',
    review: 'Review',
  };
  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Quiz Bowl Buzzer</h1>
          <p className="text-gray-600">Set up a new game</p>
          {!isConnected && (
            <div className="mt-2 text-yellow-600 text-sm">
              ⚠️ Connecting to server...
            </div>
          )}
        </div>

        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex gap-2 mb-2">
            {STEPS.map((s, i) => (
              <button
                key={s}
                onClick={() => setStep(s)}
                className={`flex-1 text-xs font-medium text-center transition-colors ${i === stepIndex
                    ? 'text-blue-700'
                    : i < stepIndex
                      ? 'text-blue-500 hover:text-blue-700'
                      : 'text-gray-400 hover:text-gray-600'
                  } cursor-pointer`}
              >
                {STEP_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 justify-center">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center">
                <button
                  onClick={() => setStep(s)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${step === s
                      ? 'bg-blue-600 text-white'
                      : i < stepIndex
                        ? 'bg-blue-200 text-blue-700 hover:bg-blue-300'
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                >
                  {i + 1}
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 ${i < stepIndex ? 'bg-blue-300' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="card p-6">
          {/* Step 1: Files */}
          {step === 'files' && (
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-6">Load Game Data</h2>
              <FileUploader files={files} onChange={handleFilesChange} />
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setStep('teams')}
                  disabled={!canProceedFromFiles}
                  className="btn btn-primary"
                >
                  Next: Configure Teams →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Teams */}
          {step === 'teams' && (
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Configure Teams</h2>
              {availableModels.length > 0 && (
                <p className="text-sm text-gray-500 mb-6">
                  {availableModels.length} AI models available from the selected dataset
                </p>
              )}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <PresetTeamPicker
                    datasetId={selectedDatasetId}
                    teamColor="#d64960"
                    currentTeam={teamA}
                    onChange={setTeamA}
                  />
                  <TeamBuilder
                    team={teamA}
                    onChange={setTeamA}
                    teamLabel="Team A"
                    teamColor="#d64960"
                    availableModels={availableModels}
                    datasetId={selectedDatasetId}
                    excludedPlayerIds={teamB.players.map(p => p.player_id)}
                    allUsedBuzzerKeys={getAllUsedBuzzerKeys()}
                  />
                </div>
                <div>
                  <PresetTeamPicker
                    datasetId={selectedDatasetId}
                    teamColor="#2a9cad"
                    currentTeam={teamB}
                    onChange={setTeamB}
                  />
                  <TeamBuilder
                    team={teamB}
                    onChange={setTeamB}
                    teamLabel="Team B"
                    teamColor="#2a9cad"
                    availableModels={availableModels}
                    datasetId={selectedDatasetId}
                    excludedPlayerIds={teamA.players.map(p => p.player_id)}
                    allUsedBuzzerKeys={getAllUsedBuzzerKeys()}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-between">
                <button onClick={() => setStep('files')} className="btn btn-secondary">
                  ← Back
                </button>
                <button
                  onClick={() => setStep('settings')}
                  disabled={!canProceedFromTeams}
                  className="btn btn-primary"
                >
                  Next: Settings →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Settings */}
          {step === 'settings' && (
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-6">Game Settings</h2>
              <div className="space-y-6">
                {/* Rule preset selector */}
                {rulePresets.length > 0 && (
                  <div>
                    <label className="label">Rule Preset</label>
                    <select
                      value={selectedPresetId}
                      onChange={(e) => applyPreset(e.target.value)}
                      className="input w-full"
                    >
                      <option value="">Custom (no preset)</option>
                      {rulePresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {selectedPresetId && (
                      <p className="text-sm text-gray-500 mt-1">
                        {rulePresets.find((p) => p.id === selectedPresetId)?.description}
                      </p>
                    )}
                  </div>
                )}

                {/* Stream mode */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium text-gray-700">Auto Stream Words</label>
                    <p className="text-sm text-gray-500">
                      Automatically reveal words at a set pace
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoStream}
                    onChange={(e) =>
                      setSettings({ ...settings, autoStream: e.target.checked })
                    }
                    className="w-5 h-5"
                  />
                </div>

                {settings.autoStream && (
                  <div>
                    <label className="label">Reading Speed (WPM)</label>
                    <input
                      type="number"
                      value={settings.streamingSpeed}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          streamingSpeed: parseInt(e.target.value) || DEFAULT_STREAMING_SPEED_WPM,
                        })
                      }
                      min={STREAMING_SPEED_MIN_WPM}
                      max={STREAMING_SPEED_MAX_WPM}
                      className="input w-32"
                    />
                  </div>
                )}

                {/* Power points */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium text-gray-700">Enable Power Points</label>
                    <p className="text-sm text-gray-500">
                      Award extra points for early correct answers
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enablePowerPoints}
                    onChange={(e) =>
                      setSettings({ ...settings, enablePowerPoints: e.target.checked })
                    }
                    className="w-5 h-5"
                  />
                </div>

                {/* Point values */}
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="label">Tossup Points</label>
                    <input
                      type="number"
                      value={settings.defaultPointsValue}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          defaultPointsValue: parseInt(e.target.value) || DEFAULT_TOSSUP_POINTS_VALUE,
                        })
                      }
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Penalty Points</label>
                    <input
                      type="number"
                      value={settings.tossupPenaltyValue}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          tossupPenaltyValue: parseInt(e.target.value) || DEFAULT_TOSSUP_PENALTY_VALUE,
                        })
                      }
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Bonus Part Points</label>
                    <input
                      type="number"
                      value={settings.bonusPartPoints}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bonusPartPoints: parseInt(e.target.value) || DEFAULT_BONUS_PART_POINTS,
                        })
                      }
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">MM Lockout (sec)</label>
                    <input
                      type="number"
                      min={0}
                      value={settings.multimodalRevealLockoutSeconds}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          multimodalRevealLockoutSeconds: Math.max(
                            0,
                            parseInt(e.target.value) || DEFAULT_MULTIMODAL_REVEAL_LOCKOUT_SECONDS
                          ),
                        })
                      }
                      className="input"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-base font-semibold mb-3">AI Score Deflation</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="border rounded-lg p-4 space-y-3">
                    <div>
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
                    </div>
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
                              tossupStaticDeflation: Math.max(
                                0,
                                parseInt(e.target.value) || 0
                              ),
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
                    <p className="text-xs text-gray-500">
                      Weighted multiplies a correct AI buzz by its model-size factor.
                    </p>
                  </div>

                  <div className="border rounded-lg p-4 space-y-3">
                    <div>
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
                        <option value="weighted">Weighted (by model size)</option>
                      </select>
                    </div>
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
                              bonusStaticDeflation: Math.max(
                                0,
                                parseInt(e.target.value) || 0
                              ),
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
                      Weighted subtracts the sum of model-size deflation points for the team's AI
                      teammates from the bonus part value.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button onClick={() => setStep('teams')} className="btn btn-secondary">
                  ← Back
                </button>
                <button onClick={() => setStep('review')} className="btn btn-primary">
                  Next: Review →
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 'review' && (
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-6">Review & Start</h2>

              <div className="space-y-4">
                {/* Files summary */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-700 mb-2">Data Files</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>📝 Tossups: {files.tossupFile.split('/').pop() || 'Not selected'}</li>
                    <li>🎯 Bonuses: {files.bonusFile ? files.bonusFile.split('/').pop() : 'None'}</li>
                    <li>🧠 Models: {files.modelDirectory.split('/').pop() || 'Not selected'}</li>
                  </ul>
                </div>

                {/* Teams summary */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-700 mb-2">Teams</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {([
                      { team: teamA, colorClass: 'text-team-a' },
                      { team: teamB, colorClass: 'text-team-b' },
                    ] as { team: Team; colorClass: string }[]).map(({ team, colorClass }) => (
                      <div key={team.name}>
                        <p className={`font-medium ${colorClass}`}>{team.name}</p>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {team.players.map((p) => (
                            <li key={p.player_id}>
                              <span>{p.type === 'human' ? '👤' : '🤖'} {p.name}</span>
                              {p.type === 'ai' && (() => {
                                const { tossup, bonus } = aiModelSummaryLines(p.extra_kwargs as AIPlayerKwargs);
                                return (
                                  <div className="ml-5 text-xs space-y-0.5">
                                    <div className={tossup ? 'text-gray-400' : 'text-gray-300 italic'}>
                                      T: {tossup ?? '[None]'}
                                    </div>
                                    <div className={bonus ? 'text-gray-400' : 'text-gray-300 italic'}>
                                      B: {bonus ?? '[None]'}
                                    </div>
                                  </div>
                                );
                              })()}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Settings summary */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-700 mb-2">Settings</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>
                      Stream Mode: {settings.autoStream ? `Auto (${settings.streamingSpeed} WPM)` : 'Manual'}
                    </li>
                    <li>Power Points: {settings.enablePowerPoints ? 'Enabled' : 'Disabled'}</li>
                    <li>
                      Points: +{settings.defaultPointsValue} / -{settings.tossupPenaltyValue} / +
                      {settings.bonusPartPoints} (bonus)
                    </li>
                    <li>Multimodal lockout: {settings.multimodalRevealLockoutSeconds}s</li>
                  </ul>
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button onClick={() => setStep('settings')} className="btn btn-secondary">
                  ← Back
                </button>
                <button
                  onClick={handleStartGame}
                  disabled={!isConnected}
                  className="btn btn-success text-lg px-8"
                >
                  🎮 Start Game
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
