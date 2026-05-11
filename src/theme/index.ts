// MTG Draft Forge — Design Theme
// Aesthetic: Dark arcane grimoire. Deep navy-black backgrounds, aged parchment text,
// gold accents inspired by card borders. Feels like a magical tournament ledger.

export const Colors = {
  // Backgrounds
  bgDeep:     '#08080f',   // Page background — near-black with blue tint
  bgCard:     '#10101a',   // Card surfaces
  bgSurface:  '#181824',   // Elevated surfaces / input backgrounds
  bgHover:    '#1e1e2e',   // Pressed / hover states
  bgOverlay:  'rgba(0,0,0,0.72)',

  // Borders
  border:      '#252436',
  borderGold:  '#3d3318',
  borderLight: '#302e45',

  // Text
  text:       '#e8e2d5',   // Warm off-white — aged parchment
  textMuted:  '#7a7390',
  textFaint:  '#3e3a52',
  textGold:   '#c9a84c',

  // Gold ramp — primary brand color
  gold:       '#c9a84c',
  goldLight:  '#f0d080',
  goldDark:   '#8a6a20',
  goldGlow:   'rgba(201,168,76,0.18)',

  // Semantic
  green:      '#27ae60',
  greenLight: '#4eca7f',
  greenGlow:  'rgba(39,174,96,0.15)',
  red:        '#c0392b',
  redLight:   '#e06c5a',
  redGlow:    'rgba(192,57,43,0.15)',
  blue:       '#2980b9',
  blueLight:  '#5aade0',
  blueGlow:   'rgba(41,128,185,0.15)',
  purple:     '#6c3483',
  purpleLight:'#a569bd',
  amber:      '#e67e22',

  // Format colors
  formatSingle:     '#2980b9',
  formatDouble:     '#8e44ad',
  formatRobin:      '#27ae60',
  formatSeeded:     '#c9a84c',
  formatMTGA:       '#e67e22',
  formatCommander:  '#c0392b',
  formatSuggest:    '#7f8c8d',
  formatTwoPhase:   '#16a085',
};

export const Typography = {
  // Display — large hero numbers (life totals, scores)
  displayXL: { fontFamily: 'Georgia', fontSize: 80, fontWeight: '400' as const, color: Colors.textGold },
  displayLG: { fontFamily: 'Georgia', fontSize: 48, fontWeight: '400' as const, color: Colors.text },
  displayMD: { fontFamily: 'Georgia', fontSize: 32, fontWeight: '400' as const, color: Colors.text },

  // Headings
  h1: { fontFamily: 'Georgia', fontSize: 22, fontWeight: '400' as const, color: Colors.text },
  h2: { fontFamily: 'Georgia', fontSize: 18, fontWeight: '400' as const, color: Colors.textGold },
  h3: { fontFamily: 'Georgia', fontSize: 15, fontWeight: '400' as const, color: Colors.text },

  // Body
  body:   { fontFamily: 'System', fontSize: 14, color: Colors.text },
  bodyMD: { fontFamily: 'System', fontSize: 13, color: Colors.text },
  bodySM: { fontFamily: 'System', fontSize: 12, color: Colors.textMuted },

  // Labels / caps
  label:   { fontFamily: 'System', fontSize: 11, color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  labelGold: { fontFamily: 'System', fontSize: 10, color: Colors.gold, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  labelSM: { fontFamily: 'System', fontSize: 10, color: Colors.textMuted, letterSpacing: 1.0, textTransform: 'uppercase' as const },

  // Code / numeric
  mono: { fontFamily: 'Courier', fontSize: 13 },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const Radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
};

export const Shadow = {
  gold: {
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
};

// Format metadata
export const FORMATS = [
  {
    id: 'single_elim',
    name: 'Single Elimination',
    shortName: 'Single Elim',
    desc: 'One loss and you\'re out. Fast-paced.',
    color: Colors.formatSingle,
    icon: '⚔️',
    minPlayers: 2,
    maxPlayers: 32,
  },
  {
    id: 'double_elim',
    name: 'Double Elimination',
    shortName: 'Double Elim',
    desc: 'Two losses to be eliminated. Winners & losers brackets.',
    color: Colors.formatDouble,
    icon: '🛡️',
    minPlayers: 4,
    maxPlayers: 16,
  },
  {
    id: 'round_robin',
    name: 'Round Robin',
    shortName: 'Round Robin',
    desc: 'Everyone plays each other. Most wins takes it.',
    color: Colors.formatRobin,
    icon: '🔄',
    minPlayers: 3,
    maxPlayers: 12,
  },
  {
    id: 'seeded',
    name: 'Seeded Single Elimination',
    shortName: 'Seeded Elim',
    desc: 'Players ranked before bracket draw. Top seeds protected.',
    color: Colors.formatSeeded,
    icon: '🌱',
    minPlayers: 4,
    maxPlayers: 16,
  },
  {
    id: 'mtga',
    name: 'MTGA Style',
    shortName: 'MTGA',
    desc: 'Swiss-style: reach 7 wins before 3 losses. Each round pairs similarly-rated opponents — no elimination bracket needed.',
    color: Colors.formatMTGA,
    icon: '🃏',
    minPlayers: 2,
    maxPlayers: 8,
  },
  {
    id: 'commander',
    name: 'Commander',
    shortName: 'Commander',
    desc: 'Pods of 4 play multiplayer Commander (40 life). Top 2 from each pod advance each round until a champion emerges.',
    color: Colors.formatCommander,
    icon: '👑',
    minPlayers: 4,
    maxPlayers: 32,
  },
  {
    id: 'two_phase',
    name: 'Two-Phase',
    shortName: 'Two-Phase',
    desc: 'Round Robin seeds a Single Elimination bracket. Thorough and fair.',
    color: Colors.formatTwoPhase,
    icon: '🔁',
    minPlayers: 4,
    maxPlayers: 16,
  },
  {
    id: 'suggested',
    name: 'Suggested',
    shortName: 'Auto',
    desc: 'Best format chosen automatically based on player count.',
    color: Colors.formatSuggest,
    icon: '✨',
    minPlayers: 2,
    maxPlayers: 32,
  },
] as const;

export type FormatId = typeof FORMATS[number]['id'];

export function getSuggestedFormat(playerCount: number): Exclude<FormatId, 'suggested'> {
  if (playerCount <= 4) return 'round_robin';
  if (playerCount <= 8) return 'double_elim';
  if (playerCount <= 16) return 'single_elim';
  return 'single_elim';
}
