// ─────────────────────────────────────────────
// MTG Draft Forge — App Context & State
// Manages rooms, active room, persistence
// ─────────────────────────────────────────────
import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DraftRoom, Player, MatchResult, RRResult, AppNotification, MTGARound, MTGColor, TournamentHistoryEntry, CommanderPod, CommanderPodResult } from '../utils/types';
import { FormatId } from '../theme';
import {
  generateSingleElimBracket,
  generateDoubleElimBracket,
  generateRoundRobinSchedule,
  generateSeededBracketFromStandings,
  computeStandings,
  initMTGARecords,
  generateMTGARound,
  advanceWinner,
  generateSeating,
  generateInviteCode,
  getRRKey,
  shuffle,
} from '../utils/tournament';
import { getSuggestedFormat } from '../theme';
import { syncRoomToFirestore, subscribeToRoom, findRoomByCode, signInAnonymously } from './firebase';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

// ── History builder ───────────────────────────
// ── Commander pod helpers ─────────────────────────────────────────────────────

/**
 * Distribute players into pods of 3 or 4.
 * Prefer pods of 3; use pods of 4 only when needed to avoid remainders.
 *   n % 3 === 0 → all pods of 3
 *   n % 3 === 1 → one pod of 4, rest pods of 3
 *   n % 3 === 2 → two pods of 4, rest pods of 3
 */
function generateCommanderPods(players: Player[], round: number): CommanderPod[] {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const n = shuffled.length;

  let numThrees: number;
  let numFours: number;
  const rem = n % 3;
  if (rem === 0) {
    numThrees = n / 3; numFours = 0;
  } else if (rem === 1 && n >= 4) {
    numFours = 1; numThrees = (n - 4) / 3;
  } else if (rem === 2 && n >= 8) {
    numFours = 2; numThrees = (n - 8) / 3;
  } else {
    // Fallback for very small or awkward counts: one pod with everyone
    numThrees = 0; numFours = 0;
  }

  const pods: CommanderPod[] = [];
  let idx = 0;
  for (let i = 0; i < numThrees; i++) {
    pods.push({ id: uuidv4(), round, podIndex: pods.length, playerIds: shuffled.slice(idx, idx + 3).map(p => p.id) });
    idx += 3;
  }
  for (let i = 0; i < numFours; i++) {
    pods.push({ id: uuidv4(), round, podIndex: pods.length, playerIds: shuffled.slice(idx, idx + 4).map(p => p.id) });
    idx += 4;
  }
  if (pods.length === 0 && shuffled.length > 0) {
    pods.push({ id: uuidv4(), round, podIndex: 0, playerIds: shuffled.map(p => p.id) });
  }
  return pods;
}

/**
 * Collect players who advance after a round completes.
 * Always top-2 from every pod, regardless of pod size.
 * The single-pod case (grand final) is handled upstream — that pod's
 * 1st-place finisher is declared champion and no advancement runs.
 */
function getCommanderAdvancingPlayers(pods: CommanderPod[]): string[] {
  const advancing: string[] = [];
  for (const pod of pods) {
    if (!pod.results) continue;
    const sorted = [...pod.results].sort((a, b) => a.placement - b.placement);
    sorted.slice(0, 2).forEach(r => advancing.push(r.playerId));
  }
  return advancing;
}

// ─────────────────────────────────────────────────────────────────────────────

function buildHistoryEntry(room: DraftRoom): TournamentHistoryEntry {
  const standings = computeStandings(room);

  // For two_phase tournaments, computeStandings only sees the phase 2 bracket.
  // Add phase 1 (RR) wins and losses so the combined record is shown in history.
  if (room.format === 'two_phase' && room.rrResults) {
    const rrWins: Record<string, number> = {};
    const rrLosses: Record<string, number> = {};
    Object.values(room.rrResults).forEach(r => {
      rrWins[r.winnerId] = (rrWins[r.winnerId] ?? 0) + 1;
      rrLosses[r.loserId] = (rrLosses[r.loserId] ?? 0) + 1;
    });
    standings.forEach(s => {
      s.wins += rrWins[s.playerId] ?? 0;
      s.losses += rrLosses[s.playerId] ?? 0;
    });
  }

  return {
    id: uuidv4(),
    roomId: room.id,
    roomName: room.name,
    format: room.format,
    completedAt: Date.now(),
    playerCount: room.players.length,
    standings: standings.map(s => {
      const player = room.players.find(p => p.id === s.playerId);
      return {
        playerId: s.playerId,
        playerName: s.playerName,
        rank: s.rank,
        wins: s.wins,
        losses: s.losses,
        deckName: player?.deckName,
        deckColors: player?.deckColors,
      };
    }),
  };
}

