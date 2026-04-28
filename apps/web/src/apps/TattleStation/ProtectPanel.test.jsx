import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectPanel from './ProtectPanel';
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

describe('ProtectPanel', () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState());
  });

  it('returns null when protectNightView is null', () => {
    setStore({ protectNightView: null });
    const { container } = renderWithSocket(<ProtectPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders living non-self candidates', () => {
    setStore({
      selfId: 'p1',
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'P2', alive: true, connected: true },
        p3: { playerId: 'p3', displayName: 'P3', alive: false, connected: true },
        p4: { playerId: 'p4', displayName: 'P4', alive: true, connected: true },
      },
      protectNightView: { confirmedTarget: null },
    });

    renderWithSocket(<ProtectPanel />);

    expect(screen.queryByText('P1')).not.toBeInTheDocument(); // self
    expect(screen.queryByText('P3')).not.toBeInTheDocument(); // dead
    expect(screen.getByText('P2')).toBeInTheDocument();
    expect(screen.getByText('P4')).toBeInTheDocument();
  });

  it('dispatches submitIntent with PROTECT when a target is confirmed', () => {
    setStore({
      selfId: 'p1',
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'P2', alive: true, connected: true },
      },
      protectNightView: { confirmedTarget: null },
    });
    const send = vi.fn();

    renderWithSocket(<ProtectPanel />, { send });
    fireEvent.click(screen.getByText('P2'));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(send).toHaveBeenCalledWith('submitIntent', {
      intent: {
        type: 'SUBMIT_NIGHT_ACTION',
        payload: {
          actionType: 'PROTECT',
          targetPlayerId: 'p2',
          metadata: {},
        },
        clientTimestamp: expect.any(String),
      },
    });
  });

  it('disables the button and shows Submitted after confirmation (rehydration)', () => {
    setStore({
      selfId: 'p1',
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'P2', alive: true, connected: true },
      },
      protectNightView: { confirmedTarget: 'p2' },
    });

    renderWithSocket(<ProtectPanel />);
    const button = screen.getByRole('button', { name: /submitted/i });
    expect(button).toBeDisabled();
  });
});
