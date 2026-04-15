import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SystemEventFeed from './SystemEventFeed';

describe('SystemEventFeed', () => {
  it('renders PLAYER_VOTED_OUT with target display name', () => {
    const events = [
      {
        id: 'e1',
        type: 'PLAYER_VOTED_OUT',
        createdAt: '2026-03-17T00:00:30.000Z',
        metadata: { type: 'PLAYER_VOTED_OUT', targetPlayerId: 'p3', targetDisplayName: 'Alice' },
      },
    ];
    render(<SystemEventFeed events={events} />);
    expect(screen.getByText(/Alice was voted out/i)).toBeInTheDocument();
  });

  it('renders PLAYER_KILLED_AT_NIGHT with target display name', () => {
    const events = [
      {
        id: 'e1',
        type: 'PLAYER_KILLED_AT_NIGHT',
        createdAt: '2026-03-17T00:00:30.000Z',
        metadata: { type: 'PLAYER_KILLED_AT_NIGHT', targetPlayerId: 'p3', targetDisplayName: 'Bob' },
      },
    ];
    render(<SystemEventFeed events={events} />);
    expect(screen.getByText(/Bob was hacked in the night/i)).toBeInTheDocument();
  });

  it('renders NO_KILL_TONIGHT without metadata', () => {
    const events = [
      { id: 'e1', type: 'NO_KILL_TONIGHT', createdAt: '2026-03-17T00:00:30.000Z', metadata: { type: 'NO_KILL_TONIGHT' } },
    ];
    render(<SystemEventFeed events={events} />);
    expect(screen.getByText(/the night passed without incident/i)).toBeInTheDocument();
  });

  it('renders GAME_STARTED', () => {
    const events = [
      { id: 'e1', type: 'GAME_STARTED', createdAt: '2026-03-17T00:00:00.000Z', metadata: { type: 'GAME_STARTED' } },
    ];
    render(<SystemEventFeed events={events} />);
    expect(screen.getByText(/the game has begun/i)).toBeInTheDocument();
  });

  it('falls back to the raw type when no template matches', () => {
    const events = [
      { id: 'e1', type: 'UNKNOWN_TYPE', createdAt: '2026-03-17T00:00:30.000Z', metadata: {} },
    ];
    render(<SystemEventFeed events={events} />);
    expect(screen.getByText(/unknown type/i)).toBeInTheDocument();
  });

  it('renders a placeholder when events is empty', () => {
    render(<SystemEventFeed events={[]} />);
    expect(screen.getByText(/waiting for results/i)).toBeInTheDocument();
  });

  it('renders PLAYER_VOTED_OUT without metadata gracefully', () => {
    const events = [
      { id: 'e1', type: 'PLAYER_VOTED_OUT', createdAt: '2026-03-17T00:00:30.000Z' },
    ];
    render(<SystemEventFeed events={events} />);
    expect(screen.getByText(/was voted out/i)).toBeInTheDocument();
  });
});