// ── State shape ───────────────────────────────
export interface PendingMatchupConfig {
  playerNames: [string, string];
  startingLife: number;
}

interface AppState {
  rooms: DraftRoom[];
  activeRoomId: string | null;
  currentUserId: string;
  currentUserName: string;
  notifications: AppNotification[];
  hasHydrated: boolean;
  profileEmoji: string;
  avatarUrl: string;
  tournamentHistory: TournamentHistoryEntry[];
  pendingMatchupConfig: PendingMatchupConfig | null;
}

// ── Actions ───────────────────────────────────
type Action =
  | { type: 'HYDRATE'; payload: Partial<AppState> }
  | { type: 'SET_USER'; userId: string; name: string }
  | { type: 'CREATE_ROOM'; room: DraftRoom }
  | { type: 'JOIN_ROOM'; roomId: string; player: Player; remoteRoom?: DraftRoom }
  | { type: 'SET_ACTIVE_ROOM'; roomId: string | null }
  | { type: 'DELETE_ROOM'; roomId: string }
  | { type: 'DELETE_ALL_ROOMS' }
  | { type: 'UPDATE_ROOM'; room: DraftRoom }
  | { type: 'START_TOURNAMENT'; roomId: string }
  | { type: 'LOG_ELIM_RESULT'; roomId: string; matchId: string; winnerId: string; loserId: string; winnerLife: number; loserLife: number }
  | { type: 'LOG_RR_RESULT'; roomId: string; result: RRResult }
  | { type: 'LOG_MTGA_WIN'; roomId: string; playerId: string; result: 'win' | 'loss' }
  | { type: 'RESET_MTGA'; roomId: string; playerId: string }
  | { type: 'LOG_MTGA_MATCHUP_RESULT'; roomId: string; roundNumber: number; matchupId: string; winnerId: string; loserId: string }
  | { type: 'RANDOMIZE_SEATING'; roomId: string }
  | { type: 'ADVANCE_TO_PHASE_2'; roomId: string }
  | { type: 'MARK_NOTIFICATION_READ'; notificationId: string }
  | { type: 'ADD_NOTIFICATION'; notification: AppNotification }
  | { type: 'REVERT_TO_PHASE_1'; roomId: string }
  | { type: 'LOG_COMMANDER_POD_RESULT'; roomId: string; podId: string; results: CommanderPodResult[] }
  | { type: 'SET_DECK_INFO'; roomId: string; playerId: string; deckName: string; deckColors: MTGColor[] }
  | { type: 'SET_PROFILE_EMOJI'; emoji: string }
  | { type: 'SET_AVATAR_URL'; url: string }
  | { type: 'COMPLETE_TOURNAMENT'; roomId: string }
  | { type: 'REOPEN_TOURNAMENT'; roomId: string }
  | { type: 'ADD_BOT'; roomId: string; bot: Player }
  | { type: 'REMOVE_BOT'; roomId: string; botId: string }
  | { type: 'SET_PENDING_MATCHUP_CONFIG'; config: PendingMatchupConfig }
  | { type: 'CLEAR_PENDING_MATCHUP_CONFIG' };

