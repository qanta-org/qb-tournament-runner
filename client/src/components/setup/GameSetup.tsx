import { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { TeamBuilder } from './TeamBuilder';
import { FileUploader } from './FileUploader';
import type { GameConfig, Team } from '../../../../shared/types';

type SetupStep = 'files' | 'teams' | 'settings' | 'review';

const DEFAULT_TEAM_A: Team = {
  name: 'Team 1',
  players: [
    {
      name: 'Human Player',
      player_id: 'human1',
      type: 'human',
      extra_kwargs: { buzzer_key: '1' },
    },
  ],
};

const DEFAULT_TEAM_B: Team = {
  name: 'Team 2',
  players: [],
};

export function GameSetup() {
  const { startGame, isConnected } = useGame();

  const [step, setStep] = useState<SetupStep>('files');
  const [teamA, setTeamA] = useState<Team>(DEFAULT_TEAM_A);
  const [teamB, setTeamB] = useState<Team>(DEFAULT_TEAM_B);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [files, setFiles] = useState({
    tossupFile: '',
    bonusFile: '',
    modelDirectory: '',
  });
  const [settings, setSettings] = useState({
    autoStream: false,
    streamingSpeed: 200,
    autoEvaluate: false,
    enablePowerPoints: false,
    powerPointsValue: 15,
    defaultPointsValue: 10,
    tossupPenaltyValue: 5,
    bonusPartPoints: 10,
    multimodalRevealLockoutSeconds: 5,
  });

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
  const handleFilesChange = (newFiles: typeof files, models?: string[], datasetId?: string) => {
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
      suppress_early_ai_second_buzzes: true,
      enable_power_points: settings.enablePowerPoints,
      power_points_value: settings.powerPointsValue,
      default_points_value: settings.defaultPointsValue,
      tossup_penalty_value: settings.tossupPenaltyValue,
      tossup_penalty_value_second_team: 0,
      bonus_part_points: settings.bonusPartPoints,
      multimodal_reveal_lockout_seconds: settings.multimodalRevealLockoutSeconds,
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
                className={`flex-1 text-xs font-medium text-center transition-colors ${
                  i === stepIndex
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
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    step === s
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
                          streamingSpeed: parseInt(e.target.value) || 200,
                        })
                      }
                      min={50}
                      max={500}
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
                          defaultPointsValue: parseInt(e.target.value) || 10,
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
                          tossupPenaltyValue: parseInt(e.target.value) || 5,
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
                          bonusPartPoints: parseInt(e.target.value) || 10,
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
                          multimodalRevealLockoutSeconds: Math.max(0, parseInt(e.target.value) || 5),
                        })
                      }
                      className="input"
                    />
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
                    <div>
                      <p className="font-medium text-team-a">{teamA.name}</p>
                      <ul className="text-sm text-gray-600">
                        {teamA.players.map((p) => (
                          <li key={p.player_id}>
                            {p.type === 'human' ? '👤' : '🤖'} {p.name}
                            {p.type === 'ai' && (
                              <span className="text-xs text-gray-400 ml-1">
                                ({(p.extra_kwargs as any).tossup_model})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-team-b">{teamB.name}</p>
                      <ul className="text-sm text-gray-600">
                        {teamB.players.map((p) => (
                          <li key={p.player_id}>
                            {p.type === 'human' ? '👤' : '🤖'} {p.name}
                            {p.type === 'ai' && (
                              <span className="text-xs text-gray-400 ml-1">
                                ({(p.extra_kwargs as any).tossup_model})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
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
