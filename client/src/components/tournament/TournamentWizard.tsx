import { useState, useEffect, useCallback, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../../socket';
import type {
  TournamentFormat,
  TournamentTeam,
  PacketInfo,
  Player,
  CreateTournamentParams,
  AIPlayerKwargs,
  AIWeightClass,
  ModelInfo,
  ModelRosterEntry,
} from '../../../../shared/types';
import { DEFAULT_GAME_CONFIG } from '../../../../shared/types';
import { fetchRulePresets, fetchRulePreset, type RulePresetSummary } from '../../api/config';
import type { DeflationMode, GameConfig } from '../../../../shared/types';
import { AiModelEditor, buildAiKwargsFromRoster, deriveModelPools } from '../setup/TeamBuilder';
import { fetchBonusModelRoster, fetchTossupModelRoster } from '../../api/rosters';
import {
  buildScheduleRounds,
  computeFormatSummary,
  bracketGameCount,
  getAllowedPlayoffSizes,
  rrRoundCount,
  snakeDraftGroups,
  type PrelimStrategy,
  type PlayoffStrategy,
  type Phase2Style,
  type ScheduleRound,
} from '../../../../shared/schedule-utils';

type WizardStep = 'dataset' | 'teams' | 'format' | 'schedule' | 'settings' | 'review';

const STEP_LABELS: Record<WizardStep, string> = {
  dataset: 'Dataset',
  teams: 'Teams',
  format: 'Format',
  schedule: 'Schedule & Packets',
  settings: 'Settings',
  review: 'Review & Create',
};

interface DatasetInfo {
  id: string;
  name: string;
  type: string;
  packets?: PacketInfo[];
  tossupFile?: string;
  bonusFile?: string;
  humanPlayers?: { player_id: string; name: string; type: string; team?: string }[];
  aiPlayers?: {
    player_id: string;
    name: string;
    type: string;
    tossup_model?: string;
    bonus_model?: string;
    weight_class?: AIWeightClass;
  }[];
  path?: string;
  responsesDir?: string;
  models?: ModelInfo[];
}

type RosterAiPlayer = NonNullable<DatasetInfo['aiPlayers']>[number];

/** Build AI kwargs from a tournament roster AI entry, inferring coupling and display names. */
function buildTournamentAiKwargs(
  rp: RosterAiPlayer,
  tossupRoster: ModelRosterEntry[],
  bonusRoster: ModelRosterEntry[]
): AIPlayerKwargs {
  return buildAiKwargsFromRoster({ ...rp, type: 'ai' as const }, tossupRoster, bonusRoster);
}

/**
 * Per-team AI teammate assignment for the tournament wizard. Lets each enabled
 * team add AI teammates (from the dataset roster or custom) and freely compose
 * their tossup/bonus models via the shared coupled/decoupled editor.
 */
function TournamentAiAssignment({
  enabledTeams,
  rosterAiPlayers,
  availableModels,
  tossupRoster,
  bonusRoster,
  aiAssignments,
  setAiAssignments,
}: {
  enabledTeams: TournamentTeam[];
  rosterAiPlayers: RosterAiPlayer[];
  availableModels: ModelInfo[];
  tossupRoster: ModelRosterEntry[];
  bonusRoster: ModelRosterEntry[];
  aiAssignments: Record<string, Player[]>;
  setAiAssignments: React.Dispatch<React.SetStateAction<Record<string, Player[]>>>;
}) {
  const pools = deriveModelPools(availableModels);

  const setTeamPlayers = (teamId: string, players: Player[]) =>
    setAiAssignments((prev) => ({ ...prev, [teamId]: players }));

  // Player IDs already assigned anywhere, so a roster AI is not double-added.
  const assignedIds = new Set(
    Object.values(aiAssignments).flat().map((p) => p.player_id)
  );

  const addRosterAi = (teamId: string, rp: RosterAiPlayer) => {
    const player: Player = {
      player_id: rp.player_id,
      name: rp.name,
      type: 'ai',
      extra_kwargs: buildTournamentAiKwargs(rp, tossupRoster, bonusRoster),
    };
    setTeamPlayers(teamId, [...(aiAssignments[teamId] || []), player]);
  };

  const addCustomAi = (teamId: string) => {
    const existing = aiAssignments[teamId] || [];
    const player: Player = {
      player_id: `custom_ai_${teamId}_${Date.now()}`,
      name: `AI Teammate ${existing.length + 1}`,
      type: 'ai',
      extra_kwargs: { tossup_model: '', bonus_model: '', coupled: true },
    };
    setTeamPlayers(teamId, [...existing, player]);
  };

  const removeAi = (teamId: string, playerId: string) => {
    setTeamPlayers(teamId, (aiAssignments[teamId] || []).filter((p) => p.player_id !== playerId));
  };

  const updateAiKwargs = (
    teamId: string,
    playerId: string,
    next: Partial<AIPlayerKwargs>
  ) => {
    setTeamPlayers(
      teamId,
      (aiAssignments[teamId] || []).map((p) =>
        p.player_id === playerId
          ? { ...p, extra_kwargs: { ...(p.extra_kwargs as AIPlayerKwargs), ...next } }
          : p
      )
    );
  };

  const updateAiName = (teamId: string, playerId: string, name: string) => {
    setTeamPlayers(
      teamId,
      (aiAssignments[teamId] || []).map((p) => (p.player_id === playerId ? { ...p, name } : p))
    );
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">AI Teammates (optional)</h3>
      <p className="text-xs text-gray-500">
        Add AI teammates to any team. Each AI can use a single model for both phases
        (coupled) or independent tossup and bonus models (decoupled).
      </p>
      <div className="grid grid-cols-2 gap-3">
        {enabledTeams.map((t) => {
          const assigned = aiAssignments[t.id] || [];
          const available = rosterAiPlayers.filter((rp) => !assignedIds.has(rp.player_id));
          return (
            <div key={t.id} className="bg-white border rounded-lg p-3 space-y-2">
              <p className="font-medium text-sm text-gray-800">{t.name}</p>

              {assigned.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No AI teammates</p>
              ) : (
                <div className="space-y-2">
                  {assigned.map((p) => (
                    <div key={p.player_id} className="bg-gray-50 rounded-lg p-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🤖</span>
                        <input
                          type="text"
                          value={p.name}
                          onChange={(e) => updateAiName(t.id, p.player_id, e.target.value)}
                          className="flex-1 min-w-0 text-sm font-medium bg-transparent border-b focus:outline-none"
                        />
                        <button
                          onClick={() => removeAi(t.id, p.player_id)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Remove AI teammate"
                        >
                          ✕
                        </button>
                      </div>
                      <AiModelEditor
                        kwargs={p.extra_kwargs as AIPlayerKwargs}
                        hasModelInfo={pools.hasModelInfo}
                        allModelNames={pools.allModelNames}
                        tossupModelNames={pools.tossupModelNames}
                        bonusModelNames={pools.bonusModelNames}
                        coupledModelNames={pools.coupledModelNames}
                        tossupRoster={tossupRoster}
                        bonusRoster={bonusRoster}
                        onChange={(next) => updateAiKwargs(t.id, p.player_id, next)}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {available.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const rp = available.find((x) => x.player_id === e.target.value);
                      if (rp) addRosterAi(t.id, rp);
                    }}
                    className="border rounded px-2 py-1 text-xs"
                  >
                    <option value="">+ From roster…</option>
                    {available.map((rp) => (
                      <option key={rp.player_id} value={rp.player_id}>
                        {rp.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => addCustomAi(t.id)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  + Custom AI
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildFormat(
  prelim: PrelimStrategy,
  playoff: PlayoffStrategy,
  qualifierRR: boolean
): TournamentFormat {
  const prelimMap: Record<PrelimStrategy, TournamentFormat['prelim']> = {
    none: 'none',
    round_robin: 'full_rr',
    double_round_robin: 'double_rr',
    grouped_round_robin: 'grouped_rr',
  };
  return {
    prelim: prelimMap[prelim],
    qualifiers: qualifierRR ? { kind: 'rr' } : { kind: 'none' },
    playoffs: playoff === 'single_elim' ? 'single_elim' : 'none',
  };
}

function formatDisplayString(format: TournamentFormat): string {
  const prelimLabels: Record<TournamentFormat['prelim'], string> = {
    none: 'No prelims',
    full_rr: 'Round Robin (1x)',
    double_rr: 'Round Robin (2x)',
    grouped_rr: 'Grouped Round Robin',
  };
  const base = prelimLabels[format.prelim];
  if (format.playoffs === 'none') return base;
  if (format.qualifiers.kind === 'rr') return `${base} → Qualifier RR → Single Elimination`;
  return `${base} → Single Elimination`;
}

// ============================================================================
// Component
// ============================================================================

export function TournamentWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>('dataset');
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<DatasetInfo | null>(null);
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [enabledTeamIds, setEnabledTeamIds] = useState<Set<string>>(new Set());
  const [aiAssignments, setAiAssignments] = useState<Record<string, Player[]>>({});
  const [tossupRoster, setTossupRoster] = useState<ModelRosterEntry[]>([]);
  const [bonusRoster, setBonusRoster] = useState<ModelRosterEntry[]>([]);
  const [prelimStrategy, setPrelimStrategy] = useState<PrelimStrategy>('round_robin');
  const [playoffStrategy, setPlayoffStrategy] = useState<PlayoffStrategy>('none');
  const [playoffBracketSize, setPlayoffBracketSize] = useState<2 | 4 | 8>(4);
  const [rulePresets, setRulePresets] = useState<RulePresetSummary[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [rulePresetOverrides, setRulePresetOverrides] = useState<Partial<GameConfig>>({});

  // Grouped RR state
  const [numGroups, setNumGroups] = useState(2);
  const [groupAssignments, setGroupAssignments] = useState<Record<string, string[]>>({});
  const [showGroupCustomize, setShowGroupCustomize] = useState(false);
  const [advancePerGroup, setAdvancePerGroup] = useState(1);
  const [phase2Style, setPhase2Style] = useState<Phase2Style>('bracket');

  const [tournamentName, setTournamentName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scheduleRounds, setScheduleRounds] = useState<ScheduleRound[]>([]);
  const [dragPacketId, setDragPacketId] = useState<string | null>(null);

  const availablePackets: PacketInfo[] = selectedDataset?.packets ?? [];
  const totalPackets = availablePackets.length;
  const enabledTeamList = teams.filter((t) => enabledTeamIds.has(t.id));
  const n = enabledTeamList.length;

  // Auto-rebuild groups when team count or numGroups changes
  useEffect(() => {
    if (prelimStrategy === 'grouped_round_robin' && n >= 2) {
      const teamIds = enabledTeamList.map((t) => t.id);
      setGroupAssignments(snakeDraftGroups(teamIds, Math.min(numGroups, Math.floor(n / 2))));
    }
  }, [prelimStrategy, numGroups, enabledTeamIds.size]);

  useEffect(() => {
    fetchRulePresets()
      .then(setRulePresets)
      .catch((err) => console.error('Failed to load rule presets:', err));
  }, []);

  const applyRulePreset = async (id: string) => {
    setSelectedPresetId(id);
    if (!id) {
      setRulePresetOverrides({});
      return;
    }
    try {
      const preset = await fetchRulePreset(id);
      setRulePresetOverrides(preset.config ?? {});
    } catch (err) {
      console.error('Failed to apply rule preset:', err);
    }
  };

  // ---- AI deflation settings (stored on rulePresetOverrides) ----
  const setOverride = (patch: Partial<GameConfig>) =>
    setRulePresetOverrides((prev) => ({ ...prev, ...patch }));

  const tossupDeflationMode =
    rulePresetOverrides.tossup_deflation_mode ?? DEFAULT_GAME_CONFIG.tossup_deflation_mode!;
  const tossupStaticDeflation =
    rulePresetOverrides.tossup_static_deflation ?? DEFAULT_GAME_CONFIG.tossup_static_deflation!;
  const aiTossupScoreFactors =
    rulePresetOverrides.ai_tossup_score_factors ?? DEFAULT_GAME_CONFIG.ai_tossup_score_factors!;
  const bonusDeflationMode =
    rulePresetOverrides.bonus_deflation_mode ?? DEFAULT_GAME_CONFIG.bonus_deflation_mode!;
  const bonusStaticDeflation =
    rulePresetOverrides.bonus_static_deflation ?? DEFAULT_GAME_CONFIG.bonus_static_deflation!;
  const bonusWeightDeflation =
    rulePresetOverrides.bonus_weight_deflation ?? DEFAULT_GAME_CONFIG.bonus_weight_deflation!;

  // Derive qualifier count (grouped) or pool size (non-grouped)
  const qualifierCount = prelimStrategy === 'grouped_round_robin'
    ? (Object.keys(groupAssignments).length || numGroups) * advancePerGroup
    : 0;

  const poolSize = prelimStrategy === 'grouped_round_robin' ? qualifierCount : n;

  const showPhase2Choice =
    prelimStrategy === 'grouped_round_robin' &&
    playoffStrategy === 'single_elim' &&
    qualifierCount > 2;

  const allowedPlayoffSizes = playoffStrategy === 'single_elim' ? getAllowedPlayoffSizes(poolSize) : [];

  const useQualifierRR = showPhase2Choice && phase2Style === 'round_robin';
  const format: TournamentFormat = buildFormat(prelimStrategy, playoffStrategy, useQualifierRR);

  const effectivePlayoffCount = (() => {
    if (playoffStrategy !== 'single_elim') return 0;
    const allowed = getAllowedPlayoffSizes(poolSize);
    const size = allowed.includes(playoffBracketSize) ? playoffBracketSize : (allowed[allowed.length - 1] ?? 2);
    return Math.min(size, poolSize);
  })();

  useEffect(() => {
    if (playoffStrategy !== 'single_elim') return;
    const allowed = getAllowedPlayoffSizes(poolSize);
    if (allowed.length > 0 && !allowed.includes(playoffBracketSize)) {
      setPlayoffBracketSize(allowed[allowed.length - 1] ?? 2);
    }
  }, [poolSize, playoffStrategy, playoffBracketSize]);

  // ---- Format helpers ----


  useEffect(() => {
    fetch('/api/datasets/list')
      .then((r) => r.json())
      .then((d) => setDatasets(d.datasets || []))
      .catch(() => setDatasets([]));
  }, []);

  useEffect(() => {
    if (!selectedDataset?.id) return;
    fetch(`/api/datasets/${selectedDataset.id}`)
      .then((r) => r.json())
      .then((d: DatasetInfo) => setSelectedDataset(d))
      .catch(() => setError('Failed to load dataset'));
  }, [selectedDataset?.id]);

  useEffect(() => {
    if (!selectedDataset?.id) {
      setTossupRoster([]);
      setBonusRoster([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchTossupModelRoster(selectedDataset.id),
      fetchBonusModelRoster(selectedDataset.id),
    ]).then(([tossup, bonus]) => {
      if (!cancelled) {
        setTossupRoster(tossup.entries);
        setBonusRoster(bonus.entries);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedDataset?.id]);

  useEffect(() => {
    if (!selectedDataset?.humanPlayers) return;
    const byTeam = new Map<string, { name: string; players: Player[] }>();
    for (const p of selectedDataset.humanPlayers) {
      const teamName = p.team || 'Ungrouped';
      if (!byTeam.has(teamName)) {
        byTeam.set(teamName, { name: teamName, players: [] });
      }
      byTeam.get(teamName)!.players.push({
        player_id: p.player_id,
        name: p.name,
        type: 'human',
        extra_kwargs: { buzzer_key: p.player_id.slice(0, 1) || '1' },
      });
    }
    const built: TournamentTeam[] = Array.from(byTeam.entries()).map(([id, { name, players }]) => ({
      id,
      name,
      humanPlayers: players,
      // AI teammates are tracked separately in `aiAssignments` and merged at create
      // time; keep this effect independent of them so editing AI assignments does
      // not reset which teams are enabled.
      aiPlayers: [],
    }));
    setTeams(built);
    setEnabledTeamIds(new Set(built.map((t) => t.id)));
  }, [selectedDataset?.humanPlayers]);

  const rebuildSchedule = useCallback(() => {
    const teamIds = enabledTeamList.map((t) => t.id);
    const ga = prelimStrategy === 'grouped_round_robin' ? groupAssignments : undefined;
    const adv = prelimStrategy === 'grouped_round_robin' ? advancePerGroup : undefined;
    const rounds = buildScheduleRounds(teamIds, format, effectivePlayoffCount, ga, adv);
    setScheduleRounds(rounds);
  }, [enabledTeamList, format, effectivePlayoffCount, groupAssignments, prelimStrategy, advancePerGroup]);

  const fmtSummary = computeFormatSummary(
    n,
    format,
    effectivePlayoffCount,
    totalPackets,
    prelimStrategy === 'grouped_round_robin' ? groupAssignments : undefined,
    prelimStrategy === 'grouped_round_robin' ? advancePerGroup : undefined
  );

  // ---- Schedule / packet helpers ----

  const assignedPacketIds = new Set(scheduleRounds.map((r) => r.packetId).filter(Boolean) as string[]);
  const unassignedPackets = availablePackets.filter((p) => !assignedPacketIds.has(p.id));
  const allRoundsAssigned = scheduleRounds.length > 0 && scheduleRounds.every((r) => r.packetId !== null);
  const totalGames = scheduleRounds.reduce((sum, r) => sum + r.games.length, 0);

  const autoAssignPackets = () => {
    const pool = [...availablePackets];
    setScheduleRounds((prev) =>
      prev.map((r, i) => ({ ...r, packetId: r.packetId ?? (pool[i] ? pool[i].id : null) })),
    );
  };

  const clearAllAssignments = () => {
    setScheduleRounds((prev) => prev.map((r) => ({ ...r, packetId: null })));
  };

  const assignPacketToRound = (roundNum: number, packetId: string) => {
    setScheduleRounds((prev) => {
      const cleared = prev.map((r) => (r.packetId === packetId ? { ...r, packetId: null } : r));
      return cleared.map((r) => (r.round === roundNum ? { ...r, packetId } : r));
    });
  };

  const removePacketFromRound = (roundNum: number) => {
    setScheduleRounds((prev) => prev.map((r) => (r.round === roundNum ? { ...r, packetId: null } : r)));
  };

  // ---- DnD handlers ----

  const onDragStart = (packetId: string) => setDragPacketId(packetId);
  const onDragEnd = () => setDragPacketId(null);

  const onDropOnRound = (roundNum: number, e: DragEvent) => {
    e.preventDefault();
    if (dragPacketId) { assignPacketToRound(roundNum, dragPacketId); setDragPacketId(null); }
  };

  const onDropOnPool = (e: DragEvent) => {
    e.preventDefault();
    const fromRound = e.dataTransfer.getData('fromRound');
    if (fromRound) removePacketFromRound(parseInt(fromRound, 10));
    setDragPacketId(null);
  };

  const onDragOver = (e: DragEvent) => e.preventDefault();

  // ---- Create ----

  const handleCreate = () => {
    if (!selectedDataset || !allRoundsAssigned || enabledTeamIds.size < 2) return;

    const modelDirectory = selectedDataset.responsesDir || selectedDataset.path || '';
    const packets = scheduleRounds
      .map((r) => availablePackets.find((p) => p.id === r.packetId))
      .filter(Boolean) as PacketInfo[];

    const isGrouped = prelimStrategy === 'grouped_round_robin';
    const finalTeams = enabledTeamList.map((t) => ({
      ...t,
      aiPlayers: aiAssignments[t.id] || [],
      group: isGrouped ? Object.entries(groupAssignments).find(([, ids]) => ids.includes(t.id))?.[0] : undefined,
    }));

    const params: CreateTournamentParams = {
      name: tournamentName || selectedDataset.name + ' Tournament',
      format,
      datasetId: selectedDataset.id,
      teams: finalTeams,
      packets,
      modelDirectory,
      gameSettings: { ...DEFAULT_GAME_CONFIG, ...rulePresetOverrides },
      topNForPlayoffs: playoffStrategy !== 'none' ? effectivePlayoffCount : undefined,
      playoffBracketSize: playoffStrategy !== 'none' ? playoffBracketSize : undefined,
      numGroups: isGrouped ? Object.keys(groupAssignments).length : undefined,
      groupAssignments: isGrouped ? groupAssignments : undefined,
      advancePerGroup: isGrouped ? advancePerGroup : undefined,
    };

    setCreating(true);
    setError(null);
    socket.emit('tournament:create', params, (res: { code?: string; error?: string }) => {
      setCreating(false);
      if (res.error) setError(res.error);
      else if (res.code) navigate(`/tournament/${res.code}`);
    });
  };

  // ---- Navigation ----

  const STEPS: WizardStep[] = ['dataset', 'teams', 'format', 'schedule', 'settings', 'review'];
  const stepIndex = STEPS.indexOf(step);

  const goNext = () => {
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEPS.length) {
      const nextStep = STEPS[nextIdx];
      if (nextStep === 'schedule') rebuildSchedule();
      setStep(nextStep);
    }
  };

  const goBack = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
    else navigate('/');
  };

  const getTeamName = (id: string) => teams.find((t) => t.id === id)?.name ?? id;
  const getPacketName = (id: string) => availablePackets.find((p) => p.id === id)?.name ?? id;

  // ---- Group DnD handlers ----

  const [dragTeamId, setDragTeamId] = useState<string | null>(null);

  const onTeamDragStart = (teamId: string, e: DragEvent) => {
    setDragTeamId(teamId);
    e.dataTransfer.setData('text/plain', teamId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onTeamDragEnd = () => setDragTeamId(null);

  const onDropOnGroup = (targetGroupId: string, e: DragEvent) => {
    e.preventDefault();
    const teamId = dragTeamId;
    if (!teamId) return;

    setGroupAssignments((prev) => {
      const sourceGroupId = Object.keys(prev).find((gid) => prev[gid].includes(teamId));
      if (!sourceGroupId || sourceGroupId === targetGroupId) return prev;

      // Enforce minimum 2 teams per group
      if (prev[sourceGroupId].length <= 2) return prev;

      const next = { ...prev };
      next[sourceGroupId] = next[sourceGroupId].filter((id) => id !== teamId);
      next[targetGroupId] = [...next[targetGroupId], teamId];
      return next;
    });
    setDragTeamId(null);
  };

  const onGroupDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const GROUP_COLORS = ['bg-blue-50 border-blue-200', 'bg-emerald-50 border-emerald-200', 'bg-purple-50 border-purple-200', 'bg-orange-50 border-orange-200'];
  const GROUP_TAG_COLORS = ['bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-purple-100 text-purple-700', 'bg-orange-100 text-orange-700'];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <button onClick={goBack} className="text-blue-600 hover:text-blue-800 mb-4">
          ← Back
        </button>

        <h1 className="text-2xl font-bold text-gray-800 mb-6">Create Tournament</h1>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex gap-1 mb-2">
            {STEPS.map((s, i) => (
              <button
                key={s}
                onClick={() => setStep(s)}
                className={`flex-1 text-xs font-medium text-center transition-colors ${
                  i === stepIndex ? 'text-amber-700'
                    : i < stepIndex ? 'text-amber-500 hover:text-amber-700'
                      : 'text-gray-400 hover:text-gray-600'
                } cursor-pointer`}
              >
                {STEP_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  i < stepIndex ? 'bg-amber-400' : i === stepIndex ? 'bg-amber-500' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-300 rounded-lg text-red-800 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-3 text-red-600 hover:text-red-800 font-medium">✕</button>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP: Dataset */}
        {/* ================================================================ */}
        {step === 'dataset' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Select Dataset</h2>
            <p className="text-sm text-gray-600">Choose the dataset that contains your questions and rosters.</p>

            <select
              value={selectedDataset?.id || ''}
              onChange={(e) => {
                const d = datasets.find((x) => x.id === e.target.value);
                setSelectedDataset(d || null);
              }}
              className="w-full border rounded-lg px-3 py-2.5 text-gray-800"
            >
              <option value="">Choose dataset...</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.type})</option>
              ))}
            </select>

            {selectedDataset && (() => {
              const teamSet = new Set(
                (selectedDataset.humanPlayers ?? []).map((p) => p.team).filter(Boolean)
              );
              return (
                <div className="bg-white border rounded-lg p-4 text-sm space-y-1">
                  <p><strong>Type:</strong> {selectedDataset.type}</p>
                  <p><strong>Packets:</strong> {totalPackets}</p>
                  <p><strong>Teams:</strong> {teamSet.size > 0 ? teamSet.size : <span className="text-amber-600">None (no "team" column in roster)</span>}</p>
                  <p><strong>Human players:</strong> {selectedDataset.humanPlayers?.length ?? 0}</p>
                  <p><strong>AI players:</strong> {selectedDataset.aiPlayers?.length ?? 0}</p>
                </div>
              );
            })()}

            <button onClick={goNext} disabled={!selectedDataset}
              className="px-5 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium">
              Next
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP: Teams */}
        {/* ================================================================ */}
        {step === 'teams' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Teams from Roster</h2>
            <p className="text-sm text-gray-600">Enable or disable teams. At least 2 required.</p>
            <div className="space-y-2">
              {teams.map((t) => (
                <label key={t.id} className="flex items-center gap-3 p-3 bg-white border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledTeamIds.has(t.id)}
                    onChange={(e) => {
                      const next = new Set(enabledTeamIds);
                      if (e.target.checked) next.add(t.id);
                      else next.delete(t.id);
                      setEnabledTeamIds(next);
                    }}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-gray-800">{t.name}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      ({t.humanPlayers.length} player{t.humanPlayers.length !== 1 ? 's' : ''})
                    </span>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {t.humanPlayers.map((p) => p.name).join(', ')}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {teams.length === 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">
                No teams found. The dataset needs a human_roster.csv with a "team" column.
              </p>
            )}

            {enabledTeamList.length >= 1 && (
              <div className="pt-4 border-t">
                <TournamentAiAssignment
                  enabledTeams={enabledTeamList}
                  rosterAiPlayers={selectedDataset?.aiPlayers ?? []}
                  availableModels={selectedDataset?.models ?? []}
                  tossupRoster={tossupRoster}
                  bonusRoster={bonusRoster}
                  aiAssignments={aiAssignments}
                  setAiAssignments={setAiAssignments}
                />
              </div>
            )}

            <button onClick={goNext} disabled={enabledTeamIds.size < 2}
              className="px-5 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium">
              Next
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP: Format */}
        {/* ================================================================ */}
        {step === 'format' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Tournament Format</h2>
              <p className="text-sm text-gray-600 mt-1">
                <strong>{n} teams</strong>, <strong>{totalPackets} packets</strong> available. Each round uses one packet.
              </p>
            </div>

            {/* Side-by-side Phase 1 + Phase 2 */}
            <div className="grid grid-cols-2 gap-6">
              {/* ---- Phase 1: Prelims ---- */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Phase 1 — Prelims</h3>
                <p className="text-xs text-gray-500 mb-3">How teams are seeded / ranked.</p>
                <div className="space-y-2">
                  {([
                    { value: 'round_robin' as PrelimStrategy, label: 'Round Robin (1x)', desc: 'Every team plays every other', detail: n >= 2 ? `${rrRoundCount(n)} rds, ${(n*(n-1))/2} games` : '' },
                    { value: 'double_round_robin' as PrelimStrategy, label: 'Round Robin (2x)', desc: 'Play every opponent twice', detail: n >= 2 ? `${rrRoundCount(n) * 2} rds, ${n*(n-1)} games` : '' },
                    { value: 'grouped_round_robin' as PrelimStrategy, label: 'Grouped Round Robin', desc: 'Split into groups, RR within each', detail: n >= 4 ? 'Fewer rounds for many teams' : 'Needs 4+ teams' },
                    { value: 'none' as PrelimStrategy, label: 'No Prelims', desc: 'Skip to playoffs', detail: '' },
                  ]).map(({ value, label, desc, detail }) => {
                    const selected = prelimStrategy === value;
                    const disabled = value === 'grouped_round_robin' && n < 4;
                    return (
                      <label key={value}
                        className={`block p-2.5 border-2 rounded-lg transition-colors text-sm ${
                          disabled ? 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-50'
                          : selected ? 'border-amber-500 bg-amber-50 cursor-pointer'
                          : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'
                        }`}>
                        <div className="flex items-start gap-2">
                          <input type="radio" name="prelim" checked={selected}
                            onChange={() => { if (!disabled) setPrelimStrategy(value); }}
                            disabled={disabled} className="mt-0.5 w-3.5 h-3.5" />
                          <div>
                            <span className="font-semibold text-gray-800">{label}</span>
                            <p className="text-xs text-gray-500">{desc}</p>
                            {detail && <p className="text-xs text-gray-400 mt-0.5">{detail}</p>}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Grouped RR — group count selector */}
                {prelimStrategy === 'grouped_round_robin' && n >= 4 && (
                  <div className="mt-3 bg-white border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <label className="text-sm font-medium text-gray-700">Groups:</label>
                      <select value={numGroups}
                        onChange={(e) => setNumGroups(parseInt(e.target.value, 10))}
                        className="border rounded px-2 py-1 text-sm">
                        {Array.from({ length: Math.min(4, Math.floor(n / 2)) }, (_, i) => i + 2).map((v) => (
                          <option key={v} value={v}>{v} groups</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* ---- Phase 2: Playoffs ---- */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Phase 2 — Playoffs</h3>
                <p className="text-xs text-gray-500 mb-3">How the champion is decided.</p>
                <div className="space-y-2">
                  {([
                    { value: 'none' as PlayoffStrategy, label: 'No Playoffs', desc: 'Prelim standings are final', availableWhen: prelimStrategy !== 'none' },
                    { value: 'single_elim' as PlayoffStrategy, label: 'Single Elimination', desc: 'Knockout bracket', availableWhen: true },
                  ] as const).map(({ value, label, desc, availableWhen }) => {
                    const selected = playoffStrategy === value;
                    const disabled = !availableWhen;
                    return (
                      <label key={value}
                        className={`block p-2.5 border-2 rounded-lg transition-colors text-sm ${
                          disabled ? 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-50'
                          : selected ? 'border-amber-500 bg-amber-50 cursor-pointer'
                          : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'
                        }`}>
                        <div className="flex items-start gap-2">
                          <input type="radio" name="playoff" checked={selected}
                            onChange={() => { if (!disabled) setPlayoffStrategy(value); }}
                            disabled={disabled} className="mt-0.5 w-3.5 h-3.5" />
                          <div>
                            <span className="font-semibold text-gray-800">{label}</span>
                            <p className="text-xs text-gray-500">{desc}</p>
                            {disabled && <p className="text-xs text-red-500 mt-0.5">Needs prelims</p>}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {playoffStrategy === 'single_elim' && (
                  <div className="mt-3 bg-white border rounded-lg p-3 space-y-3">
                    {prelimStrategy === 'grouped_round_robin' ? (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Advance to Qualifiers:</label>
                          <select value={advancePerGroup}
                            onChange={(e) => setAdvancePerGroup(parseInt(e.target.value, 10))}
                            className="border rounded px-2 py-1 text-sm w-full">
                            <option value={1}>Top 1 per group ({Object.keys(groupAssignments).length} qualifiers)</option>
                            <option value={2}>Top 2 per group ({Object.keys(groupAssignments).length * 2} qualifiers)</option>
                          </select>
                        </div>
                        {showPhase2Choice && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Qualifier path:</label>
                            <div className="space-y-2">
                              <label className={`flex items-start gap-2 p-2 border rounded cursor-pointer ${phase2Style === 'bracket' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                <input type="radio" name="phase2" checked={phase2Style === 'bracket'}
                                  onChange={() => setPhase2Style('bracket')} className="mt-0.5" />
                                <div>
                                  <span className="font-medium text-gray-800">Direct bracket</span>
                                  <p className="text-xs text-gray-500">
                                    Qualifiers → single-elim bracket (may have byes).
                                  </p>
                                </div>
                              </label>
                              <label className={`flex items-start gap-2 p-2 border rounded cursor-pointer ${phase2Style === 'round_robin' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                <input type="radio" name="phase2" checked={phase2Style === 'round_robin'}
                                  onChange={() => setPhase2Style('round_robin')} className="mt-0.5" />
                                <div>
                                  <span className="font-medium text-gray-800">Qualifier RR</span>
                                  <p className="text-xs text-gray-500">
                                    Qualifiers play RR; top N advance to playoffs (select below).
                                  </p>
                                </div>
                              </label>
                            </div>
                          </div>
                        )}
                        {showPhase2Choice && allowedPlayoffSizes.length > 0 && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Advance to Playoffs:</label>
                            <select value={playoffBracketSize}
                              onChange={(e) => setPlayoffBracketSize(parseInt(e.target.value, 10) as 2 | 4 | 8)}
                              className="border rounded px-2 py-1 text-sm w-full">
                              {allowedPlayoffSizes.map((v) => (
                                <option key={v} value={v}>
                                  {v} teams — {v === 2 ? 'Finals only' : v === 4 ? 'Semifinals + Finals' : 'Quarterfinals + Semifinals + Finals'}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </>
                    ) : prelimStrategy === 'none' ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Playoff bracket size:</label>
                        <select value={playoffBracketSize}
                          onChange={(e) => setPlayoffBracketSize(parseInt(e.target.value, 10) as 2 | 4 | 8)}
                          className="border rounded px-2 py-1 text-sm w-full">
                          {allowedPlayoffSizes.map((v) => (
                            <option key={v} value={v}>
                              {v} teams — {v === 2 ? 'Finals only' : v === 4 ? 'Semifinals + Finals' : 'Quarterfinals + Semifinals + Finals'} ({bracketGameCount(v).games} game{bracketGameCount(v).games !== 1 ? 's' : ''})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Advance to Playoffs:</label>
                        <select value={playoffBracketSize}
                          onChange={(e) => setPlayoffBracketSize(parseInt(e.target.value, 10) as 2 | 4 | 8)}
                          className="border rounded px-2 py-1 text-sm w-full">
                          {allowedPlayoffSizes.map((v) => (
                            <option key={v} value={v}>
                              {v} teams — {v === 2 ? 'Finals only' : v === 4 ? 'Semifinals + Finals' : 'Quarterfinals + Semifinals + Finals'} ({bracketGameCount(v).games} game{bracketGameCount(v).games !== 1 ? 's' : ''})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Grouped RR — drag-and-drop group assignment */}
            {prelimStrategy === 'grouped_round_robin' && n >= 4 && (
              <div>
                <button
                  onClick={() => setShowGroupCustomize(!showGroupCustomize)}
                  className="text-sm text-blue-600 hover:text-blue-800 mb-2"
                >
                  {showGroupCustomize ? 'Hide group assignments' : 'Customize group assignments'}
                </button>

                {showGroupCustomize ? (
                  <div className="bg-white border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500">Drag teams between groups. Each group needs at least 2 teams.</p>
                      <button
                        onClick={() => {
                          const teamIds = [...enabledTeamList.map((t) => t.id)];
                          for (let i = teamIds.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]];
                          }
                          setGroupAssignments(snakeDraftGroups(teamIds, numGroups));
                        }}
                        className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 font-medium"
                      >
                        Randomize
                      </button>
                    </div>
                    <div className={`grid gap-3 ${Object.keys(groupAssignments).length <= 2 ? 'grid-cols-2' : Object.keys(groupAssignments).length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                      {Object.entries(groupAssignments).map(([gid, teamIds], gi) => (
                        <div
                          key={gid}
                          onDragOver={onGroupDragOver}
                          onDrop={(e) => onDropOnGroup(gid, e)}
                          className={`rounded-lg border-2 p-3 min-h-[100px] transition-colors ${GROUP_COLORS[gi % GROUP_COLORS.length]} ${
                            dragTeamId && !teamIds.includes(dragTeamId) ? 'ring-2 ring-amber-300' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-gray-700">Group {gid}</span>
                            <span className="text-xs text-gray-400">{teamIds.length} teams</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {teamIds.map((tid) => (
                              <div
                                key={tid}
                                draggable
                                onDragStart={(e) => onTeamDragStart(tid, e as unknown as DragEvent)}
                                onDragEnd={onTeamDragEnd}
                                className={`px-2 py-1 rounded text-xs font-medium cursor-grab active:cursor-grabbing select-none transition-opacity ${GROUP_TAG_COLORS[gi % GROUP_TAG_COLORS.length]} ${
                                  dragTeamId === tid ? 'opacity-40' : ''
                                } ${teamIds.length <= 2 ? 'cursor-not-allowed opacity-70' : ''}`}
                                title={teamIds.length <= 2 ? 'Cannot move — group needs at least 2 teams' : getTeamName(tid)}
                              >
                                {getTeamName(tid)}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={`grid gap-2 ${Object.keys(groupAssignments).length <= 2 ? 'grid-cols-2' : Object.keys(groupAssignments).length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                    {Object.entries(groupAssignments).map(([gid, teamIds], gi) => (
                      <div key={gid} className={`rounded-lg border p-2 text-sm ${GROUP_COLORS[gi % GROUP_COLORS.length]}`}>
                        <span className="font-semibold text-gray-700">Group {gid}</span>
                        <span className="text-gray-400 ml-1">({teamIds.length})</span>
                        <div className="text-xs text-gray-500 mt-1">
                          {teamIds.map((id) => getTeamName(id)).join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ---- Live summary ---- */}
            <div className={`p-4 rounded-lg border-2 ${fmtSummary.feasible ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-semibold ${fmtSummary.feasible ? 'text-green-800' : 'text-red-800'}`}>
                  {fmtSummary.feasible ? '✓ Feasible' : '✗ Not enough packets'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {fmtSummary.prelimRounds > 0 && (
                  <>
                    <span className="text-gray-600">Prelim rounds:</span>
                    <span className="font-medium">{fmtSummary.prelimRounds} ({fmtSummary.prelimGames} games)</span>
                  </>
                )}
                {fmtSummary.playoffRounds > 0 && (
                  <>
                    <span className="text-gray-600">Playoff rounds:</span>
                    <span className="font-medium">{fmtSummary.playoffRounds} ({fmtSummary.playoffGames} games)</span>
                  </>
                )}
                <span className="text-gray-600">Total rounds:</span>
                <span className="font-medium">{fmtSummary.totalRounds}</span>
                <span className="text-gray-600">Total games:</span>
                <span className="font-medium">{fmtSummary.totalGames}</span>
                <span className="text-gray-600">Packets needed:</span>
                <span className={`font-medium ${fmtSummary.feasible ? 'text-green-700' : 'text-red-700'}`}>
                  {fmtSummary.totalRounds} of {totalPackets} available
                </span>
              </div>
            </div>

            <button onClick={goNext}
              disabled={!fmtSummary.feasible || fmtSummary.totalRounds === 0}
              className="px-5 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium">
              Next
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP: Schedule & Packets */}
        {/* ================================================================ */}
        {step === 'schedule' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Schedule & Packet Assignment</h2>
            <p className="text-sm text-gray-600">
              Each round uses one packet — all games in a round share it.
              Drag packets from the pool onto rounds, or use Auto-Assign.
            </p>

            <div className="flex items-center gap-3">
              <button onClick={autoAssignPackets}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium">
                Auto-Assign
              </button>
              <button onClick={clearAllAssignments}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium">
                Clear All
              </button>
              <span className="ml-auto text-sm text-gray-500">
                {scheduleRounds.filter((r) => r.packetId).length}/{scheduleRounds.length} rounds assigned
              </span>
            </div>

            {/* Packet pool */}
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-4 min-h-[60px]"
              onDragOver={onDragOver} onDrop={onDropOnPool}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Available Packets ({unassignedPackets.length} of {totalPackets})
              </p>
              <div className="flex flex-wrap gap-2">
                {unassignedPackets.length === 0 && <p className="text-sm text-gray-400 italic">All packets assigned</p>}
                {unassignedPackets.map((p) => (
                  <div key={p.id} draggable
                    onDragStart={(e) => { onDragStart(p.id); e.dataTransfer.setData('text/plain', p.id); }}
                    onDragEnd={onDragEnd}
                    className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium cursor-grab active:cursor-grabbing hover:bg-blue-200 transition-colors border border-blue-200 select-none">
                    {p.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Rounds */}
            <div className="space-y-4">
              {scheduleRounds.map((sr) => (
                <div key={sr.round}
                  className={`bg-white border rounded-lg overflow-hidden transition-colors ${dragPacketId && !sr.packetId ? 'ring-2 ring-amber-300' : ''}`}
                  onDragOver={onDragOver} onDrop={(e) => onDropOnRound(sr.round, e)}>
                  <div className={`px-4 py-3 flex items-center justify-between ${sr.phase === 'playoffs' ? 'bg-purple-50' : 'bg-gray-50'}`}>
                    <div>
                      <span className={`font-semibold text-sm ${sr.phase === 'playoffs' ? 'text-purple-800' : 'text-gray-700'}`}>
                        {sr.phase === 'playoffs' ? (sr.label ?? `Playoffs — Round ${sr.round}`) : `Round ${sr.round}`}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        ({sr.games.length} game{sr.games.length !== 1 ? 's' : ''})
                      </span>
                    </div>
                    {sr.packetId ? (
                      <div draggable
                        onDragStart={(e) => { onDragStart(sr.packetId!); e.dataTransfer.setData('text/plain', sr.packetId!); e.dataTransfer.setData('fromRound', String(sr.round)); }}
                        onDragEnd={onDragEnd}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium cursor-grab active:cursor-grabbing border border-blue-200 select-none">
                        {getPacketName(sr.packetId)}
                        <button onClick={(e) => { e.stopPropagation(); removePacketFromRound(sr.round); }}
                          className="text-blue-500 hover:text-blue-700 ml-1" title="Remove packet">✕</button>
                      </div>
                    ) : (
                      <div className={`px-3 py-1.5 rounded-lg text-sm border-2 border-dashed min-w-[140px] text-center transition-colors ${
                        dragPacketId ? 'border-amber-400 bg-amber-50 text-amber-600' : 'border-gray-300 text-gray-400'
                      }`}>
                        {dragPacketId ? 'Drop packet here' : 'No packet assigned'}
                      </div>
                    )}
                  </div>
                  <div className="divide-y">
                    {sr.games.map((game) => (
                      <div key={game.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <span className="text-gray-400 w-8">M{game.matchNumber}</span>
                        {game.group && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Grp {game.group}</span>}
                        <span className="font-medium text-gray-800">
                          {game.phase === 'playoffs' ? game.teamAId : getTeamName(game.teamAId)}
                        </span>
                        <span className="text-gray-400">vs</span>
                        <span className="font-medium text-gray-800">
                          {game.phase === 'playoffs' ? game.teamBId : getTeamName(game.teamBId)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button onClick={goNext} disabled={!allRoundsAssigned}
              className="px-5 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium">
              {allRoundsAssigned ? 'Next' : `Assign all packets to continue (${scheduleRounds.filter((r) => !r.packetId).length} rounds remaining)`}
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP: Settings */}
        {/* ================================================================ */}
        {step === 'settings' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Tournament Settings</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tournament name</label>
              <input type="text" value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
                placeholder={(selectedDataset?.name ?? 'My') + ' Tournament'}
                className="border rounded-lg px-3 py-2.5 w-full" />
            </div>
            {rulePresets.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rule preset</label>
                <select
                  value={selectedPresetId}
                  onChange={(e) => applyRulePreset(e.target.value)}
                  className="border rounded-lg px-3 py-2.5 w-full"
                >
                  <option value="">Default rules</option>
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

            <div>
              <h3 className="text-base font-semibold mb-3">AI Score Deflation</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Tossup deflation */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tossup deflation
                    </label>
                    <select
                      value={tossupDeflationMode}
                      onChange={(e) =>
                        setOverride({ tossup_deflation_mode: e.target.value as DeflationMode })
                      }
                      className="border rounded-lg px-3 py-2.5 w-full"
                    >
                      <option value="none">None (full points)</option>
                      <option value="static">Static (fixed deflation)</option>
                      <option value="weighted">Weighted (by model size)</option>
                    </select>
                  </div>
                  {tossupDeflationMode === 'static' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Static deflation (points)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={tossupStaticDeflation}
                        onChange={(e) =>
                          setOverride({
                            tossup_static_deflation: Math.max(0, parseInt(e.target.value) || 0),
                          })
                        }
                        className="border rounded-lg px-3 py-2.5 w-full"
                      />
                    </div>
                  )}
                  {tossupDeflationMode === 'weighted' && (
                    <div className="grid grid-cols-3 gap-2">
                      {(['lightweight', 'midweight', 'heavyweight'] as const).map((wc) => (
                        <div key={wc}>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {wc === 'lightweight' ? 'LW' : wc === 'midweight' ? 'MW' : 'HW'} ×
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            value={aiTossupScoreFactors[wc]}
                            onChange={(e) =>
                              setOverride({
                                ai_tossup_score_factors: {
                                  ...aiTossupScoreFactors,
                                  [wc]: parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                            className="border rounded-lg px-2 py-2 w-full"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    Weighted multiplies a correct AI buzz by its model-size factor.
                  </p>
                </div>

                {/* Bonus deflation */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bonus consult deflation
                    </label>
                    <select
                      value={bonusDeflationMode}
                      onChange={(e) =>
                        setOverride({ bonus_deflation_mode: e.target.value as DeflationMode })
                      }
                      className="border rounded-lg px-3 py-2.5 w-full"
                    >
                      <option value="none">None (full points)</option>
                      <option value="static">Static (fixed deflation)</option>
                      <option value="weighted">Weighted (by model size)</option>
                    </select>
                  </div>
                  {bonusDeflationMode === 'static' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Static deflation (points)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={bonusStaticDeflation}
                        onChange={(e) =>
                          setOverride({
                            bonus_static_deflation: Math.max(0, parseInt(e.target.value) || 0),
                          })
                        }
                        className="border rounded-lg px-3 py-2.5 w-full"
                      />
                    </div>
                  )}
                  {bonusDeflationMode === 'weighted' && (
                    <div className="grid grid-cols-3 gap-2">
                      {(['lightweight', 'midweight', 'heavyweight'] as const).map((wc) => (
                        <div key={wc}>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {wc === 'lightweight' ? 'LW' : wc === 'midweight' ? 'MW' : 'HW'} −
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={bonusWeightDeflation[wc]}
                            onChange={(e) =>
                              setOverride({
                                bonus_weight_deflation: {
                                  ...bonusWeightDeflation,
                                  [wc]: Math.max(0, parseInt(e.target.value) || 0),
                                },
                              })
                            }
                            className="border rounded-lg px-2 py-2 w-full"
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

            <button onClick={goNext}
              className="px-5 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium">
              Next
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP: Review & Create */}
        {/* ================================================================ */}
        {step === 'review' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Review & Create</h2>
            <div className="bg-white border rounded-lg divide-y text-sm">
              <div className="px-4 py-3 flex justify-between">
                <span className="text-gray-500">Dataset</span>
                <span className="font-medium">{selectedDataset?.name}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-gray-500">Teams</span>
                <span className="font-medium">{enabledTeamIds.size}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-gray-500">AI teammates</span>
                <span className="font-medium">
                  {enabledTeamList.reduce((sum, t) => sum + (aiAssignments[t.id]?.length ?? 0), 0)}
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-gray-500">Format</span>
                <span className="font-medium">{formatDisplayString(format)}</span>
              </div>
              {prelimStrategy === 'grouped_round_robin' && (
                <div className="px-4 py-3 flex justify-between">
                  <span className="text-gray-500">Groups</span>
                  <span className="font-medium">{Object.keys(groupAssignments).length} groups, top {advancePerGroup} per group</span>
                </div>
              )}
              <div className="px-4 py-3 flex justify-between">
                <span className="text-gray-500">Rounds</span>
                <span className="font-medium">{scheduleRounds.length}</span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-gray-500">Games</span>
                <span className="font-medium">{totalGames}</span>
              </div>
              {playoffStrategy === 'single_elim' && (
                <div className="px-4 py-3 flex justify-between">
                  <span className="text-gray-500">Playoff teams</span>
                  <span className="font-medium">{effectivePlayoffCount}</span>
                </div>
              )}
              <div className="px-4 py-3 flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="font-medium">{tournamentName || (selectedDataset?.name ?? '') + ' Tournament'}</span>
              </div>
            </div>

            <button onClick={handleCreate} disabled={creating || !allRoundsAssigned}
              className="w-full px-6 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 font-semibold text-lg">
              {creating ? 'Creating...' : 'Create Tournament'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
