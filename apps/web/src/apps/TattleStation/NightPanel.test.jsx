import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NightPanel from './NightPanel';
import useGameStore from '../../stores/gameStore';

function setStore(patch) {
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    ...patch,
  });
}

describe('NightPanel', () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState());
  });

  it('returns null when hackerNightView is null', () => {
    setStore({
      hackerNightView: null,
    });
    const { container } = render(<NightPanel socket={{ send: () => {} }} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders candidate list excluding Hackers, self, and dead players', () => {
    setStore({
      selfId: 'p1',
      myTeam: 'HACKERS',
      myTeammates: ['p2'],
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'P2', alive: true, connected: true },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true },
        p4: { playerId: 'p4', displayName: 'P4', alive: false, connected: true },
        p5: { playerId: 'p5', displayName: 'P5', alive: true, connected: true },
      },
      hackerNightView: { tally: {}, confirmedTarget: null },
    });

    render(<NightPanel socket={{ send: () => {} }} />);

    expect(screen.queryByText('P1')).not.toBeInTheDocument(); // self
    expect(screen.queryByText('P2')).not.toBeInTheDocument(); // teammate
    expect(screen.queryByText('P4')).not.toBeInTheDocument(); // dead
    expect(screen.getByText('P3')).toBeInTheDocument();
    expect(screen.getByText('P5')).toBeInTheDocument();
  });

  it('dispatches submitIntent with HACKER_KILL when a target is confirmed', () => {
    setStore({
      selfId: 'p1',
      myTeam: 'HACKERS',
      myTeammates: [],
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true },
      },
      hackerNightView: { tally: {}, confirmedTarget: null },
    });
    const send = vi.fn();

    render(<NightPanel socket={{ send }} />);
    fireEvent.click(screen.getByText('P3'));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(send).toHaveBeenCalledWith('submitIntent', {
      intent: {
        type: 'SUBMIT_NIGHT_ACTION',
        payload: {
          actionType: 'HACKER_KILL',
          targetPlayerId: 'p3',
          metadata: {},
        },
      },
    });
  });

  it('shows tally next to each candidate when provided', () => {
    setStore({
      selfId: 'p1',
      myTeam: 'HACKERS',
      myTeammates: ['p2'],
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'P2', alive: true, connected: true },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true },
        p5: { playerId: 'p5', displayName: 'P5', alive: true, connected: true },
      },
      hackerNightView: { tally: { p3: 2 }, confirmedTarget: null },
    });

    render(<NightPanel socket={{ send: () => {} }} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('reflects confirmedNightKill (rehydration on reconnect)', () => {
    setStore({
      selfId: 'p1',
      myTeam: 'HACKERS',
      myTeammates: [],
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true },
      },
      hackerNightView: { tally: { p3: 1 }, confirmedTarget: 'p3' },
    });

    render(<NightPanel socket={{ send: () => {} }} />);
    const button = screen.getByRole('button', { name: /submitted/i });
    expect(button).toBeDisabled();
  });
});
