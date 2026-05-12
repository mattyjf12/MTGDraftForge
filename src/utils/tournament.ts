// ─────────────────────────────────────────────
// MTG Draft Forge — Tournament Logic
// ─────────────────────────────────────────────
import { BracketMatch, Player, RRResult, RRResultKey, StandingsEntry, DraftRoom, MTGARecord, MTGAMatchup, MTGARound, CommanderPod } from './types';
import { FormatId, getSuggestedFormat } from '../theme';

// ── Helpers ───────────────────────────────────

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function getRRKey(id1: string, id2: string): RRResultKey {
  return [id1, id2].sort().join('|');
}

// ── Single / Seeded Elimination ───────────────

/**
 * Returns bracket slot positions (1-indexed seed numbers) for a power-of-2 bracket
 * using standard tournament seeding: 1 vs n, 2 vs n-1, etc., with top seeds kept
 * apart so they only meet in the final.
 *
 * Example (size=8): [1, 8, 4, 5, 2, 7, 3, 6]
 *   → pairs: (1,8), (4,5), (2,7), (3,6)
 *   → semis (if seeds hold): (1,4) and (2,3) → final: (1,2)
 */
function seededSlotOrder(size: number): number[] {
  let slots = [1, 2];
  while (slots.length < size) {
    const n = slots.length * 2 + 1;
    slots = slots.flatMap(s => [s, n - s]);
  }
  return slots;
}

export function generateSingleElimBracket(players: Player[], seeded = false): BracketMatch[] {
  const size = nextPowerOfTwo(players.length);

  let padded: (Player | null)[];
  if (seeded) {
    // Sort by seed ascending — position in sorted array = implicit seed rank
    const sorted = [...players].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
    // Map each bracket slot to the player whose seed rank occupies that slot
    padded = seededSlotOrder(size).map(seedRank => sorted[seedRank - 1] ?? null);
  } else {
    const shuffled = shuffle(players);
    padded = [...shuffled, ...Array(size - shuffled.length).fill(null)];
  }

  const matches: BracketMatch[] = [];
  let matchIdx = 0;

  // Round 1 — pair players, auto-advance byes
  for (let i = 0; i < size; i += 2) {
    const p1 = padded[i];
    const p2 = padded[i + 1];
    const isBye = p2 === null;
    matches.push({
      id: `r0_m${matchIdx}`,
      round: 0,
      matchIndex: matchIdx,
      bracket: 'winners',
      player1Id: p1?.id ?? null,
      player2Id: p2?.id ?? null,
      isBye,
      result: isBye && p1
        ? {
            winnerId: p1.id,
            loserId: '',
            winnerFinalLife: 20,
            loserFinalLife: 0,
            completedAt: Date.now(),
          }
        : undefined,
    });
    matchIdx++;
  }

  // Subsequent rounds — empty slots to be filled as winners advance
  let prevRoundSize = size / 2;
  let round = 1;
  while (prevRoundSize > 1) {
    const roundSize = prevRoundSize / 2;
    for (let i = 0; i < roundSize; i++) {
      matches.push({
        id: `r${round}_m${i}`,
        round,
        matchIndex: i,
        bracket: 'winners',
        player1Id: null,
        player2Id: null,
        isBye: false,
      });
    }
    prevRoundSize = roundSize;
    round++;
  }

  // Propagate first-round byes into round 2
  return propagateByes(matches);
}

function propagateByes(matches: BracketMatch[]): BracketMatch[] {
  const updated = matches.map(m => ({ ...m, result: m.result ? { ...m.result } : undefined }));

  const round0 = updated.filter(m => m.round === 0);
  round0.forEach((match, idx) => {
    if (match.result?.winnerId) {
      const nextRoundIdx = Math.floor(idx / 2);
      const nextMatch = updated.find(m => m.round === 1 && m.matchIndex === nextRoundIdx);
      if (nextMatch) {
        if (idx % 2 === 0) nextMatch.player1Id = match.result.winnerId;
        else nextMatch.player2Id = match.result.winnerId;

        // If both slots now have bye-winners, auto-complete if one is missing
        if (nextMatch.player1Id && !nextMatch.player2Id) {
          nextMatch.isBye = true;
          nextMatch.result = {
            winnerId: nextMatch.player1Id,
            loserId: '',
            winnerFinalLife: 20,
            loserFinalLife: 0,
            completedAt: Date.now(),
          };
        }
      }
    }
  });

  return updated;
}

// ── Double Elimination ────────────────────────
// Generates winners + losers bracket structure

