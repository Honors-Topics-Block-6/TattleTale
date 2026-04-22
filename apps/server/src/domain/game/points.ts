import { Team } from '@tattletale/shared';
import type { GameState } from './types.js';
import type { LobbyState } from '../lobby/types.js';

export interface PointAward {
  accountId: string;
  points: number;
  didWin: boolean;
  didLose: boolean;
}

/**
 * Pure: compute the per-account point awards at game end.
 *
 * Spec (#95):
 *  - Hackers win   → each hacker with an account gets `10 × alive hackers`
 *  - Friends win   → each friend with an account gets 60
 *  - Losers        → 0 points, but still record the loss
 *  - Abandoned run → no winner; everyone's `games_played` still increments
 *                    (enforced by the caller by looking at points+didWin+didLose=false)
 *
 * Only players whose lobby entry carries an `accountId` receive an award —
 * anonymous joiners are filtered out by construction.
 */
export function computePointAwards(session: GameState, lobby: LobbyState): PointAward[] {
  const lobbyByPlayerId = new Map(lobby.players.map((p) => [p.playerId, p]));
  const allPlayers = Object.values(session.players);
  const aliveHackers = allPlayers.filter((p) => p.team === Team.HACKERS && p.alive).length;

  const hasWinner = session.winnerTeam === Team.FRIENDS || session.winnerTeam === Team.HACKERS;

  const awards: PointAward[] = [];
  for (const player of allPlayers) {
    const lobbyPlayer = lobbyByPlayerId.get(player.playerId);
    if (!lobbyPlayer?.accountId) continue;
    const didWin = hasWinner && player.team === session.winnerTeam;
    const didLose = hasWinner && !didWin;
    let points = 0;
    if (didWin && session.winnerTeam === Team.HACKERS) {
      points = aliveHackers * 10;
    } else if (didWin && session.winnerTeam === Team.FRIENDS) {
      points = 60;
    }
    awards.push({ accountId: lobbyPlayer.accountId, points, didWin, didLose });
  }
  return awards;
}
