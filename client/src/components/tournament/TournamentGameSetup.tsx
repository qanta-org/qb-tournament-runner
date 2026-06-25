import { useState, useEffect } from 'react';
import { useGame, TournamentContext } from '../../context/GameContext';
import { TeamBuilder } from '../setup/TeamBuilder';
import type { GameConfig, ModelInfo, Team, Player } from '../../../../shared/types';

interface TournamentGameSetupProps {
  tournamentContext: TournamentContext;
}

export function TournamentGameSetup({ tournamentContext }: TournamentGameSetupProps) {
  const { gameConfig, startGame } = useGame();

  // Initialize teams from pre-populated config
  const [teamA, setTeamA] = useState<Team>(
    gameConfig?.team_a ?? { name: tournamentContext.teamAName, players: [] }
  );
  const [teamB, setTeamB] = useState<Team>(
    gameConfig?.team_b ?? { name: tournamentContext.teamBName, players: [] }
  );

  const [settings, setSettings] = useState({
    autoStream: gameConfig?.auto_stream ?? false,
    streamingSpeed: gameConfig?.streaming_speed ?? 200,
    autoEvaluate: gameConfig?.auto_evaluate ?? false,
    enablePowerPoints: gameConfig?.enable_power_points ?? false,
    powerPointsValue: gameConfig?.power_points_value ?? 15,
    defaultPointsValue: gameConfig?.default_points_value ?? 10,
    tossupPenaltyValue: gameConfig?.tossup_penalty_value ?? 5,
    bonusPartPoints: gameConfig?.bonus_part_points ?? 10,
    multimodalRevealLockoutSeconds: gameConfig?.multimodal_reveal_lockout_seconds ?? 5,
  });

  const [step, setStep] = useState<'teams' | 'settings'>('teams');

  // Sync if gameConfig arrives late
  useEffect(() => {
    if (gameConfig) {
      setTeamA(gameConfig.team_a);
      setTeamB(gameConfig.team_b);
    }
  }, [gameConfig]);

  // Available models from the config's model directory
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  useEffect(() => {
    if (!gameConfig?.model_directory) return;
    fetch('/api/datasets/list')
      .then((r) => r.json())
      .then((data) => {
        const ds = data.datasets?.find((d: any) => d.responsesDir === gameConfig.model_directory || d.path === gameConfig.model_directory);
        if (ds?.models) {
          setAvailableModels(ds.models as ModelInfo[]);
        }
      })
      .catch(() => { });
  }, [gameConfig?.model_directory]);

  // Dataset ID for roster loading
  const datasetId = (() => {
    if (!gameConfig?.tossup_file) return undefined;

    const segments = gameConfig.tossup_file
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean);

    if (segments.length === 0) return undefined;

    // Remove filename (e.g., tossups.csv)
    segments.pop();

    // Tournament packets are nested under packet_X/
    if (segments.length > 0 && /^packet_/i.test(segments[segments.length - 1])) {
      segments.pop();
    }

    return segments.length > 0 ? segments[segments.length - 1] : undefined;
  })();

  const getAllUsedBuzzerKeys = (): Map<string, string> => {
    const keyMap = new Map<string, string>();
    [...teamA.players, ...teamB.players].forEach((player) => {
      if (player.type === 'human') {
        const key = (player.extra_kwargs as { buzzer_key?: string })?.buzzer_key;
        if (key) keyMap.set(key, player.player_id);
      }
    });
    return keyMap;
  };

  const handleStartGame = () => {
    if (!gameConfig) return;

    const config: GameConfig = {
      ...gameConfig,
      team_a: teamA,
      team_b: teamB,
      auto_stream: settings.autoStream,
      streaming_speed: settings.streamingSpeed,
      auto_evaluate: settings.autoEvaluate,
      enable_power_points: settings.enablePowerPoints,
      power_points_value: settings.powerPointsValue,
      default_points_value: settings.defaultPointsValue,
      tossup_penalty_value: settings.tossupPenaltyValue,
      bonus_part_points: settings.bonusPartPoints,
      multimodal_reveal_lockout_seconds: settings.multimodalRevealLockoutSeconds,
    };

    startGame(config);
  };

  const canStart = teamA.players.length > 0 && teamB.players.length > 0 && gameConfig;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Tournament game header */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Tournament Game</p>
              <p className="text-lg font-bold text-gray-800 mt-1">
                Round {tournamentContext.round}, Match {tournamentContext.matchNumber}
              </p>
              <p className="text-sm text-gray-600">
                {tournamentContext.teamAName} vs {tournamentContext.teamBName}
              </p>
            </div>
            <span className="font-mono text-sm bg-amber-100 px-3 py-1 rounded font-medium text-amber-800">
              {tournamentContext.tournamentCode}
            </span>
          </div>
        </div>

        {/* Step tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setStep('teams')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${step === 'teams' ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-700'
              }`}
          >
            1. Teams & Players
          </button>
          <button
            onClick={() => setStep('settings')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${step === 'settings' ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-700'
              }`}
          >
            2. Game Settings
          </button>
        </div>

        {step === 'teams' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-1">{teamA.name}</h3>
                <p className="text-sm text-gray-500 mb-3">
                  {teamA.players.length} player{teamA.players.length !== 1 ? 's' : ''}
                </p>
                <TeamBuilder
                  team={teamA}
                  onChange={setTeamA}
                  teamLabel={teamA.name}
                  teamColor="#d64960"
                  availableModels={availableModels}
                  datasetId={datasetId}
                  excludedPlayerIds={teamB.players.map((p) => p.player_id)}
                  allUsedBuzzerKeys={getAllUsedBuzzerKeys()}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-1">{teamB.name}</h3>
                <p className="text-sm text-gray-500 mb-3">
                  {teamB.players.length} player{teamB.players.length !== 1 ? 's' : ''}
                </p>
                <TeamBuilder
                  team={teamB}
                  onChange={setTeamB}
                  teamLabel={teamB.name}
                  teamColor="#2a9cad"
                  availableModels={availableModels}
                  datasetId={datasetId}
                  excludedPlayerIds={teamA.players.map((p) => p.player_id)}
                  allUsedBuzzerKeys={getAllUsedBuzzerKeys()}
                />
              </div>
            </div>

            <button
              onClick={() => setStep('settings')}
              className="px-5 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium"
            >
              Next: Game Settings
            </button>
          </div>
        )}

        {step === 'settings' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Game Settings</h3>
            <p className="text-sm text-gray-500">Pre-filled from tournament config. Adjust if needed.</p>

            <div className="bg-white border rounded-lg p-4 space-y-4">
              {/* Streaming */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Auto-stream words</p>
                  <p className="text-xs text-gray-500">Automatically reveal words at set speed</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoStream}
                    onChange={(e) => setSettings({ ...settings, autoStream: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                </label>
              </div>

              {settings.autoStream && (
                <div>
                  <label className="text-sm text-gray-600">Speed (words/min):</label>
                  <input
                    type="number"
                    value={settings.streamingSpeed}
                    onChange={(e) => setSettings({ ...settings, streamingSpeed: parseInt(e.target.value, 10) || 200 })}
                    className="ml-2 border rounded px-2 py-1 w-20 text-sm"
                  />
                </div>
              )}

              {/* Auto-evaluate */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Auto-evaluate answers</p>
                  <p className="text-xs text-gray-500">Automatically accept/reject AI answers</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoEvaluate}
                    onChange={(e) => setSettings({ ...settings, autoEvaluate: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                </label>
              </div>

              {/* Points */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-600">Tossup points</label>
                  <input
                    type="number"
                    value={settings.defaultPointsValue}
                    onChange={(e) => setSettings({ ...settings, defaultPointsValue: parseInt(e.target.value, 10) || 10 })}
                    className="w-full border rounded px-2 py-1 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Neg penalty</label>
                  <input
                    type="number"
                    value={settings.tossupPenaltyValue}
                    onChange={(e) => setSettings({ ...settings, tossupPenaltyValue: parseInt(e.target.value, 10) || 5 })}
                    className="w-full border rounded px-2 py-1 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Bonus part points</label>
                  <input
                    type="number"
                    value={settings.bonusPartPoints}
                    onChange={(e) => setSettings({ ...settings, bonusPartPoints: parseInt(e.target.value, 10) || 10 })}
                    className="w-full border rounded px-2 py-1 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">MM lockout (sec)</label>
                  <input
                    type="number"
                    min={0}
                    value={settings.multimodalRevealLockoutSeconds}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        multimodalRevealLockoutSeconds: Math.max(0, parseInt(e.target.value, 10) || 5),
                      })
                    }
                    className="w-full border rounded px-2 py-1 text-sm mt-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.enablePowerPoints}
                    onChange={(e) => setSettings({ ...settings, enablePowerPoints: e.target.checked })}
                    id="power-points"
                  />
                  <label htmlFor="power-points" className="text-sm text-gray-600">
                    Power points ({settings.powerPointsValue})
                  </label>
                </div>
              </div>
            </div>

            {/* Start button */}
            <button
              onClick={handleStartGame}
              disabled={!canStart}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold text-lg"
            >
              Start Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
