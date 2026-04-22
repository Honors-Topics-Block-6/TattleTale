import { useEffect, useMemo, useState } from 'react';
import { fetchLeaderboard } from '../lib/leaderboard-api';

export default function LeaderboardPanel({ accountId, pageSize = 20, compact = false }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetchLeaderboard({ limit: pageSize, offset, accountId });
        if (!cancelled) {
          setData(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load leaderboard');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [accountId, offset, pageSize]);

  const entries = data?.entries ?? [];
  const canPrev = offset > 0;
  const canNext = Boolean(data?.hasMore);

  const ownRankLabel = useMemo(() => {
    if (!data?.currentUser) return 'Unranked';
    return `#${data.currentUser.rank} - ${data.currentUser.totalPoints} pts`;
  }, [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 'bold' }}>Global Points Leaderboard</div>
        <button
          onClick={() => setOffset(0)}
          disabled={loading}
          style={{ fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>

      <div style={{ fontSize: compact ? 11 : 12, color: '#444' }}>Your rank: {ownRankLabel}</div>

      <div style={{ border: '1px solid #b7b7b7', background: '#fff', flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? 11 : 12 }}>
          <thead>
            <tr style={{ background: '#ececec', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px' }}>Rank</th>
              <th style={{ padding: '6px 8px' }}>Player</th>
              <th style={{ padding: '6px 8px' }}>Points</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isCurrentUser = accountId && entry.accountId === accountId;
              return (
                <tr key={entry.accountId} style={{ background: isCurrentUser ? '#dff0ff' : 'transparent' }}>
                  <td style={{ padding: '6px 8px', borderTop: '1px solid #eee' }}>#{entry.rank}</td>
                  <td style={{ padding: '6px 8px', borderTop: '1px solid #eee' }}>
                    {entry.displayName}
                    {isCurrentUser ? ' (you)' : ''}
                  </td>
                  <td style={{ padding: '6px 8px', borderTop: '1px solid #eee' }}>{entry.totalPoints}</td>
                </tr>
              );
            })}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: '12px 8px', color: '#666' }}>
                  No leaderboard data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div style={{ color: '#b00020', fontSize: 12 }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => setOffset((v) => Math.max(0, v - pageSize))} disabled={!canPrev || loading}>
          Previous
        </button>
        <span style={{ fontSize: 11, color: '#555' }}>
          Showing {offset + 1}-{offset + entries.length} of {data?.total ?? 0}
        </span>
        <button onClick={() => setOffset((v) => v + pageSize)} disabled={!canNext || loading}>
          Next
        </button>
      </div>
    </div>
  );
}
