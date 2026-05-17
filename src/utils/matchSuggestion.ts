import { getSuggestedFormat } from '../theme';
import { generateRoundRobinSchedule, generateMultiGameRRSchedule, getRRKey, MultiGameRRMatch } from './tournament';
import { DraftRoom } from './types';

export interface PendingMatchup {
  description: string;
  opponentName: string;
}

function findEligibleRRPairing(
  schedule: Array<Array<[string, string]>>,
  rrResults: Record<string, unknown>,
  userId: string,
): { oppId: string } | null {
  function hasPending(playerId: string, roundIdx: number): boolean {
    const pair = schedule[roundIdx].find(([p1, p2]) => p1 === playerId || p2 === playerId);
    return !!pair && !rrResults[getRRKey(pair[0], pair[1])];
  }
  function isFree(playerId: string, beforeRound: number): boolean {
    for (let r = 0; r < beforeRound; r++) if (hasPending(playerId, r)) return false;
    return true;
  }
  for (let i = 0; i < schedule.length; i++) {
    const pair = schedule[i].find(([p1, p2]) => p1 === userId || p2 === userId);
    if (!pair) continue;
    const [p1id, p2id] = pair;
    if (rrResults[getRRKey(p1id, p2id)]) continue;
    const oppId = p1id === userId ? p2id : p1id;
    if (isFree(userId, i) && isFree(oppId, i)) return { oppId };
    return null;
  }
  return null;
}

function findEligibleMultiGameMatch(
  schedule: Array<Array<MultiGameRRMatch>>,
  rrResults: Record<string, unknown>,
  userId: string,
): MultiGameRRMatch | null {
  function hasPending(playerId: string, slotIdx: number): boolean {
    const m = schedule[slotIdx].find(m => m.p1id === playerId || m.p2id === playerId);
    return !!m && !rrResults[m.gameKey];
  }
  function isFree(playerId: string, beforeSlot: number): boolean {
    for (let r = 0; r < beforeSlot; r++) if (hasPending(playerId, r)) return false;
    return true;
  }
  for (let i = 0; i < schedule.length; i++) {
    const m = schedule[i].find(m => m.p1id === userId || m.p2id === userId);
    if (!m) continue;
    if (rrResults[m.gameKey]) continue;
    const oppId = m.p1id === userId ? m.p2id : m.p1id;
    if (isFree(userId, i) && isFree(oppId, i)) return m;
    return null;
  }
  return null;
}

/** Returns a pending matchup description if the current user has an active match in the room. */
export function findPendingMatchup(
  room: DraftRoom,
  userId: string,
): PendingMatchup | null {
  if (room.status !== 'in_progress') return null;

  const playerNames: Record<string, string> = {};
  room.players.forEach(p => { playerNames[p.id] = p.name; });
  const fmt = room.format === 'suggested' ? getSuggestedFormat(room.players.length) : room.format;

  // Bracket / seeded / double-elim / two-phase phase 2
  if (room.bracket && (
    fmt === 'single_elim' || fmt === 'double_elim' || fmt === 'seeded' ||
    (fmt === 'two_phase' && room.phase === 2)
  )) {
    const match = room.bracket.find(m =>
      !m.result && !m.isBye && m.player1Id && m.player2Id &&
      (m.player1Id === userId || m.player2Id === userId),
    );
    if (match) {
      const oppId = match.player1Id === userId ? match.player2Id! : match.player1Id!;
      const oppName = playerNames[oppId] ?? 'Opponent';
      return { description: `Bracket match vs ${oppName}`, opponentName: oppName };
    }
  }

  // Round Robin
  if (fmt === 'round_robin') {
    const result = findEligibleRRPairing(
      generateRoundRobinSchedule(room.players),
      room.rrResults ?? {},
      userId,
    );
    if (result) {
      const oppName = playerNames[result.oppId] ?? 'Opponent';
      return { description: `Round Robin vs ${oppName}`, opponentName: oppName };
    }
  }

  // Two-phase phase 1 (multi-game RR)
  if (fmt === 'two_phase' && room.phase === 1) {
    const m = findEligibleMultiGameMatch(
      generateMultiGameRRSchedule(room.players, room.settings?.rrGamesCount ?? 1),
      room.rrResults ?? {},
      userId,
    );
    if (m) {
      const oppId = m.p1id === userId ? m.p2id : m.p1id;
      const oppName = playerNames[oppId] ?? 'Opponent';
      return { description: `Round Robin vs ${oppName}`, opponentName: oppName };
    }
  }

  // MTGA Swiss
  if (fmt === 'mtga' && room.mtgaRounds) {
    const currentRound = [...room.mtgaRounds].reverse().find(r => !r.isComplete);
    if (currentRound) {
      const matchup = currentRound.matchups.find(m =>
        !m.winnerId && !m.isBye &&
        (m.player1Id === userId || m.player2Id === userId),
      );
      if (matchup) {
        const oppId = matchup.player1Id === userId ? matchup.player2Id! : matchup.player1Id!;
        const oppName = playerNames[oppId] ?? 'Opponent';
        return { description: `Swiss R${currentRound.roundNumber} vs ${oppName}`, opponentName: oppName };
      }
    }
  }

  // Commander pods
  if (fmt === 'commander' && room.commanderPods) {
    const maxRound = Math.max(...room.commanderPods.map(p => p.round));
    const activePod = room.commanderPods.find(p =>
      p.round === maxRound && !p.results && p.playerIds.includes(userId),
    );
    if (activePod) {
      const podmates = activePod.playerIds
        .filter(id => id !== userId)
        .map(id => playerNames[id] ?? 'Opponent')
        .join(', ');
      return { description: `Commander Pod vs ${podmates}`, opponentName: podmates };
    }
  }

  return null;
}
