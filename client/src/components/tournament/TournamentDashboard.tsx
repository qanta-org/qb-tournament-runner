import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../../socket';
import type { Tournament, TournamentGame } from '../../../../shared/types';
import { getPlaceholderDisplayLabel, isPlaceholder as isPlaceholderTeamId, PLACEHOLDER_BYE } from '../../../../shared/tournament-placeholders';

interface TournamentDashboardProps {
  code: string;
}

const TAG_LABELS: Record<string, string> = {
  qf1: 'Quarterfinal 1', qf2: 'Quarterfinal 2', qf3: 'Quarterfinal 3', qf4: 'Quarterfinal 4',
  sf1: 'Semifinal 1', sf2: 'Semifinal 2',
  final: 'Final',
};

export function TournamentDashboard({ code }: TournamentDashboardProps) {
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'schedule' | 'standings'>('schedule');
  const [standingsGroup, setStandingsGroup] = useState<string>('all');

  const fetchTournament = () => {
    setLoading(true);
    setError(null);
    socket.emit('tournament:get', code.toUpperCase(), (res: { tournament?: Tournament; error?: string }) => {
      setLoading(false);
      if (res.error) {
        setError(res.error);
        setTournament(null);
      } else {
        setTournament(res.tournament || null);
      }
    });
  };

  useEffect(() => {
    fetchTournament();
    const interval = setInterval(fetchTournament, 5000);
    return () => clearInterval(interval);
  }, [code]);

  const handleStartGame = (game: TournamentGame) => {
    socket.emit('tournament:start_game', { code: code.toUpperCase(), gameId: game.id }, (res: { roomCode?: string; error?: string }) => {
      if (res.error) setError(res.error);
    });
  };

  const getTeamName = (teamId: string) => {
    if (isPlaceholderTeamId(teamId)) return getPlaceholderDisplayLabel(teamId, TAG_LABELS);
    return tournament?.teams.find((t) => t.id === teamId)?.name ?? teamId;
  };

  if (loading && !tournament) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading tournament...</p>
      </div>
    );
  }

  if (error && !tournament) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <button onClick={() => navigate('/')} className="text-blue-600 mb-4">← Back</button>
        <div className="bg-red-100 border border-red-300 rounded p-4 text-red-800">{error}</div>
      </div>
    );
  }

  if (!tournament) return null;

  const isGrouped = tournament.format.prelim === 'grouped_rr';
  const groups = tournament.groupAssignments ? Object.keys(tournament.groupAssignments).sort() : [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate('/')} className="text-blue-600 hover:text-blue-800 mb-4">← Back</button>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{tournament.name}</h1>
              <p className="text-gray-600">
              {tournament.format.prelim.replace(/_/g, ' ')}
              {tournament.format.playoffs !== 'none' && ` → ${tournament.format.playoffs.replace(/_/g, ' ')}`}
              {tournament.format.qualifiers.kind === 'rr' && ' (with Qualifier RR)'}
            </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-lg font-bold bg-amber-100 px-3 py-1 rounded">{tournament.code}</span>
              <button onClick={() => navigator.clipboard.writeText(tournament.code)}
                className="text-sm text-amber-600 hover:text-amber-800">
                Copy
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setActiveTab('schedule')}
            className={`px-4 py-2 rounded ${activeTab === 'schedule' ? 'bg-amber-500 text-white' : 'bg-gray-200'}`}>
            Schedule
          </button>
          <button onClick={() => setActiveTab('standings')}
            className={`px-4 py-2 rounded ${activeTab === 'standings' ? 'bg-amber-500 text-white' : 'bg-gray-200'}`}>
            Standings
          </button>
        </div>

        {activeTab === 'schedule' && (() => {
          const prelimGames = tournament.games.filter((g) => g.phase === 'prelims');
          const qualifierGames = tournament.games.filter((g) => g.phase === 'qualifiers');
          const playoffGames = tournament.games.filter((g) => g.phase === 'playoffs');

          const renderGameRow = (game: TournamentGame) => {
            const aIsPlaceholder = isPlaceholderTeamId(game.teamAId);
            const bIsPlaceholder = isPlaceholderTeamId(game.teamBId);
            const isBye = game.teamAId === PLACEHOLDER_BYE || game.teamBId === PLACEHOLDER_BYE;
            return (
              <tr key={game.id} className={`border-t ${isBye ? 'opacity-50' : ''}`}>
                  <td className="p-3">
                  {game.phase === 'playoffs'
                    ? (game.tag ? TAG_LABELS[game.tag] ?? `Playoff R${game.round}` : `Playoff R${game.round}`)
                    : game.phase === 'qualifiers'
                      ? `Qualifier RR R${game.round}`
                      : `Round ${game.round}`}
                </td>
                <td className="p-3">
                  {game.group && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded mr-2">Grp {game.group}</span>}
                  M{game.matchNumber}
                </td>
                <td className="p-3">
                  <span className={aIsPlaceholder ? 'italic text-gray-400' : ''}>
                    {getTeamName(game.teamAId)}
                  </span>
                  {' vs '}
                  <span className={bIsPlaceholder ? 'italic text-gray-400' : ''}>
                    {getTeamName(game.teamBId)}
                  </span>
                </td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-sm ${
                    game.status === 'completed' ? 'bg-green-100 text-green-800'
                    : game.status === 'in_progress' ? 'bg-blue-100 text-blue-800'
                    : game.status === 'ready' ? 'bg-amber-100 text-amber-800'
                    : 'bg-gray-100 text-gray-600'
                  }`}>
                    {isBye && game.status === 'completed' ? 'bye'
                      : game.status === 'scheduled' && (aIsPlaceholder || bIsPlaceholder) ? 'waiting'
                        : game.status}
                  </span>
                </td>
                <td className="p-3">
                  {game.status === 'ready' && !isBye && (
                    <button onClick={() => handleStartGame(game)}
                      className="px-3 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 text-sm">
                      Start Game
                    </button>
                  )}
                  {game.status === 'in_progress' && game.roomCode && (
                    <a href={`/?join=${game.roomCode}`} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 font-mono font-medium underline"
                      title="Open player view in new tab">
                      {game.roomCode}
                    </a>
                  )}
                  {game.status === 'completed' && game.scores && !isBye && (
                    <span className="text-sm text-gray-600">
                      {game.scores.team_a} - {game.scores.team_b}
                    </span>
                  )}
                </td>
              </tr>
            );
          };

          return (
            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left p-3">Round</th>
                      <th className="text-left p-3">Match</th>
                      <th className="text-left p-3">Teams</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prelimGames.map(renderGameRow)}
                    {qualifierGames.length > 0 && (
                      <tr>
                        <td colSpan={5} className="bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 uppercase tracking-wide">
                          Qualifier RR
                        </td>
                      </tr>
                    )}
                    {qualifierGames.map(renderGameRow)}
                    {playoffGames.length > 0 && (
                      <tr>
                        <td colSpan={5} className="bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-800 uppercase tracking-wide">
                          Playoffs
                        </td>
                      </tr>
                    )}
                    {playoffGames.map(renderGameRow)}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {activeTab === 'standings' && (
          <div className="space-y-4">
            {isGrouped && groups.length > 0 && (
              <div className="flex gap-2">
                <button onClick={() => setStandingsGroup('all')}
                  className={`px-3 py-1.5 rounded text-sm ${standingsGroup === 'all' ? 'bg-amber-500 text-white' : 'bg-gray-200'}`}>
                  All
                </button>
                {groups.map((g) => (
                  <button key={g} onClick={() => setStandingsGroup(g)}
                    className={`px-3 py-1.5 rounded text-sm ${standingsGroup === g ? 'bg-amber-500 text-white' : 'bg-gray-200'}`}>
                    Group {g}
                  </button>
                ))}
              </div>
            )}

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-3">#</th>
                    <th className="text-left p-3">Team</th>
                    {isGrouped && standingsGroup === 'all' && <th className="text-left p-3">Group</th>}
                    <th className="text-left p-3">W</th>
                    <th className="text-left p-3">L</th>
                    <th className="text-left p-3 cursor-help" title="Points For — total points scored">PF</th>
                    <th className="text-left p-3 cursor-help" title="Points Against — total points allowed">PA</th>
                    <th className="text-left p-3 cursor-help" title="Negs — incorrect buzzes with penalty">Negs</th>
                    <th className="text-left p-3 cursor-help" title="Points Per Bonus — average bonus points per bonus attempt">PPB</th>
                  </tr>
                </thead>
                <tbody>
                  {tournament.standings
                    .filter((s) => standingsGroup === 'all' || s.group === standingsGroup)
                    .sort((a, b) => b.wins - a.wins || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst))
                    .map((s, i) => {
                      const ppb = s.bonusAttempts > 0 ? (s.bonusPoints / s.bonusAttempts).toFixed(1) : '—';
                      return (
                        <tr key={s.teamId} className="border-t">
                          <td className="p-3 text-gray-400">{i + 1}</td>
                          <td className="p-3 font-medium">
                            {tournament.teams.find((t) => t.id === s.teamId)?.name ?? s.teamId}
                          </td>
                          {isGrouped && standingsGroup === 'all' && (
                            <td className="p-3">
                              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                {s.group ?? '—'}
                              </span>
                            </td>
                          )}
                          <td className="p-3">{s.wins}</td>
                          <td className="p-3">{s.losses}</td>
                          <td className="p-3">{s.pointsFor}</td>
                          <td className="p-3">{s.pointsAgainst}</td>
                          <td className="p-3">{s.negs}</td>
                          <td className="p-3">{ppb}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