export function generateDoubleElimBracket(players: Player[]): BracketMatch[] {
  const winners = generateSingleElimBracket(players);
  const rounds = maxRound(winners) + 1;
  const losers: BracketMatch[] = [];

  // Losers bracket has (rounds * 2 - 1) rounds approximately
  // Simplified: one losers match per winners round-1 loser
  let loserRound = 0;
  for (let r = 0; r < rounds - 1; r++) {
    const matchesInRound = winners.filter(m => m.round === r).length;
    const loserMatchCount = Math.ceil(matchesInRound / 2);
    for (let i = 0; i < loserMatchCount; i++) {
      losers.push({
        id: `lb_r${loserRound}_m${i}`,
        round: loserRound,
        matchIndex: i,
        bracket: 'losers',
        player1Id: null,
        player2Id: null,
        isBye: false,
      });
    }
    loserRound++;
  }

  // Grand final
  const grandFinal: BracketMatch = {
    id: 'grand_final',
    round: 0,
    matchIndex: 0,
    bracket: 'grand_final',
    player1Id: null,
    player2Id: null,
    isBye: false,
  };

  return [...winners, ...losers, grandFinal];
}

function maxRound(matches: BracketMatch[]): number {
  return Math.max(...matches.map(m => m.round));
}

// ── Round Robin Schedule ──────────────────────
// Returns rounds as arrays of [p1id, p2id] pairs

export function generateRoundRobinSchedule(players: Player[]): Array<Array<[string, string]>> {
  const list = [...players.map(p => p.id)];
  if (list.length % 2 !== 0) list.push('BYE');
  const n = list.length;
  const rounds: Array<Array<[string, string]>> = [];

  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      const p1 = list[i];
      const p2 = list[n - 1 - i];
      if (p1 !== 'BYE' && p2 !== 'BYE') {
        pairs.push([p1, p2]);
      }
    }
    rounds.push(pairs);
    // Rotate: keep index 0 fixed, rotate the rest
    list.splice(1, 0, list.pop()!);
  }

  return rounds;
}

// ── Multi-Game Round Robin Schedule ──────────────────────────
// Each entry has a unique gameKey so results for the same pair
// in different games are stored independently.
// gameKey format: "minId|maxId|N" where N is the 0-based game index.

export interface MultiGameRRMatch {
  p1id: string;
  p2id: string;
  gameKey: string;
}

export function generateMultiGameRRSchedule(
  players: Player[],
  gamesCount: number,
): Array<Array<MultiGameRRMatch>> {
  const baseSchedule = generateRoundRobinSchedule(players);
  const result: Array<Array<MultiGameRRMatch>> = [];
  const pairCount: Record<string, number> = {};

  for (let g = 0; g < Math.max(1, gamesCount); g++) {
    for (const round of baseSchedule) {
      const mappedRound: MultiGameRRMatch[] = round.map(([p1id, p2id]) => {
        const baseKey = getRRKey(p1id, p2id);
        const count = pairCount[baseKey] || 0;
        const gameKey = `${baseKey}|${count}`;
        pairCount[baseKey] = count + 1;
        return { p1id, p2id, gameKey };
      });
      result.push(mappedRound);
    }
  }

  return result;
}

// ── Fixed-games RR Schedule ───────────────────────────────────
// Each player plays exactly `gamesPerPlayer` games total.
// Pairings follow the standard RR rotation, cycling back through it
// if gamesPerPlayer exceeds the number of natural RR rounds.
// Returns rounds in MultiGameRRMatch format (each game has a unique gameKey).

export function generateFixedGamesSchedule(
  players: Player[],
  gamesPerPlayer: number,
): Array<Array<MultiGameRRMatch>> {
  const fullSchedule = generateRoundRobinSchedule(players);
  if (fullSchedule.length === 0) return [];

  const pairCount: Record<string, number> = {};
  const result: Array<Array<MultiGameRRMatch>> = [];

  for (let i = 0; i < gamesPerPlayer; i++) {
    const round = fullSchedule[i % fullSchedule.length];
    const mappedRound: MultiGameRRMatch[] = round.map(([p1id, p2id]) => {
      const baseKey = getRRKey(p1id, p2id);
      const count = pairCount[baseKey] || 0;
      const gameKey = `${baseKey}|${count}`;
      pairCount[baseKey] = count + 1;
      return { p1id, p2id, gameKey };
    });
    result.push(mappedRound);
  }

  return result;
}

// ── Seeded bracket from RR standings ─────────────────────────
// Seeds players by their standings rank, then generates a seeded
// single-elimination bracket for Phase 2 of two_phase format.

export function generateSeededBracketFromStandings(
  players: Player[],
  standings: StandingsEntry[],
): BracketMatch[] {
  const seededPlayers: Player[] = players.map(p => {
    const entry = standings.find(s => s.playerId === p.id);
    return { ...p, seed: entry?.rank ?? players.length + 1 };
  });
  return generateSingleElimBracket(seededPlayers, true);
}

// ── MTGA Records init ─────────────────────────

