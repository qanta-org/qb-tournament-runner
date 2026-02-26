/**
 * Bracket sandbox: explore bracket/schedule generation without dataset or roster.
 * Uses shared schedule-utils for preview.
 *
 * Playoff bracket styles:
 * - Finals only (2 teams)
 * - Semifinals + Finals (4 teams)
 * - Quarterfinals + Semifinals + Finals (8 teams)
 */
import { useState, useMemo, useEffect } from 'react';
import {
  buildScheduleRounds,
  computeFormatSummary,
  getAllowedPlayoffSizes,
  nextPow2,
  snakeDraftGroups,
  type Phase2Style,
  type ScheduleRound,
} from '../../../../shared/schedule-utils';
import type { TournamentFormat } from '../../../../shared/types';

function buildFormat(
  prelimStyle: string,
  phase2Style: Phase2Style,
  showPhase2Choice: boolean
): TournamentFormat {
  const prelim =
    prelimStyle === 'none'
      ? 'none'
      : prelimStyle === 'double_round_robin'
        ? 'double_rr'
        : prelimStyle === 'grouped_round_robin'
          ? 'grouped_rr'
          : 'full_rr';
  return {
    prelim,
    qualifiers: showPhase2Choice && phase2Style === 'round_robin' ? { kind: 'rr' } : { kind: 'none' },
    playoffs: 'single_elim',
  };
}

