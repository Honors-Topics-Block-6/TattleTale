import { randomUUID } from 'node:crypto';
import type { ChannelState, SessionState } from './types.js';

function buildPrivateLabel(a: string, b: string): string {
  return [a, b].sort((left, right) => left.localeCompare(right)).join('-');
}

export function isMember(channel: ChannelState, playerId: string): boolean {
  return channel.members.includes(playerId);
}

export function getChannelById(session: SessionState, channelId: string): ChannelState | null {
  return session.channels.get(channelId) ?? null;
}

export function ensurePrivateChannel(
  session: SessionState,
  leftPlayer: { id: string; name: string },
  rightPlayer: { id: string; name: string }
): ChannelState {
  const existing = [...session.channels.values()].find((channel) => {
    if (channel.type !== 'PRIVATE') return false;
    if (channel.members.length !== 2) return false;
    return channel.members.includes(leftPlayer.id) && channel.members.includes(rightPlayer.id);
  });

  if (existing) return existing;

  const channelId = `private-${randomUUID()}`;
  const label = buildPrivateLabel(leftPlayer.name, rightPlayer.name);
  const channel: ChannelState = {
    id: channelId,
    label,
    type: 'PRIVATE',
    members: [leftPlayer.id, rightPlayer.id],
    locked: false,
  };

  session.channels.set(channel.id, channel);
  session.messagesByChannel.set(channel.id, []);
  return channel;
}