export function initMTGARecords(players: Player[]): MTGARecord[] {
  return players.map(p => ({
    playerId: p.id,
    wins: 0,
    losses: 0,
    active: true,
  }));
}

// ── MTGA Swiss round generator ────────────────
// Generates pairings for one round of a Swiss-elimination tournament.
// Priority: 1) avoid repeat matchups  2) similar records (wins desc, losses asc)
// If active player count is odd, the highest-standing player who hasn't had a bye
// gets a free win (auto-completed bye).

export function generateMTGARound(
  records: MTGARecord[],
  players: Player[],
  previousRounds: MTGARound[],
): MTGARound {
  const roundNumber = previousRounds.length + 1;

  // Sort active player IDs by standing: wins desc → losses asc → name asc
  const activeIds = records
    .filter(r => r.active)
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
    .map(r => r.playerId);

  if (activeIds.length === 0) {
    return { roundNumber, matchups: [], isComplete: true };
  }

  // Build prior-matchup set for repeat avoidance
  const playedPairs = new Set<string>();
  previousRounds.forEach(round =>
    round.matchups.forEach(m => {
      if (m.player2Id) playedPairs.add(getRRKey(m.player1Id, m.player2Id));
    }),
  );

  // Find players who already received a bye
  const priorByeIds = new Set<string>(
    previousRounds.flatMap(round =>
      round.matchups.filter(m => m.isBye).map(m => m.player1Id),
    ),
  );

  // Determine bye recipient for odd count
  let byeRecipientId: string | null = null;
  let pool = [...activeIds];
  if (pool.length % 2 === 1) {
    // Prefer the highest-standing player who hasn't had a bye yet
    byeRecipientId = pool.find(id => !priorByeIds.has(id)) ?? pool[0];
    pool = pool.filter(id => id !== byeRecipientId);
  }

  // Greedy pairing: work through sorted pool
  const matched = new Set<string>();
  const matchups: MTGAMatchup[] = [];

  for (let i = 0; i < pool.length; i++) {
    const p1 = pool[i];
    if (matched.has(p1)) continue;

    let partner: string | null = null;

    // Pass 1: find first unpaired player with no prior matchup against p1
    for (let j = i + 1; j < pool.length; j++) {
      const p2 = pool[j];
      if (matched.has(p2)) continue;
      if (!playedPairs.has(getRRKey(p1, p2))) { partner = p2; break; }
    }

    // Pass 2: allow repeat if no fresh opponent available
    if (!partner) {
      for (let j = i + 1; j < pool.length; j++) {
        if (!matched.has(pool[j])) { partner = pool[j]; break; }
      }
    }

    if (partner) {
      matched.add(p1);
      matched.add(partner);
      matchups.push({
        id: `r${roundNumber}_${p1.slice(0, 6)}_${partner.slice(0, 6)}`,
        player1Id: p1,
        player2Id: partner,
        isBye: false,
      });
    }
  }

  // Add bye (pre-completed)
  if (byeRecipientId) {
    matchups.unshift({
      id: `r${roundNumber}_bye_${byeRecipientId.slice(0, 6)}`,
      player1Id: byeRecipientId,
      player2Id: null,
      isBye: true,
      winnerId: byeRecipientId,
      completedAt: Date.now(),
    });
  }

  const allDone = matchups.every(m => m.isBye || m.winnerId !== undefined);
  return { roundNumber, matchups, isComplete: allDone };
}

// ── Standings calculation ─────────────────────