// ── Reducer ───────────────────────────────────
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, ...action.payload, hasHydrated: true };

    case 'SET_USER':
      return { ...state, currentUserId: action.userId, currentUserName: action.name };

    case 'CREATE_ROOM':
      return { ...state, rooms: [...state.rooms, action.room], activeRoomId: action.room.id };

    case 'JOIN_ROOM': {
      // If the room came from Firebase and isn't in local state yet, add it first
      let base = state.rooms;
      if (action.remoteRoom && !base.find(r => r.id === action.roomId)) {
        base = [...base, action.remoteRoom];
      }
      const rooms = base.map(r => {
        if (r.id !== action.roomId) return r;
        if (r.players.find(p => p.id === action.player.id)) return r;
        return { ...r, players: [...r.players, action.player] };
      });
      return { ...state, rooms, activeRoomId: action.roomId };
    }

    case 'SET_ACTIVE_ROOM':
      return { ...state, activeRoomId: action.roomId };

    case 'DELETE_ROOM': {
      const rooms = state.rooms.filter(r => r.id !== action.roomId);
      const activeRoomId = state.activeRoomId === action.roomId ? null : state.activeRoomId;
      return { ...state, rooms, activeRoomId };
    }

    case 'DELETE_ALL_ROOMS':
      return { ...state, rooms: [], activeRoomId: null };

    case 'UPDATE_ROOM': {
      const previousRoom = state.rooms.find(r => r.id === action.room.id);
      const rooms = state.rooms.map(r => r.id === action.room.id ? action.room : r);

      // If the room just transitioned to completed via a remote Firestore update
      // (e.g. another device finished the tournament), add a history entry here
      // so every participant sees it in their profile — not just the device that
      // dispatched COMPLETE_TOURNAMENT / LOG_ELIM_RESULT locally.
      const justCompleted =
        action.room.status === 'completed' &&
        previousRoom?.status !== 'completed';

      if (justCompleted) {
        // Avoid duplicates on double-fire: skip if the most recent history entry
        // for this room was recorded within the last 10 seconds (same completion event).
        const lastEntry = [...state.tournamentHistory]
          .reverse()
          .find(h => h.roomId === action.room.id);
        const recentDupe = lastEntry && (Date.now() - lastEntry.completedAt < 10_000);
        const tournamentHistory = recentDupe
          ? state.tournamentHistory
          : [...state.tournamentHistory, buildHistoryEntry(action.room)];
        return { ...state, rooms, tournamentHistory };
      }

      return { ...state, rooms };
    }

    case 'START_TOURNAMENT': {
      const rooms = state.rooms.map(r => {
        if (r.id !== action.roomId) return r;
        type EFmt = Exclude<FormatId, 'suggested'>;
        const effectiveFormat: EFmt =
          r.format === 'suggested' ? getSuggestedFormat(r.players.length) : (r.format as EFmt);

        let bracket = r.bracket;
        let rrResults = r.rrResults;
        let mtgaRecords = r.mtgaRecords;
        let phase = r.phase;

        if (effectiveFormat === 'single_elim') {
          bracket = generateSingleElimBracket(r.players);
        } else if (effectiveFormat === 'seeded') {
          bracket = generateSingleElimBracket(r.players, true);
        } else if (effectiveFormat === 'double_elim') {
          bracket = generateDoubleElimBracket(r.players);
        } else if (effectiveFormat === 'round_robin') {
          rrResults = {};
          bracket = [];
        } else if (effectiveFormat === 'mtga') {
          mtgaRecords = initMTGARecords(r.players);
          const round1 = generateMTGARound(mtgaRecords, r.players, []);
          // Credit bye wins immediately so mtgaRecords stay accurate
          round1.matchups.forEach(m => {
            if (m.isBye && m.winnerId) {
              const rec = mtgaRecords!.find(r => r.playerId === m.winnerId);
              if (rec) rec.wins += 1;
            }
          });
          return {
            ...r,
            status: 'in_progress' as const,
            bracket: [],
            mtgaRecords,
            mtgaRounds: [round1],
          };
        } else if (effectiveFormat === 'two_phase') {
          rrResults = {};
          bracket = [];
          phase = 1;
        } else if (effectiveFormat === 'commander') {
          const commanderPods = generateCommanderPods(r.players, 1);
          return {
            ...r,
            status: 'in_progress' as const,
            bracket: [],
            commanderPods,
          };
        }

        return { ...r, status: 'in_progress' as const, bracket, rrResults, mtgaRecords, phase };
      });
      return { ...state, rooms };
    }

    case 'ADVANCE_TO_PHASE_2': {
      const rooms = state.rooms.map(r => {
        if (r.id !== action.roomId || r.format !== 'two_phase') return r;
        const standings = computeStandings(r);
        const bracket = generateSeededBracketFromStandings(r.players, standings);
        // Persist seeds onto players so the bracket display reads the correct phase-1 rank
        const players = r.players.map(p => {
          const entry = standings.find(s => s.playerId === p.id);
          return { ...p, seed: entry?.rank ?? r.players.length + 1 };
        });
        return { ...r, phase: 2 as const, bracket, players };
      });
      return { ...state, rooms };
    }

    case 'LOG_ELIM_RESULT': {
      let completedRoom: DraftRoom | null = null;
      const rooms = state.rooms.map(r => {
        if (r.id !== action.roomId || !r.bracket) return r;
        const bracket = advanceWinner(
          r.bracket,
          action.matchId,
          action.winnerId,
          action.loserId,
          action.winnerLife,
          action.loserLife,
        );
        // Tournament complete when no non-bye match still has both players assigned but no result
        const pending = bracket.filter(
          m => !m.isBye && m.player1Id && m.player2Id && !m.result?.winnerId,
        );
        const hasAnyResult = bracket.some(m => !!m.result?.winnerId);
        const justDone = pending.length === 0 && hasAnyResult && r.status !== 'completed';
        const updated: DraftRoom = { ...r, bracket, status: justDone ? 'completed' : r.status };
        if (justDone) completedRoom = updated;
        return updated;
      });
      const tournamentHistory = completedRoom
        ? [...state.tournamentHistory, buildHistoryEntry(completedRoom)]
        : state.tournamentHistory;
      return { ...state, rooms, tournamentHistory };
    }

    case 'LOG_RR_RESULT': {
      let completedRoom: DraftRoom | null = null;
      const rooms = state.rooms.map(r => {
        if (r.id !== action.roomId) return r;
        const key = action.result.gameKey || getRRKey(action.result.player1Id, action.result.player2Id);
        const rrResults = { ...(r.rrResults || {}), [key]: action.result };
        // Auto-complete pure round_robin when every scheduled game is logged
        const effectiveFmt = r.format === 'suggested' ? getSuggestedFormat(r.players.length) : r.format;
        if (effectiveFmt === 'round_robin' && r.status !== 'completed') {
          const n = r.players.length;
          const gamesCount = r.settings.rrGamesCount ?? 1;
          const expectedGames = (n * (n - 1) / 2) * gamesCount;
          if (Object.keys(rrResults).length >= expectedGames) {
            const updated: DraftRoom = { ...r, rrResults, status: 'completed' };
            completedRoom = updated;
            return updated;
          }
        }
        return { ...r, rrResults };
      });
      const tournamentHistory = completedRoom
        ? [...state.tournamentHistory, buildHistoryEntry(completedRoom)]
        : state.tournamentHistory;
      return { ...state, rooms, tournamentHistory };
    }

    case 'LOG_MTGA_WIN': {
      const rooms = state.rooms.map(r => {
        if (r.id !== action.roomId || !r.mtgaRecords) return r;
        const mtgaRecords = r.mtgaRecords.map(rec => {
          if (rec.playerId !== action.playerId) return rec;
          const wins = rec.wins + (action.result === 'win' ? 1 : 0);
          const losses = rec.losses + (action.result === 'loss' ? 1 : 0);
          const active = wins < 7 && losses < 3;
          return { ...rec, wins, losses, active };
        });
        return { ...r, mtgaRecords };
      });
      return { ...state, rooms };
    }

    case 'RESET_MTGA': {
      const rooms = state.rooms.map(r => {
        if (r.id !== action.roomId || !r.mtgaRecords) return r;
        const mtgaRecords = r.mtgaRecords.map(rec =>
          rec.playerId === action.playerId ? { ...rec, wins: 0, losses: 0, active: true } : rec
        );
        return { ...r, mtgaRecords };
      });
      return { ...state, rooms };
    }

    case 'LOG_MTGA_MATCHUP_RESULT': {
      const rooms = state.rooms.map(r => {
        if (r.id !== action.roomId || !r.mtgaRounds || !r.mtgaRecords) return r;

        // Update the matchup in the target round
        let updatedRounds: MTGARound[] = r.mtgaRounds.map(round => {
          if (round.roundNumber !== action.roundNumber) return round;
          const matchups = round.matchups.map(m =>
            m.id === action.matchupId
              ? { ...m, winnerId: action.winnerId, loserId: action.loserId, completedAt: Date.now() }
              : m,
          );
          const isComplete = matchups.every(m => m.isBye || m.winnerId !== undefined);
          return { ...round, matchups, isComplete };
        });

        // Update mtgaRecords: +1 win for winner, +1 loss for loser (eliminate at 3)
        let updatedRecords = r.mtgaRecords.map(rec => {
          if (rec.playerId === action.winnerId) return { ...rec, wins: rec.wins + 1 };
          if (rec.playerId === action.loserId) {
            const losses = rec.losses + 1;
            return { ...rec, losses, active: losses < 3 };
          }
          return rec;
        });

        // Check if the round just completed
        const currentRound = updatedRounds.find(rd => rd.roundNumber === action.roundNumber);
        if (!currentRound?.isComplete) {
          return { ...r, mtgaRounds: updatedRounds, mtgaRecords: updatedRecords };
        }

        // Round complete — check tournament state
        const activePlayers = updatedRecords.filter(rec => rec.active);
        if (activePlayers.length <= 1) {
          // Tournament over — mark completed; history recorded below after map
          return { ...r, mtgaRounds: updatedRounds, mtgaRecords: updatedRecords, status: 'completed' as const };
        }

        // Generate next round
        const nextRound = generateMTGARound(updatedRecords, r.players, updatedRounds);
        // Credit bye wins immediately
        nextRound.matchups.forEach(m => {
          if (m.isBye && m.winnerId) {
            const rec = updatedRecords.find(rec => rec.playerId === m.winnerId);
            if (rec) { rec.wins = rec.wins + 1; }
          }
        });
        updatedRounds = [...updatedRounds, nextRound];

        return { ...r, mtgaRounds: updatedRounds, mtgaRecords: updatedRecords };
      });
      // Record history if MTGA tournament just completed
      const justCompletedMTGA = rooms.find(
        r => r.id === action.roomId && r.status === 'completed' &&
          state.rooms.find(old => old.id === action.roomId)?.status !== 'completed',
      ) ?? null;
      const tournamentHistory = justCompletedMTGA
        ? [...state.tournamentHistory, buildHistoryEntry(justCompletedMTGA)]
        : state.tournamentHistory;
      return { ...state, rooms, tournamentHistory };
    }

    case 'RANDOMIZE_SEATING': {
      const rooms = state.rooms.map(r => {
        if (r.id !== action.roomId) return r;
        return { ...r, seating: generateSeating(r.players) };
      });
      return { ...state, rooms };
    }

    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [action.notification, ...state.notifications].slice(0, 50) };

    case 'MARK_NOTIFICATION_READ': {
      const notifications = state.notifications.map(n =>
        n.id === action.notificationId ? { ...n, read: true } : n
      );
      return { ...state, notifications };
    }

    case 'LOG_COMMANDER_POD_RESULT': {
      let completedRoom: DraftRoom | null = null;
      const rooms = state.rooms.map(r => {
        if (r.id !== action.roomId || !r.commanderPods) return r;

        // Save results for this pod
        const updatedPods = r.commanderPods.map(pod =>
          pod.id === action.podId ? { ...pod, results: action.results } : pod,
        );

        // Find which round this pod belongs to
        const podRound = r.commanderPods.find(p => p.id === action.podId)?.round ?? 1;
        const podsInRound = updatedPods.filter(p => p.round === podRound);
        const allPodsComplete = podsInRound.every(p => !!p.results);

        if (!allPodsComplete) {
          return { ...r, commanderPods: updatedPods };
        }

        // If this was the only pod in the round (the final), the 1st-place
        // finisher wins — no further advancement needed.
        if (podsInRound.length === 1) {
          const completed = { ...r, commanderPods: updatedPods, status: 'completed' as const };
          completedRoom = completed;
          return completed;
        }

        // Multiple pods in this round — gather advancing players
        const advancingIds = getCommanderAdvancingPlayers(podsInRound);

        if (advancingIds.length <= 1) {
          // ≤1 player left → tournament over
          const completed = { ...r, commanderPods: updatedPods, status: 'completed' as const };
          completedRoom = completed;
          return completed;
        }

        if (advancingIds.length <= 4) {
          // Exactly enough for one final pod
          const advancingPlayers = r.players.filter(p => advancingIds.includes(p.id));
          const finalPods = generateCommanderPods(advancingPlayers, podRound + 1);
          return { ...r, commanderPods: [...updatedPods, ...finalPods] };
        }

        // Multiple pods next round
        const advancingPlayers = r.players.filter(p => advancingIds.includes(p.id));
        const nextRoundPods = generateCommanderPods(advancingPlayers, podRound + 1);
        return { ...r, commanderPods: [...updatedPods, ...nextRoundPods] };
      });

      const tournamentHistory = completedRoom
        ? [...state.tournamentHistory, buildHistoryEntry(completedRoom)]
        : state.tournamentHistory;
      return { ...state, rooms, tournamentHistory };
    }

    case 'REVERT_TO_PHASE_1': {
      const rooms = state.rooms.map(r => {
        if (r.id !== action.roomId || r.format !== 'two_phase') return r;
        return { ...r, phase: 1 as const, bracket: [] };
      });
      return { ...state, rooms };
    }

    case 'SET_DECK_INFO': {
      const rooms = state.rooms.map(r => {
        if (r.id !== action.roomId) return r;
        const players = r.players.map(p =>
          p.id === action.playerId
            ? { ...p, deckName: action.deckName, deckColors: action.deckColors }
            : p
        );
        return { ...r, players };
      });
      return { ...state, rooms };
    }

    case 'SET_PROFILE_EMOJI':
      return { ...state, profileEmoji: action.emoji };

    case 'SET_AVATAR_URL': {
      // Update avatarUrl in state AND sync it into all existing room player records
      const rooms = state.rooms.map(r => ({
        ...r,
        players: r.players.map(p =>
          p.id === state.currentUserId ? { ...p, avatarUrl: action.url } : p
        ),
      }));
      return { ...state, avatarUrl: action.url, rooms };
    }

    case 'COMPLETE_TOURNAMENT': {
      const room = state.rooms.find(r => r.id === action.roomId);
      if (!room || room.status === 'completed') return state;
      const completed: DraftRoom = { ...room, status: 'completed' };
      const rooms = state.rooms.map(r => r.id === action.roomId ? completed : r);
      const tournamentHistory = [...state.tournamentHistory, buildHistoryEntry(completed)];
      return { ...state, rooms, tournamentHistory };
    }

    case 'REOPEN_TOURNAMENT': {
      const rooms = state.rooms.map(r =>
        r.id === action.roomId && r.status === 'completed'
          ? { ...r, status: 'in_progress' as const }
          : r
      );
      // Remove the most recent history entry for this room (it's no longer final)
      const lastIdx = [...state.tournamentHistory]
        .map((h, i) => ({ h, i }))
        .filter(({ h }) => h.roomId === action.roomId)
        .pop()?.i ?? -1;
      const tournamentHistory = lastIdx >= 0
        ? state.tournamentHistory.filter((_, i) => i !== lastIdx)
        : state.tournamentHistory;
      return { ...state, rooms, tournamentHistory };
    }

    case 'ADD_BOT': {
      const rooms = state.rooms.map(r => {
        if (r.id !== action.roomId) return r;
        if (r.status !== 'waiting') return r;
        if (r.players.length >= r.maxPlayers) return r;
        return { ...r, players: [...r.players, action.bot] };
      });
      return { ...state, rooms };
    }

    case 'REMOVE_BOT': {
      const rooms = state.rooms.map(r => {
        if (r.id !== action.roomId) return r;
        if (r.status !== 'waiting') return r;
        return { ...r, players: r.players.filter(p => p.id !== action.botId) };
      });
      return { ...state, rooms };
    }

    case 'SET_PENDING_MATCHUP_CONFIG':
      return { ...state, pendingMatchupConfig: action.config };

    case 'CLEAR_PENDING_MATCHUP_CONFIG':
      return { ...state, pendingMatchupConfig: null };

    default:
      return state;
  }
}