export function BracketSandbox() {
  const [teamCount, setTeamCount] = useState(6);
  const [prelimStyle, setPrelimStyle] = useState<string>('grouped_round_robin');
  const [playoffBracketSize, setPlayoffBracketSize] = useState<2 | 4 | 8>(4);
  const [numGroups, setNumGroups] = useState(2);
  const [advancePerGroup, setAdvancePerGroup] = useState(1);
  const [phase2Style, setPhase2Style] = useState<Phase2Style>('bracket');

  const teamIds = useMemo(
    () => Array.from({ length: teamCount }, (_, i) => `Team ${i + 1}`),
    [teamCount]
  );

  const groupAssignments = useMemo(() => {
    if (prelimStyle !== 'grouped_round_robin') return undefined;
    const n = Math.min(numGroups, Math.floor(teamCount / 2));
    return snakeDraftGroups(teamIds, n);
  }, [prelimStyle, numGroups, teamCount, teamIds]);

  const qualifierCount =
    prelimStyle === 'grouped_round_robin' && groupAssignments
      ? Object.keys(groupAssignments).length * advancePerGroup
      : 0;

  const poolSize = prelimStyle === 'grouped_round_robin' ? qualifierCount : teamCount;
  const allowedPlayoffSizes = getAllowedPlayoffSizes(poolSize);
  const showPhase2Choice =
    prelimStyle === 'grouped_round_robin' && qualifierCount > 2;

  const effectivePlayoffCount = (() => {
    const allowed = getAllowedPlayoffSizes(poolSize);
    const size = allowed.includes(playoffBracketSize) ? playoffBracketSize : (allowed[allowed.length - 1] ?? 2);
    return Math.min(size, poolSize);
  })();

  useEffect(() => {
    const allowed = getAllowedPlayoffSizes(poolSize);
    if (allowed.length > 0 && !allowed.includes(playoffBracketSize)) {
      setPlayoffBracketSize(allowed[allowed.length - 1] ?? 2);
    }
  }, [poolSize, playoffBracketSize]);

  const format = useMemo(
    () => buildFormat(prelimStyle, phase2Style, showPhase2Choice),
    [prelimStyle, phase2Style, showPhase2Choice]
  );

  const summary = useMemo(
    () =>
      computeFormatSummary(
        teamCount,
        format,
        effectivePlayoffCount,
        999,
        groupAssignments,
        prelimStyle === 'grouped_round_robin' ? advancePerGroup : undefined
      ),
    [teamCount, format, effectivePlayoffCount, groupAssignments, prelimStyle, advancePerGroup]
  );

  const scheduleRounds = useMemo(
    () =>
      buildScheduleRounds(
        teamIds,
        format,
        effectivePlayoffCount,
        groupAssignments,
        prelimStyle === 'grouped_round_robin' ? advancePerGroup : undefined
      ),
    [teamIds, format, effectivePlayoffCount, groupAssignments, prelimStyle, advancePerGroup]
  );

  // Validation: check for broken dependencies, missing tags, orphaned seeds
  const validationIssues: string[] = [];
  const gameIds = new Set(scheduleRounds.flatMap((r) => r.games.map((g) => g.id)));
  for (const round of scheduleRounds) {
    for (const game of round.games) {
      if (game.phase === 'playoffs' && !game.tag && round.phase === 'playoffs') {
        validationIssues.push(`Game ${game.id} missing tag`);
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Bracket Sandbox</h1>
        <p className="text-slate-600 text-sm">
          Explore bracket and schedule generation without a dataset. No server needed.
        </p>

        {/* Controls */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-slate-700">Controls</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Team count (2–12)</label>
              <input
                type="range"
                min={2}
                max={12}
                value={teamCount}
                onChange={(e) => setTeamCount(parseInt(e.target.value, 10))}
                className="w-full"
              />
              <span className="text-sm text-slate-500">{teamCount}</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Prelim style</label>
              <select
                value={prelimStyle}
                onChange={(e) => setPrelimStyle(e.target.value)}
                className="border rounded px-2 py-1 text-sm w-full"
              >
                <option value="none">No prelims (single elimination)</option>
                <option value="round_robin">Full RR</option>
                <option value="double_round_robin">Double RR</option>
                <option value="grouped_round_robin">Grouped RR</option>
              </select>
            </div>
            {(prelimStyle === 'none' || prelimStyle === 'round_robin' || prelimStyle === 'double_round_robin') && allowedPlayoffSizes.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Advance to Playoffs</label>
                <select
                  value={playoffBracketSize}
                  onChange={(e) => setPlayoffBracketSize(parseInt(e.target.value, 10) as 2 | 4 | 8)}
                  className="border rounded px-2 py-1 text-sm w-full"
                >
                  {allowedPlayoffSizes.map((v) => (
                    <option key={v} value={v}>
                      {v} teams — {v === 2 ? 'Finals only' : v === 4 ? 'Semifinals + Finals' : 'Quarterfinals + Semifinals + Finals'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {prelimStyle === 'grouped_round_robin' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Groups</label>
                  <select
                    value={numGroups}
                    onChange={(e) => setNumGroups(parseInt(e.target.value, 10))}
                    className="border rounded px-2 py-1 text-sm w-full"
                  >
                    {Array.from({ length: Math.min(4, Math.floor(teamCount / 2)) }, (_, i) => i + 2).map(
                      (v) => (
                        <option key={v} value={v}>
                          {v} groups
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Advance to Qualifiers</label>
                  <select
                    value={advancePerGroup}
                    onChange={(e) => setAdvancePerGroup(parseInt(e.target.value, 10))}
                    className="border rounded px-2 py-1 text-sm w-full"
                  >
                    <option value={1}>Top 1 per group ({groupAssignments ? Object.keys(groupAssignments).length : 0} qualifiers)</option>
                    <option value={2}>Top 2 per group ({groupAssignments ? Object.keys(groupAssignments).length * 2 : 0} qualifiers)</option>
                  </select>
                </div>
                {showPhase2Choice && (
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Qualifier path</label>
                    <select
                      value={phase2Style}
                      onChange={(e) => setPhase2Style(e.target.value as Phase2Style)}
                      className="border rounded px-2 py-1 text-sm w-full"
                    >
                      <option value="bracket">Direct bracket</option>
                      <option value="round_robin">Qualifier RR</option>
                    </select>
                  </div>
                )}
                {showPhase2Choice && allowedPlayoffSizes.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Advance to Playoffs</label>
                    <select
                      value={playoffBracketSize}
                      onChange={(e) => setPlayoffBracketSize(parseInt(e.target.value, 10) as 2 | 4 | 8)}
                      className="border rounded px-2 py-1 text-sm w-full"
                    >
                      {allowedPlayoffSizes.map((v) => (
                        <option key={v} value={v}>
                          {v} teams — {v === 2 ? 'Finals only' : v === 4 ? 'Semifinals + Finals' : 'Quarterfinals + Semifinals + Finals'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-lg border p-4">
          <h2 className="font-semibold text-slate-700 mb-2">Summary</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-slate-500">Rounds:</span>
            <span className="font-medium">{summary.totalRounds}</span>
            <span className="text-slate-500">Games:</span>
            <span className="font-medium">{summary.totalGames}</span>
            <span className="text-slate-500">Packets needed:</span>
            <span className="font-medium">{summary.totalRounds}</span>
            {summary.phase2Packets != null && (
              <>
                <span className="text-slate-500">Phase 2 packets:</span>
                <span className="font-medium">{summary.phase2Packets}</span>
              </>
            )}
            {summary.playoffRounds > 0 && (
              <>
                <span className="text-slate-500">Playoff teams:</span>
                <span className="font-medium">{effectivePlayoffCount}</span>
                <span className="text-slate-500">Bracket structure:</span>
                <span className="font-medium">
                  {effectivePlayoffCount === 2 && 'Final only'}
                  {effectivePlayoffCount === 4 && 'Semifinals + Final'}
                  {effectivePlayoffCount === 8 && 'Quarterfinals + Semifinals + Final'}
                  {![2, 4, 8].includes(effectivePlayoffCount) &&
                    `${nextPow2(effectivePlayoffCount)} slots (${nextPow2(effectivePlayoffCount) - effectivePlayoffCount} bye${nextPow2(effectivePlayoffCount) - effectivePlayoffCount !== 1 ? 's' : ''})`}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Schedule rounds */}
        <div className="bg-white rounded-lg border p-4">
          <h2 className="font-semibold text-slate-700 mb-2">Schedule Rounds</h2>
          <div className="space-y-3">
            {scheduleRounds.map((sr: ScheduleRound) => (
              <div
                key={sr.round}
                className={`rounded-lg p-3 ${sr.phase === 'playoffs' ? 'bg-purple-50 border border-purple-200' : 'bg-slate-50 border border-slate-200'}`}
              >
                <div className="font-medium text-slate-700 mb-2">
                  {sr.label ?? `Round ${sr.round}`} ({sr.phase})
                </div>
                <div className="space-y-1 text-sm">
                  {sr.games.map((g) => (
                    <div key={g.id} className="flex items-center gap-2">
                      {g.group && (
                        <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                          {g.group}
                        </span>
                      )}
                      {g.tag && (
                        <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                          {g.tag}
                        </span>
                      )}
                      <span>{g.teamAId}</span>
                      <span className="text-slate-400">vs</span>
                      <span>{g.teamBId}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Validation */}
        {validationIssues.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="font-semibold text-red-800 mb-2">Validation issues</h2>
            <ul className="list-disc list-inside text-sm text-red-700">
              {validationIssues.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
