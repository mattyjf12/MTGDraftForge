// ─────────────────────────────────────────────
// MTG Draft Forge — Core Data Types
// ─────────────────────────────────────────────

import { FormatId } from '../theme';

// ── MTG Colors ────────────────────────────────
export type MTGColor = 'W' | 'U' | 'B' | 'R' | 'G';

// ── Player ────────────────────────────────────
export interface Player {
  id: string;
  name: string;
  seed?: number;          // Used for seeded elimination format
  joinedAt: number;       // Unix timestamp
  deckName?: string;
  deckColors?: MTGColor[];
  avatarUrl?: string;     // URL to player's profile image
  isBot?: boolean;        // True for CPU/filler bots added by the host
}

// ── Match result ──────────────────────────────
export interface MatchResult {
  winnerId: string;
  loserId: string;
  winnerFinalLife: number;
  loserFinalLife: number;
  completedAt: number;
}

// ── Bracket match ─────────────────────────────
export interface BracketMatch {
  id: string;
  round: number;
  matchIndex: number;     // Position within the round
  bracket: 'winners' | 'losers' | 'grand_final';
  player1Id: string | null;
  player2Id: string | null;
  result?: MatchResult;
  isBye: boolean;
}

// ── Round Robin result key: "p1id|p2id" (sorted), or "p1id|p2id|N" for multi-game ──
export type RRResultKey = string;
export interface RRResult {
  player1Id: string;
  player2Id: string;
  winnerId: string;
  loserId: string;
  winnerFinalLife: number;
  completedAt: number;
  gameKey?: string;   // Unique key for this game instance (multi-game two_phase support)
}

// ── MTGA player record ────────────────────────
export interface MTGARecord {
  playerId: string;
  wins: number;
  losses: number;
  active: boolean;        // false = eliminated (3 losses)
}

// ── MTGA Swiss matchup ────────────────────────
export interface MTGAMatchup {
  id: string;
  player1Id: string;
  player2Id: string | null; // null = bye
  isBye: boolean;
  winnerId?: string;
  loserId?: string;
  completedAt?: number;
}

// ── MTGA Swiss round ──────────────────────────
export interface MTGARound {
  roundNumber: number;    // 1-based
  matchups: MTGAMatchup[];
  isComplete: boolean;
}

// ── Commander pods ────────────────────────────

export interface CommanderPodResult {
  playerId: string;
  placement: number;            // 1 = winner, 2 = runner-up, 3/4 = eliminated
  finalLife: number;
  eliminatedBy?: string;        // playerId whose commander dealt the killing 21 damage
  commanderDamageDealt?: Record<string, number>;
}

export interface CommanderPod {
  id: string;
  round: number;
  podIndex: number;             // 0-based position within the round
  playerIds: string[];          // 3 or 4 player IDs
  results?: CommanderPodResult[];
}

// ── Seating ───────────────────────────────────
export interface SeatingChart {
  seats: string[];        // Array of player IDs in seat order
  generatedAt: number;
}

// ── Tournament room ───────────────────────────
export type RoomStatus = 'waiting' | 'drafting' | 'in_progress' | 'completed';

export interface DraftRoom {
  id: string;
  inviteCode: string;     // 6-char uppercase code for sharing
  name: string;
  ownerId: string;        // Player ID of room creator
  format: FormatId;
  maxPlayers: number;
  status: RoomStatus;
  players: Player[];
  createdAt: number;

  // Two-phase tournament state
  phase?: 1 | 2;              // two_phase only: 1 = RR phase, 2 = Elim phase

  // Format-specific data (only one will be populated)
  bracket?: BracketMatch[];          // Single / Double / Seeded elim
  rrResults?: Record<RRResultKey, RRResult>;  // Round Robin / Two-Phase RR
  mtgaRecords?: MTGARecord[];        // MTGA Style — per-player W/L
  mtgaRounds?: MTGARound[];          // MTGA Style — per-round Swiss pairings

  // Commander pods (commander format only)
  commanderPods?: CommanderPod[];

  // Seating
  seating?: SeatingChart;

  // Settings (owner can change before start)
  settings: RoomSettings;
}

export interface RoomSettings {
  startingLife: number;         // Default 20
  allowSpectators: boolean;
  requireConfirmation: boolean; // Opponent must confirm result
  tiebreakerByLife: boolean;
  // Two-Phase phase 1 seeding options:
  phase1Mode?: 'round_robin' | 'fixed_games'; // default 'round_robin'
  rrGamesCount?: number; // round_robin: full-RR cycles; fixed_games: games per player (rounds)
}

// ── Life counter ──────────────────────────────
export interface LifePlayer {
  id: string;
  name: string;
  life: number;
  startingLife: number;
  color: string;          // UI accent color for this player's card
  commanderDamage?: Record<string, number>; // keyed by opponent player ID
  poisonCounters: number;
  energyCounters: number;
  isEliminated: boolean;
}

// ── Dice roll history ─────────────────────────
export interface DiceRoll {
  id: string;
  dieType: number;        // 4, 6, 8, 10, 12, 20, 100
  count: number;
  results: number[];
  total: number;
  timestamp: number;
}

// ── Standings entry ───────────────────────────
export interface StandingsEntry {
  playerId: string;
  playerName: string;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number;    // 3 per win, 1 per draw
  opponentMatchWinPct: number;
  totalFinalLife: number; // Tiebreaker
  isEliminated: boolean;
}

// ── Tournament history snapshot ───────────────
export interface TournamentHistoryEntry {
  id: string;
  roomId: string;
  roomName: string;
  format: string;
  completedAt: number;
  playerCount: number;
  standings: Array<{
    playerId: string;
    playerName: string;
    rank: number;
    wins: number;
    losses: number;
    deckName?: string;
    deckColors?: MTGColor[];
  }>;
}

// ── Notification ──────────────────────────────
export interface AppNotification {
  id: string;
  type: 'match_ready' | 'result_logged' | 'player_joined' | 'tournament_started' | 'tournament_ended';
  message: string;
  roomId?: string;
  timestamp: number;
  read: boolean;
}
