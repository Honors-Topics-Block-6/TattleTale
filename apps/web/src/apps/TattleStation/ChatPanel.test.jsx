import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom does not implement scrollIntoView — stub it globally so ChatPanel's
// useEffect auto-scroll does not throw.
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

import ChatPanel from './ChatPanel';
import useGameStore from '../../stores/gameStore';
import { SocketContext } from '../../lib/SocketContext';

function setStore(patch) {
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    ...patch,
  });
}

function renderWithSocket(ui, socket = { send: vi.fn() }) {
  return render(
    <SocketContext.Provider value={socket}>{ui}</SocketContext.Provider>
  );
}

function makeChannel(id, type, locked = false) {
  return {
    id,
    type,
    members: ['p1', 'p2'],
    locked,
    expiresAt: null,
    label: type === 'PRIVATE' ? 'Bob' : null,
    messages: [],
  };
}

describe('ChatPanel — PRIVATE channel phase restriction', () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState());
  });

  it('PRIVATE channel + DAY_OPEN phase → text input visible and enabled', () => {
    setStore({
      selfId: 'p1',
      selfAlive: true,
      phase: 'DAY_OPEN',
      channels: {
        'dm-p1-p2': makeChannel('dm-p1-p2', 'PRIVATE'),
      },
    });

    renderWithSocket(<ChatPanel channelId="dm-p1-p2" />);
    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    expect(screen.queryByText(/private messages are disabled/i)).not.toBeInTheDocument();
  });

  it('PRIVATE channel + DAY_VOTE phase → input replaced by restriction notice', () => {
    setStore({
      selfId: 'p1',
      selfAlive: true,
      phase: 'DAY_VOTE',
      channels: {
        'dm-p1-p2': makeChannel('dm-p1-p2', 'PRIVATE'),
      },
    });

    renderWithSocket(<ChatPanel channelId="dm-p1-p2" />);
    expect(screen.queryByPlaceholderText(/type a message/i)).not.toBeInTheDocument();
    expect(screen.getByText(/private messages are disabled during this phase/i)).toBeInTheDocument();
  });

  it('PRIVATE channel + NIGHT_ACTIONS phase → input replaced by restriction notice', () => {
    setStore({
      selfId: 'p1',
      selfAlive: true,
      phase: 'NIGHT_ACTIONS',
      channels: {
        'dm-p1-p2': makeChannel('dm-p1-p2', 'PRIVATE'),
      },
    });

    renderWithSocket(<ChatPanel channelId="dm-p1-p2" />);
    expect(screen.queryByPlaceholderText(/type a message/i)).not.toBeInTheDocument();
    expect(screen.getByText(/private messages are disabled during this phase/i)).toBeInTheDocument();
  });

  it('GLOBAL channel + DAY_VOTE phase → input visible and enabled (no regression)', () => {
    setStore({
      selfId: 'p1',
      selfAlive: true,
      phase: 'DAY_VOTE',
      channels: {
        global: makeChannel('global', 'GLOBAL'),
      },
    });

    renderWithSocket(<ChatPanel channelId="global" />);
    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    expect(screen.queryByText(/private messages are disabled/i)).not.toBeInTheDocument();
  });

  it('GLOBAL channel + NIGHT_ACTIONS phase → input visible (no regression)', () => {
    setStore({
      selfId: 'p1',
      selfAlive: true,
      phase: 'NIGHT_ACTIONS',
      channels: {
        global: makeChannel('global', 'GLOBAL'),
      },
    });

    renderWithSocket(<ChatPanel channelId="global" />);
    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
  });

  it('PRIVATE channel + DAY_OPEN but dead player → no input area at all (selfAlive gate)', () => {
    setStore({
      selfId: 'p1',
      selfAlive: false,
      phase: 'DAY_OPEN',
      channels: {
        'dm-p1-p2': makeChannel('dm-p1-p2', 'PRIVATE'),
      },
    });

    renderWithSocket(<ChatPanel channelId="dm-p1-p2" />);
    expect(screen.queryByPlaceholderText(/type a message/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private messages are disabled/i)).not.toBeInTheDocument();
  });
});

describe('ChatPanel — communication restrictions (#76)', () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState());
  });

  it('SILENCED restriction → banner shown, input hidden', () => {
    setStore({
      selfId: 'p1',
      selfAlive: true,
      phase: 'DAY_OPEN',
      channels: { global: makeChannel('global', 'GLOBAL') },
      myRestrictions: [{ type: 'SILENCED', expiresAt: 'DAY_RESOLVE' }],
    });

    renderWithSocket(<ChatPanel channelId="global" />);
    expect(screen.queryByPlaceholderText(/type a message/i)).not.toBeInTheDocument();
    expect(screen.getByText(/you have been silenced/i)).toBeInTheDocument();
  });

  it('JAMMED on matching channel type → banner shown', () => {
    setStore({
      selfId: 'p1',
      selfAlive: true,
      phase: 'DAY_OPEN',
      channels: { 'dm-p1-p2': makeChannel('dm-p1-p2', 'PRIVATE') },
      myRestrictions: [
        { type: 'JAMMED', channelTypes: ['PRIVATE'], expiresAt: 'DAY_RESOLVE' },
      ],
    });

    renderWithSocket(<ChatPanel channelId="dm-p1-p2" />);
    expect(screen.queryByPlaceholderText(/type a message/i)).not.toBeInTheDocument();
    expect(screen.getByText(/signal is jammed/i)).toBeInTheDocument();
  });

  it('JAMMED on a different channel type → input remains usable', () => {
    setStore({
      selfId: 'p1',
      selfAlive: true,
      phase: 'DAY_OPEN',
      channels: { global: makeChannel('global', 'GLOBAL') },
      myRestrictions: [
        { type: 'JAMMED', channelTypes: ['PRIVATE'], expiresAt: 'DAY_RESOLVE' },
      ],
    });

    renderWithSocket(<ChatPanel channelId="global" />);
    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    expect(screen.queryByText(/signal is jammed/i)).not.toBeInTheDocument();
  });
});