export function computeStandings(room: DraftRoom): StandingsEntry[] {
  const { players } = room;
  type EffectiveFormat = Exclude<FormatId, 'suggested'>;
  const effectiveFormat: EffectiveFormat =
    room.format === 'suggested' ? getSuggestedFormat(players.length) : (room.format as EffectiveFormat);

  const base: StandingsEntry[] = players.map(p => ({
    playerId: p.id,
    playerName: p.name,
    rank: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    matchPoints: 0,
    opponentMatchWinPct: 0,
    totalFinalLife: 0,
    isEliminated: false,
  }));

  if (effectiveFormat === 'round_robin' ||
      (effectiveFormat === 'two_phase' && room.phase !== 2)) {
    // RR standings: sum all results in rrResults (works for both single-game and multi-game keys)
    const results = room.rrResults || {};
    Object.values(results).forEach((r: RRResult) => {
      const winner = base.find(e => e.playerId === r.winnerId);
      const loser  = base.find(e => e.playerId === r.loserId);
      if (winner) { winner.wins++; winner.matchPoints += 3; winner.totalFinalLife += r.winnerFinalLife; }
      if (loser)  { loser.losses++; }
    });
  } else if (effectiveFormat === 'mtga') {
    (room.mtgaRecords || []).forEach(rec => {
      const entry = base.find(e => e.playerId === rec.playerId);
      if (entry) {
        entry.wins = rec.wins;
        entry.losses = rec.losses;
        entry.matchPoints = rec.wins * 3;
        entry.isEliminated = !rec.active; // active=false means 3 losses
      }
    });
  } else if (effectiveFormat === 'commander' && room.commanderPods) {
    const completedPods = room.commanderPods.filter((p: CommanderPod) => !!p.results);
    if (completedPods.length > 0) {
      // For each player keep the record from their highest completed round.
      const playerRecord: Record<string, { round: number; placement: number }> = {};
      completedPods.forEach((pod: CommanderPod) => {
        pod.results!.forEach(r => {
          const existing = playerRecord[r.playerId];
          if (!existing || pod.round > existing.round) {
            playerRecord[r.playerId] = { round: pod.round, placement: r.placement };
          }
        });
      });
      base.forEach(entry => {
        const rec = playerRecord[entry.playerId];
        if (rec?.placement === 1) { entry.wins = 1; entry.matchPoints = 3; }
      });
      base.sort((a, b) => {
        const ar = playerRecord[a.playerId];
        const br = playerRecord[b.playerId];
        if (!ar && !br) return a.playerName.localeCompare(b.playerName);
        if (!ar) return 1;
        if (!br) return -1;
        if (ar.round !== br.round) return br.round - ar.round; // higher round = better
        if (ar.placement !== br.placement) return ar.placement - br.placement; // 1st beats 2nd
        return a.playerName.localeCompare(b.playerName);
      });
    } else {
      base.sort((a, b) => a.playerName.localeCompare(b.playerName));
    }
    base.forEach((e, i) => { e.rank = i + 1; });
    return base;
  } else if (room.bracket) {
    // Bracket-based (single_elim, double_elim, seeded, two_phase phase 2)
    room.bracket.forEach(match => {
      if (!match.result?.winnerId || match.isBye) return;
      const winner = base.find(e => e.playerId === match.result!.winnerId);
      const loser  = base.find(e => e.playerId === match.result!.loserId);
      if (winner) {
        winner.wins++;
        winner.matchPoints += 3;
        winner.totalFinalLife += match.result!.winnerFinalLife;
      }
      if (loser) {
        loser.losses++;
        loser.isEliminated = effectiveFormat !== 'double_elim';
      }
    });

    // Rank by which round each player was eliminated in.
    // Champion (never eliminated) gets Infinity → always rank 1.
    // Player who lost in the final (highest round) → rank 2, etc.
    const elimRound: Record<string, number> = {};
    room.bracket.forEach(match => {
      if (match.result?.loserId && !match.isBye)
        elimRound[match.result.loserId] = match.round;
    });
    base.sort((a, b) => {
      const ar = elimRound[a.playerId] ?? Infinity;
      const br = elimRound[b.playerId] ?? Infinity;
      if (ar !== br) return br - ar; // higher elimination round = better rank
      return b.wins - a.wins || a.playerName.localeCompare(b.playerName);
    });
    base.forEach((e, i) => { e.rank = i + 1; });
    return base; // early return — bracket formats skip the generic sort below
  }

  // Sort (RR / MTGA): match points desc → life desc → name asc
  const sorted = base.sort((a, b) =>
    b.matchPoints - a.matchPoints ||
    b.totalFinalLife - a.totalFinalLife ||
    a.playerName.localeCompare(b.playerName)
  );

  sorted.forEach((e, i) => { e.rank = i + 1; });
  return sorted;
}

// ── Advance winner in bracket ─────────────────

export function advanceWinner(
  matches: BracketMatch[],
  matchId: string,
  winnerId: string,
  loserId: string,
  winnerLife: number,
  loserLife: number,
): BracketMatch[] {
  const updated = matches.map(m => ({ ...m, result: m.result ? { ...m.result } : undefined }));

  const matchIdx = updated.findIndex(m => m.id === matchId);
  if (matchIdx < 0) return updated;

  const match = updated[matchIdx];
  match.result = {
    winnerId,
    loserId,
    winnerFinalLife: winnerLife,
    loserFinalLife: loserLife,
    completedAt: Date.now(),
  };

  // Find next match for winner
  if (match.bracket === 'winners') {
    const nextRound = match.round + 1;
    const nextMatchIdx = Math.floor(match.matchIndex / 2);
    const next = updated.find(m => m.bracket === 'winners' && m.round === nextRound && m.matchIndex === nextMatchIdx);
    if (next) {
      if (match.matchIndex % 2 === 0) next.player1Id = winnerId;
      else next.player2Id = winnerId;
    }
  }

  return updated;
}

// ── Seating chart ─────────────────────────────

export function generateSeating(players: Player[]) {
  return {
    seats: shuffle(players.map(p => p.id)),
    generatedAt: Date.now(),
  };
}
