import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import ChannelSidebar from './ChannelSidebar';
import useGameStore from '../../stores/gameStore';

function setStore(patch) {
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    ...patch,
  });
}

function makeDmChannel(id, label, memberId, otherId, otherAlive = true) {
  return {
    id,
    type: 'PRIVATE',
    members: [memberId, otherId],
    locked: false,
    expiresAt: null,
    label,
    messages: [],
  };
}

describe('ChannelSidebar — PRIVATE / DM channel rendering', () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState());
  });

  it('"Direct Messages" header renders when at least one PRIVATE channel exists', () => {
    setStore({
      selfId: 'p1',
      channels: {
        'dm-p1-p2': makeDmChannel('dm-p1-p2', 'Bob', 'p1', 'p2'),
      },
      players: {
        p1: { playerId: 'p1', displayName: 'Alice', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'Bob', alive: true, connected: true },
      },
    });

    render(<ChannelSidebar />);
    expect(screen.getByText(/direct messages/i)).toBeInTheDocument();
  });

  it('"Direct Messages" header is absent when zero PRIVATE channels exist', () => {
    setStore({
      selfId: 'p1',
      channels: {
        global: { id: 'global', type: 'GLOBAL', members: ['p1'], locked: false, expiresAt: null, label: null, messages: [] },
      },
      players: {
        p1: { playerId: 'p1', displayName: 'Alice', alive: true, connected: true },
      },
    });

    render(<ChannelSidebar />);
    expect(screen.queryByText(/direct messages/i)).not.toBeInTheDocument();
  });

  it('PRIVATE channel renders using channel.label (partner displayName)', () => {
    setStore({
      selfId: 'p1',
      channels: {
        'dm-p1-p2': makeDmChannel('dm-p1-p2', 'Bob', 'p1', 'p2'),
      },
      players: {
        p1: { playerId: 'p1', displayName: 'Alice', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'Bob', alive: true, connected: true },
      },
    });

    render(<ChannelSidebar />);
    // The channel label text "Bob" should appear in the sidebar
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('falls back to "Private" text when channel.label is null', () => {
    setStore({
      selfId: 'p1',
      channels: {
        'dm-p1-p2': makeDmChannel('dm-p1-p2', null, 'p1', 'p2'),
      },
      players: {
        p1: { playerId: 'p1', displayName: 'Alice', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'Bob', alive: true, connected: true },
      },
    });

    render(<ChannelSidebar />);
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('eliminated partner causes the channel label to render with reduced opacity (0.45)', () => {
    setStore({
      selfId: 'p1',
      channels: {
        'dm-p1-p2': makeDmChannel('dm-p1-p2', 'Bob', 'p1', 'p2'),
      },
      players: {
        p1: { playerId: 'p1', displayName: 'Alice', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'Bob', alive: false, connected: false },
      },
    });

    render(<ChannelSidebar />);
    // The label span should have opacity 0.45 applied inline
    const labelEl = screen.getByText('Bob');
    expect(labelEl).toHaveStyle({ opacity: '0.45' });
  });

  it('living partner channel does NOT apply reduced opacity to label', () => {
    setStore({
      selfId: 'p1',
      channels: {
        'dm-p1-p2': makeDmChannel('dm-p1-p2', 'Bob', 'p1', 'p2'),
      },
      players: {
        p1: { playerId: 'p1', displayName: 'Alice', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'Bob', alive: true, connected: true },
      },
    });

    render(<ChannelSidebar />);
    const labelEl = screen.getByText('Bob');
    // opacity should not be 0.45
    const style = window.getComputedStyle(labelEl);
    expect(style.opacity).not.toBe('0.45');
  });

  it('"Direct Messages" header appears only once when multiple PRIVATE channels exist', () => {
    setStore({
      selfId: 'p1',
      channels: {
        'dm-p1-p2': makeDmChannel('dm-p1-p2', 'Bob', 'p1', 'p2'),
        'dm-p1-p3': makeDmChannel('dm-p1-p3', 'Carol', 'p1', 'p3'),
      },
      players: {
        p1: { playerId: 'p1', displayName: 'Alice', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'Bob', alive: true, connected: true },
        p3: { playerId: 'p3', displayName: 'Carol', alive: true, connected: true },
      },
    });

    render(<ChannelSidebar />);
    const headers = screen.getAllByText(/direct messages/i);
    // aria-hidden is set but text still matchable; should render exactly once
    expect(headers).toHaveLength(1);
  });
});