// ── Initial state ─────────────────────────────
const initialState: AppState = {
  rooms: [],
  activeRoomId: null,
  currentUserId: uuidv4(),
  currentUserName: '',
  notifications: [],
  hasHydrated: false,
  profileEmoji: '🧙',
  avatarUrl: '',
  tournamentHistory: [],
  pendingMatchupConfig: null,
};

// ── Context ───────────────────────────────────
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  activeRoom: DraftRoom | null;

  // Convenience actions
  createRoom: (name: string, format: FormatId, maxPlayers: number, rrGamesCount?: number, phase1Mode?: 'round_robin' | 'fixed_games') => DraftRoom;
  joinRoomByCode: (code: string) => Promise<{ status: 'ok'; roomId: string } | { status: 'not_found' | 'full' | 'already_joined' }>;
  setUserName: (name: string) => void;
  setProfileEmoji: (emoji: string) => void;
  setAvatarUrl: (url: string) => void;
  addBot: (roomId: string) => void;
  removeBot: (roomId: string, botId: string) => void;
  renameBot: (roomId: string, botId: string, name: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// ── Provider ──────────────────────────────────
const STORAGE_KEY = '@mtgdraftforge_state_v2';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Ref that prevents the sync-to-Firestore effect from re-uploading data
  // we just downloaded from Firestore (breaks the update loop).
  const skipSyncRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sign in anonymously with Firebase Auth on mount ──
  // This must happen before any Firestore read/write so that
  // security rules (which require request.auth != null) pass.
  // The anonymous UID is stable per device install — it is NOT
  // used as the in-app player ID; that continues to be the UUID
  // stored in AsyncStorage for backward compatibility.
  useEffect(() => {
    signInAnonymously().catch(err =>
      console.warn('[Firebase] anonymous sign-in failed:', err),
    );
  }, []);

  // ── Hydrate from AsyncStorage on mount ────────
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          dispatch({ type: 'HYDRATE', payload: saved });
        } catch {
          dispatch({ type: 'HYDRATE', payload: {} });
        }
      } else {
        dispatch({ type: 'HYDRATE', payload: {} });
      }
    });
  }, []);

  // ── Persist to AsyncStorage on every state change ──
  useEffect(() => {
    if (!state.hasHydrated) return;
    const toSave = {
      rooms: state.rooms,
      activeRoomId: state.activeRoomId,
      currentUserId: state.currentUserId,
      currentUserName: state.currentUserName,
      notifications: state.notifications,
      profileEmoji: state.profileEmoji,
      avatarUrl: state.avatarUrl,
      tournamentHistory: state.tournamentHistory,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }, [state]);

  // ── Sync rooms to Firestore whenever they change ──
  // Only syncs rooms the current user is a participant in.
  // Skips one cycle after a Firestore update to avoid echo loops.
  useEffect(() => {
    if (!state.hasHydrated) return;
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      const myRooms = state.rooms.filter(r =>
        r.players.some(p => p.id === state.currentUserId),
      );
      myRooms.forEach(room => syncRoomToFirestore(room));
    }, 500);
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.rooms, state.hasHydrated]);

  // ── Subscribe to live Firestore updates for the active room ──
  // When another device changes the room (new player, match result, etc.)
  // we receive it here and update local state.
  useEffect(() => {
    if (!state.activeRoomId || !state.hasHydrated) return;
    const unsub = subscribeToRoom(
      state.activeRoomId,
      (remoteRoom) => {
        skipSyncRef.current = true; // don't echo this back to Firestore
        dispatch({ type: 'UPDATE_ROOM', room: remoteRoom });
      },
      () => {
        // Room was deleted on another device — remove it locally and deactivate
        dispatch({ type: 'DELETE_ROOM', roomId: state.activeRoomId! });
      },
    );
    return unsub;
  }, [state.activeRoomId, state.hasHydrated]);

  const activeRoom = state.rooms.find(r => r.id === state.activeRoomId) ?? null;

  const createRoom = useCallback((name: string, format: FormatId, maxPlayers: number, rrGamesCount?: number, phase1Mode?: 'round_robin' | 'fixed_games'): DraftRoom => {
    const player: Player = {
      id: state.currentUserId,
      name: state.currentUserName || 'Host',
      joinedAt: Date.now(),
      avatarUrl: state.avatarUrl || undefined,
    };
    const room: DraftRoom = {
      id: uuidv4(),
      inviteCode: generateInviteCode(),
      name,
      ownerId: state.currentUserId,
      format,
      maxPlayers,
      status: 'waiting',
      players: [player],
      createdAt: Date.now(),
      bracket: [],
      rrResults: {},
      mtgaRecords: [],
      settings: {
        startingLife: 20,
        allowSpectators: true,
        requireConfirmation: false,
        tiebreakerByLife: true,
        rrGamesCount: rrGamesCount ?? 1,
        phase1Mode: phase1Mode ?? 'round_robin',
      },
    };
    dispatch({ type: 'CREATE_ROOM', room });
    return room;
  }, [state.currentUserId, state.currentUserName]);

  const joinRoomByCode = useCallback(async (
    code: string,
  ): Promise<{ status: 'ok'; roomId: string } | { status: 'not_found' | 'full' | 'already_joined' }> => {
    const trimmed = code.trim().toUpperCase();

    // 1. Check local rooms first (fast path — same device or already synced)
    let room = state.rooms.find(r => r.inviteCode === trimmed);

    // 2. Not found locally → query Firebase
    if (!room) {
      const remote = await findRoomByCode(trimmed);
      if (!remote) return { status: 'not_found' };
      room = remote;
    }

    if (room.players.length >= room.maxPlayers) return { status: 'full' };
    if (room.players.find(p => p.id === state.currentUserId)) return { status: 'already_joined' };

    const player: Player = {
      id: state.currentUserId,
      name: state.currentUserName || 'Player',
      joinedAt: Date.now(),
      avatarUrl: state.avatarUrl || undefined,
    };

    // Dispatch locally (remoteRoom ensures it's added if not already in local state)
    dispatch({ type: 'JOIN_ROOM', roomId: room.id, player, remoteRoom: room });

    // Immediately sync the updated room (with our player) back to Firestore
    // so the host and other devices see us right away.
    syncRoomToFirestore({ ...room, players: [...room.players, player] });

    return { status: 'ok', roomId: room.id };
  }, [state.rooms, state.currentUserId, state.currentUserName, state.avatarUrl]);

  const setUserName = useCallback((name: string) => {
    dispatch({ type: 'SET_USER', userId: state.currentUserId, name });
  }, [state.currentUserId]);

  const setProfileEmoji = useCallback((emoji: string) => {
    dispatch({ type: 'SET_PROFILE_EMOJI', emoji });
  }, []);

  const setAvatarUrl = useCallback((url: string) => {
    dispatch({ type: 'SET_AVATAR_URL', url });
  }, []);

  // ── Bot helpers ───────────────────────────────
  const BOT_NAMES = [
    'Jace', 'Liliana', 'Chandra', 'Garruk', 'Ajani',
    'Nissa', 'Sorin', 'Gideon', 'Teferi', 'Karn',
    'Elspeth', 'Tamiyo', 'Venser', 'Nahiri', 'Ugin',
  ];

  const addBot = useCallback((roomId: string) => {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room || room.status !== 'waiting' || room.players.length >= room.maxPlayers) return;
    // Pick a name not already used in this room
    const usedNames = new Set(room.players.map(p => p.name.replace('Bot ', '')));
    const available = BOT_NAMES.filter(n => !usedNames.has(n));
    const name = available.length > 0
      ? `Bot ${available[0]}`
      : `Bot ${room.players.length + 1}`;
    const bot: Player = {
      id: `bot-${uuidv4()}`,
      name,
      joinedAt: Date.now(),
      isBot: true,
    };
    dispatch({ type: 'ADD_BOT', roomId, bot });
    // Immediately sync so the bot is in Firestore before the subscription
    // can fire with the old room and overwrite local state.
    syncRoomToFirestore({ ...room, players: [...room.players, bot] });
  }, [state.rooms]);

  const removeBot = useCallback((roomId: string, botId: string) => {
    const room = state.rooms.find(r => r.id === roomId);
    dispatch({ type: 'REMOVE_BOT', roomId, botId });
    if (room) {
      syncRoomToFirestore({ ...room, players: room.players.filter(p => p.id !== botId) });
    }
  }, [state.rooms]);

  const renameBot = useCallback((roomId: string, botId: string, name: string) => {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return;
    const updatedPlayers = room.players.map(p => p.id === botId ? { ...p, name } : p);
    dispatch({ type: 'UPDATE_ROOM', room: { ...room, players: updatedPlayers } });
    syncRoomToFirestore({ ...room, players: updatedPlayers });
  }, [state.rooms]);

  return (
    <AppContext.Provider value={{ state, dispatch, activeRoom, createRoom, joinRoomByCode, setUserName, setProfileEmoji, setAvatarUrl, addBot, removeBot, renameBot }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
