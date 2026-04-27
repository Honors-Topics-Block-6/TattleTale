import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('dispatches submitIntent with INVESTIGATE when a target is confirmed', async () => {
    setStore({
      selfId: 'p1',
      selfRole: 'WHITE_HAT_HACKER',
      cycle: 2,
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true, team: 'FRIENDS' },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true, team: 'HACKERS' },
      },
    });
    const send = vi.fn().mockResolvedValue(undefined);

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
    await waitFor(() =>
      expect(useGameStore.getState().investigateSubmittedCycle).toBe(2),
    );
  });

  it('shows "Submitted" when investigateSubmittedCycle matches the current cycle', () => {
    setStore({
      selfId: 'p1',
      selfRole: 'WHITE_HAT_HACKER',
      cycle: 3,
      investigateSubmittedCycle: 3,
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true, team: 'FRIENDS' },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true, team: 'HACKERS' },
      },
    });

    renderWithSocket(<InvestigatePanel />);
    const button = screen.getByRole('button', { name: /submitted/i });
    expect(button).toBeDisabled();
  });

  it('does NOT treat a different cycle as submitted (resilient to stale flag)', () => {
    setStore({
      selfId: 'p1',
      selfRole: 'WHITE_HAT_HACKER',
      cycle: 4,
      investigateSubmittedCycle: 3, // stale from previous night
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true, team: 'FRIENDS' },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true, team: 'HACKERS' },
      },
    });

    renderWithSocket(<InvestigatePanel />);
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
  });

  it('disables Confirm when no target is selected', () => {
    setStore({
      selfId: 'p1',
      selfRole: 'WHITE_HAT_HACKER',
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true, team: 'FRIENDS' },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true, team: 'HACKERS' },
      },
    });

    renderWithSocket(<InvestigatePanel />);
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
  });

  it('renders an empty-state message when no valid targets remain', () => {
    setStore({
      selfId: 'p1',
      selfRole: 'WHITE_HAT_HACKER',
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true, team: 'FRIENDS' },
        p2: { playerId: 'p2', displayName: 'P2', alive: false, connected: true, team: 'FRIENDS' },
      },
    });

    renderWithSocket(<InvestigatePanel />);
    expect(screen.getByText(/No valid targets available/i)).toBeInTheDocument();
  });

  it('supports keyboard selection (Enter/Space) for accessibility', () => {
    setStore({
      selfId: 'p1',
      selfRole: 'WHITE_HAT_HACKER',
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true, team: 'FRIENDS' },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true, team: 'HACKERS' },
      },
    });

    renderWithSocket(<InvestigatePanel />);
    const option = screen.getByText('P3').closest('[role="option"]');
    expect(option).toHaveAttribute('tabIndex', '0');
    fireEvent.keyDown(option, { key: 'Enter' });
    expect(useGameStore.getState().pendingInvestigateSelection).toBe('p3');
  });

  it('surfaces an inline error when the socket send rejects', async () => {
    setStore({
      selfId: 'p1',
      selfRole: 'WHITE_HAT_HACKER',
      cycle: 1,
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true, team: 'FRIENDS' },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true, team: 'HACKERS' },
      },
    });
    const send = vi.fn().mockRejectedValue(new Error('network down'));

    renderWithSocket(<InvestigatePanel />, { send });
    fireEvent.click(screen.getByText('P3'));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/network down/i);
    });
    expect(useGameStore.getState().investigateSubmittedCycle).toBeNull();
  });
});
