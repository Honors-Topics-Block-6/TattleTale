// Wire-level payload shapes for server → client pushes.
// Message type strings are defined in messages.ts (ServerMessageType).

export interface ChannelMessagePayload {
  channelId: string;
  message: {
    id: string;
    senderId: string;
    senderName: string;
    senderAvatar?: string | null;
    content: string;
    timestamp: string;
    cycle: number;
  };
}

export interface PlayerEliminatedPayload {
  playerId: string;
  cause: 'VOTED_OUT' | 'NIGHT_KILL' | 'PLAYER_LEFT' | 'PLAYER_KICKED';
  cycle: number;
}
