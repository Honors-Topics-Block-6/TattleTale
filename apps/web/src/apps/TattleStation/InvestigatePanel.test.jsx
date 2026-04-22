import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InvestigatePanel from './InvestigatePanel';
import useGameStore from '../../stores/gameStore';
import { SocketContext } from '../../lib/SocketContext';

function setStore(patch) {
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    ...patch,
  });
}

function renderWithSocket(ui, socket = { send: () => {} }) {
  return render(
    <SocketContext.Provider value={socket}>{ui}</SocketContext.Provider>
  );
}

describe('InvestigatePanel', () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState());
  });

  it('renders all living players except self (teammates/Friends included)', () => {
    setStore({
      selfId: 'p1',
      selfRole: 'WHITE_HAT_HACKER',
      selfTeam: 'FRIENDS',
      myTeam: 'FRIENDS',
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true, team: 'FRIENDS' },
        p2: { playerId: 'p2', displayName: 'P2', alive: true, connected: true, team: 'FRIENDS' },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true, team: 'HACKERS' },
        p4: { playerId: 'p4', displayName: 'P4', alive: false, connected: true, team: 'FRIENDS' },
      },
    });

    renderWithSocket(<InvestigatePanel />);

    expect(screen.queryByText('P1')).not.toBeInTheDocument();
    expect(screen.queryByText('P4')).not.toBeInTheDocument();
    expect(screen.getByText('P2')).toBeInTheDocument();
    expect(screen.getByText('P3')).toBeInTheDocument();
  });

  it('dispatches submitIntent with INVESTIGATE when a target is confirmed', () => {
    setStore({
      selfId: 'p1',
      selfRole: 'WHITE_HAT_HACKER',
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true, team: 'FRIENDS' },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true, team: 'HACKERS' },
      },
    });
    const send = vi.fn();

    renderWithSocket(<InvestigatePanel />, { send });
    fireEvent.click(screen.getByText('P3'));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(send).toHaveBeenCalledWith('submitIntent', {
      intent: {
        type: 'SUBMIT_NIGHT_ACTION',
        payload: {
          actionType: 'INVESTIGATE',
          targetPlayerId: 'p3',
          metadata: {},
        },
        clientTimestamp: expect.any(String),
      },
    });
  });

  it('shows "Submitted" when a SUBMIT_NIGHT_ACTION intent is already pending', () => {
    setStore({
      selfId: 'p1',
      selfRole: 'WHITE_HAT_HACKER',
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true, team: 'FRIENDS' },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true, team: 'HACKERS' },
      },
      pendingIntentTypes: ['SUBMIT_NIGHT_ACTION'],
    });

    renderWithSocket(<InvestigatePanel />);
    const button = screen.getByRole('button', { name: /submitted/i });
    expect(button).toBeDisabled();
  });
});
