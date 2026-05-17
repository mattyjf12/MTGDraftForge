// LifeCounterScreen.tsx
// Life counter with commander damage tracking and match-result integration.
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Animated, Alert, Modal, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, getSuggestedFormat } from '../theme';
import { generateRoundRobinSchedule, generateMultiGameRRSchedule, getRRKey, MultiGameRRMatch } from '../utils/tournament';
import { Button, Card, Row, Label, Divider, haptic } from '../components/UI';
import { LifePlayer } from '../utils/types';
import { useApp } from '../services/AppContext';
import { patchBracketMatch, patchMtgaMatchupResult } from '../services/firebase';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const PLAYER_COLORS = [Colors.gold, Colors.blueLight, Colors.greenLight, Colors.redLight, Colors.purpleLight, Colors.amber];
const DEFAULT_LIFE = 20;
const COMMANDER_LIFE = 40;
const COMMANDER_DAMAGE_KILL = 21;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Find the earliest unplayed RR match for userId where both players have no
 * pending obligation in any earlier round — i.e. both are "free" to play early.
 */
function findEligibleRRPairing(
  schedule: Array<Array<[string, string]>>,
  rrResults: Record<string, unknown>,
  userId: string,
): { oppId: string; p1id: string; p2id: string } | null {
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
    if (!pair) continue; // bye
    const [p1id, p2id] = pair;
    if (rrResults[getRRKey(p1id, p2id)]) continue; // already played
    const oppId = p1id === userId ? p2id : p1id;
    if (isFree(userId, i) && isFree(oppId, i)) return { oppId, p1id, p2id };
    return null; // blocked by an earlier obligation
  }
  return null;
}

/** Same as findEligibleRRPairing but for multi-game (two_phase phase 1) schedules. */
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
    if (!m) continue; // bye
    if (rrResults[m.gameKey]) continue; // already played
    const oppId = m.p1id === userId ? m.p2id : m.p1id;
    if (isFree(userId, i) && isFree(oppId, i)) return m;
    return null;
  }
  return null;
}

/** Returns the pending matchup for the current user in an active room, or null. */
function findPendingMatchup(
  room: ReturnType<typeof useApp>['state']['rooms'][0] | undefined,
  userId: string,
): { description: string; logAction: () => void } | null {
  if (!room || room.status !== 'in_progress') return null;
  const playerNames: Record<string, string> = {};
  room.players.forEach(p => { playerNames[p.id] = p.name; });
  const effectiveFmt = room.format === 'suggested' ? getSuggestedFormat(room.players.length) : room.format;

  // Bracket / seeded / double-elim
  if (room.bracket && (effectiveFmt === 'single_elim' || effectiveFmt === 'double_elim' || effectiveFmt === 'seeded' || (effectiveFmt === 'two_phase' && room.phase === 2))) {
    const match = room.bracket.find(m =>
      !m.result &&
      !m.isBye &&
      m.player1Id && m.player2Id &&
      (m.player1Id === userId || m.player2Id === userId),
    );
    if (match) {
      const oppId = match.player1Id === userId ? match.player2Id! : match.player1Id!;
      return {
        description: `vs ${playerNames[oppId] ?? 'opponent'} (bracket)`,
        logAction: () => null, // caller handles dispatch with winner
      };
    }
  }

  // Round Robin
  if (effectiveFmt === 'round_robin') {
    const result = findEligibleRRPairing(
      generateRoundRobinSchedule(room.players),
      room.rrResults ?? {},
      userId,
    );
    if (!result) return null;
    const opp = room.players.find(p => p.id === result.oppId);
    if (opp) return { description: `vs ${opp.name} (Round Robin)`, logAction: () => null };
    return null;
  }

  // Two-phase phase 1 (multi-game RR)
  if (effectiveFmt === 'two_phase' && room.phase === 1) {
    const m = findEligibleMultiGameMatch(
      generateMultiGameRRSchedule(room.players, room.settings?.rrGamesCount ?? 1),
      room.rrResults ?? {},
      userId,
    );
    if (!m) return null;
    const oppId = m.p1id === userId ? m.p2id : m.p1id;
    const opp = room.players.find(p => p.id === oppId);
    if (opp) return { description: `vs ${opp.name} (Round Robin)`, logAction: () => null };
    return null;
  }

  // MTGA Swiss
  if (effectiveFmt === 'mtga' && room.mtgaRounds) {
    const currentRound = [...room.mtgaRounds].reverse().find(r => !r.isComplete);
    if (currentRound) {
      const matchup = currentRound.matchups.find(m =>
        !m.winnerId && !m.isBye &&
        (m.player1Id === userId || m.player2Id === userId),
      );
      if (matchup) {
        const oppId = matchup.player1Id === userId ? matchup.player2Id! : matchup.player1Id!;
        return {
          description: `vs ${playerNames[oppId] ?? 'opponent'} (Swiss R${currentRound.roundNumber})`,
          logAction: () => null,
        };
      }
    }
  }

  return null;
}

// ── Commander damage section ──────────────────────────────────────────────────

function CommanderDamageSection({
  player,
  allPlayers,
  onAdjustCmdrDmg,
}: {
  player: LifePlayer;
  allPlayers: LifePlayer[];
  onAdjustCmdrDmg: (targetId: string, sourceId: string, delta: number) => void;
}) {
  const opponents = allPlayers.filter(p => p.id !== player.id && !p.isEliminated);
  if (opponents.length === 0) return null;

  return (
    <View style={s.cmdrSection}>
      <Text style={s.cmdrSectionLabel}>⚔️ COMMANDER DAMAGE RECEIVED</Text>
      {opponents.map(opp => {
        const dmg = player.commanderDamage?.[opp.id] ?? 0;
        const isDangerous = dmg >= 15;
        const isLethal = dmg >= COMMANDER_DAMAGE_KILL;
        return (
          <View key={opp.id} style={s.cmdrRow}>
            <Text style={[s.cmdrOppName, { color: opp.color }]} numberOfLines={1}>
              {opp.name}
            </Text>
            <TouchableOpacity
              style={s.cmdrBtn}
              onPress={() => onAdjustCmdrDmg(player.id, opp.id, -1)}
              accessibilityLabel={`Remove 1 commander damage from ${opp.name}`}
            >
              <Text style={s.cmdrBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={[
              s.cmdrDmgVal,
              isDangerous && { color: Colors.amber },
              isLethal && { color: Colors.redLight },
            ]}>
              {dmg}
            </Text>
            <TouchableOpacity
              style={s.cmdrBtn}
              onPress={() => onAdjustCmdrDmg(player.id, opp.id, 1)}
              accessibilityLabel={`Add 1 commander damage from ${opp.name}`}
            >
              <Text style={s.cmdrBtnText}>+</Text>
            </TouchableOpacity>
            {isLethal && <Text style={s.cmdrLethal}>LETHAL</Text>}
          </View>
        );
      })}
    </View>
  );
}

// ── Life card ─────────────────────────────────────────────────────────────────

function LifeCard({
  player,
  allPlayers,
  onAdjust,
  onAdjustPoison,
  onAdjustEnergy,
  onAdjustCmdrDmg,
  onEliminate,
  compact,
  commanderMode,
  flipped,
}: {
  player: LifePlayer;
  allPlayers: LifePlayer[];
  onAdjust: (delta: number) => void;
  onAdjustPoison: (delta: number) => void;
  onAdjustEnergy: (delta: number) => void;
  onAdjustCmdrDmg: (targetId: string, sourceId: string, delta: number) => void;
  onEliminate: () => void;
  compact?: boolean;
  commanderMode: boolean;
  flipped?: boolean;
}) {
  const flashAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  function flash(positive: boolean) {
    flashAnim.stopAnimation();
    scaleAnim.stopAnimation();
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: positive ? 1 : -1, duration: 80, useNativeDriver: false }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start();
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.06, duration: 80, useNativeDriver: false }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: false, speed: 20 }),
    ]).start();
  }

  function handleAdjust(delta: number) {
    onAdjust(delta);
    flash(delta > 0);
    haptic(delta > 0 ? 'impactLight' : 'impactMedium');
  }

  const borderColor = flashAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [Colors.redLight, player.color, Colors.greenLight],
  });

  const isDanger = player.life <= 5 && !player.isEliminated;
  const lifeColor = player.isEliminated ? Colors.textFaint : isDanger ? Colors.redLight : player.color;

  if (compact) {
    return (
      <Animated.View style={[s.compactCard, { borderColor, transform: [{ scale: scaleAnim }, { rotate: flipped ? '180deg' : '0deg' }] }]}>
        <Text style={[s.compactName, { color: player.color }]} numberOfLines={1}>{player.name}</Text>
        <Text style={[s.compactLife, { color: lifeColor }]}>{player.isEliminated ? '💀' : player.life}</Text>
        {commanderMode && player.commanderDamage && (
          <Text style={s.compactCmdrTotal} numberOfLines={1}>
            {Object.values(player.commanderDamage).reduce((a, b) => a + b, 0)}⚔️
          </Text>
        )}
        <View style={s.compactBtns}>
          <TouchableOpacity
            style={[s.microBtn, { borderColor: Colors.redLight }]}
            onPress={() => handleAdjust(-1)}
            accessibilityLabel={`${player.name} lose 1 life`}
            accessibilityRole="button"
          >
            <Text style={s.microMinus}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.microBtn, { borderColor: Colors.greenLight }]}
            onPress={() => handleAdjust(1)}
            accessibilityLabel={`${player.name} gain 1 life`}
            accessibilityRole="button"
          >
            <Text style={s.microPlus}>+</Text>
          </TouchableOpacity>
        </View>
        {isDanger && <Text style={s.dangerAlert}>⚠️</Text>}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[s.lifeCard, { borderColor, transform: [{ scale: scaleAnim }, { rotate: flipped ? '180deg' : '0deg' }] }]}>
      {/* Player name */}
      <Text style={[s.playerCardName, { color: player.color }]}>{player.name}</Text>

      {/* Life total */}
      <Text style={[s.lifeTotal, { color: lifeColor }]}>
        {player.isEliminated ? '💀' : player.life}
      </Text>

      {/* Big +/- buttons */}
      <View style={s.bigBtnRow}>
        <TouchableOpacity style={[s.bigBtn, s.bigBtnMinus]} onPress={() => handleAdjust(-5)} accessibilityLabel={`${player.name} lose 5 life`} accessibilityRole="button">
          <Text style={s.bigBtnText}>−5</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.bigBtn, s.bigBtnMinus]} onPress={() => handleAdjust(-1)} accessibilityLabel={`${player.name} lose 1 life`} accessibilityRole="button">
          <Text style={[s.bigBtnText, { fontSize: 22 }]}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.bigBtn, s.bigBtnPlus]} onPress={() => handleAdjust(1)} accessibilityLabel={`${player.name} gain 1 life`} accessibilityRole="button">
          <Text style={[s.bigBtnText, { fontSize: 22 }]}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.bigBtn, s.bigBtnPlus]} onPress={() => handleAdjust(5)} accessibilityLabel={`${player.name} gain 5 life`} accessibilityRole="button">
          <Text style={s.bigBtnText}>+5</Text>
        </TouchableOpacity>
      </View>

      {/* Counters row */}
      <View style={s.countersRow}>
        <View style={s.counterBox}>
          <Text style={s.counterLabel}>☠️ Poison</Text>
          <View style={s.counterBtns}>
            <TouchableOpacity
              onPress={() => { onAdjustPoison(-1); haptic('impactLight'); }}
              style={s.counterBtn}
              accessibilityLabel={`${player.name} remove poison counter`}
            >
              <Text style={s.counterBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={[s.counterVal, player.poisonCounters >= 10 && { color: Colors.redLight }]}>
              {player.poisonCounters}
            </Text>
            <TouchableOpacity
              onPress={() => { onAdjustPoison(1); haptic('impactLight'); }}
              style={s.counterBtn}
              accessibilityLabel={`${player.name} add poison counter`}
            >
              <Text style={s.counterBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={s.counterBox}>
          <Text style={s.counterLabel}>⚡ Energy</Text>
          <View style={s.counterBtns}>
            <TouchableOpacity
              onPress={() => { onAdjustEnergy(-1); haptic('impactLight'); }}
              style={s.counterBtn}
              accessibilityLabel={`${player.name} remove energy counter`}
            >
              <Text style={s.counterBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={s.counterVal}>{player.energyCounters}</Text>
            <TouchableOpacity
              onPress={() => { onAdjustEnergy(1); haptic('impactLight'); }}
              style={s.counterBtn}
              accessibilityLabel={`${player.name} add energy counter`}
            >
              <Text style={s.counterBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Commander damage (commander mode only) */}
      {commanderMode && !player.isEliminated && (
        <CommanderDamageSection
          player={player}
          allPlayers={allPlayers}
          onAdjustCmdrDmg={onAdjustCmdrDmg}
        />
      )}

      {isDanger && (
        <View style={s.dangerBanner}>
          <Text style={s.dangerBannerText}>⚠️ LOW LIFE</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ── Commander grid card (2×2 no-scroll layout) ───────────────────────────────

function CommanderGridCard({
  player,
  allPlayers,
  onAdjust,
  onAdjustPoison,
  onAdjustEnergy,
  onAdjustCmdrDmg,
  flipped,
}: {
  player: LifePlayer;
  allPlayers: LifePlayer[];
  onAdjust: (delta: number) => void;
  onAdjustPoison: (delta: number) => void;
  onAdjustEnergy: (delta: number) => void;
  onAdjustCmdrDmg: (targetId: string, sourceId: string, delta: number) => void;
  flipped?: boolean;
}) {
  const flashAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  function flash(positive: boolean) {
    flashAnim.stopAnimation();
    scaleAnim.stopAnimation();
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: positive ? 1 : -1, duration: 80, useNativeDriver: false }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start();
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.04, duration: 80, useNativeDriver: false }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: false, speed: 20 }),
    ]).start();
  }

  function handleAdjust(delta: number) {
    onAdjust(delta);
    flash(delta > 0);
    haptic(delta > 0 ? 'impactLight' : 'impactMedium');
  }

  const borderColor = flashAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [Colors.redLight, player.color, Colors.greenLight],
  });

  const isDanger = player.life <= 5 && !player.isEliminated;
  const lifeColor = player.isEliminated ? Colors.textFaint : isDanger ? Colors.redLight : player.color;
  const opponents = allPlayers.filter(p => p.id !== player.id);

  return (
    <Animated.View style={[s.cmdrGridCard, { borderColor, transform: [{ scale: scaleAnim }, { rotate: flipped ? '180deg' : '0deg' }] }]}>
      <Text style={[s.cmdrGridName, { color: player.color }]} numberOfLines={1}>{player.name}</Text>
      <Text style={[s.cmdrGridLife, { color: lifeColor }]}>
        {player.isEliminated ? '💀' : player.life}
      </Text>

      <View style={s.cmdrGridBtnRow}>
        <TouchableOpacity style={[s.cmdrGridBtn, s.cmdrGridBtnMinus]} onPress={() => handleAdjust(-5)} accessibilityLabel={`${player.name} lose 5 life`}>
          <Text style={s.cmdrGridBtnText}>−5</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.cmdrGridBtn, s.cmdrGridBtnMinus]} onPress={() => handleAdjust(-1)} accessibilityLabel={`${player.name} lose 1 life`}>
          <Text style={[s.cmdrGridBtnText, { fontSize: 16 }]}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.cmdrGridBtn, s.cmdrGridBtnPlus]} onPress={() => handleAdjust(1)} accessibilityLabel={`${player.name} gain 1 life`}>
          <Text style={[s.cmdrGridBtnText, { fontSize: 16 }]}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.cmdrGridBtn, s.cmdrGridBtnPlus]} onPress={() => handleAdjust(5)} accessibilityLabel={`${player.name} gain 5 life`}>
          <Text style={s.cmdrGridBtnText}>+5</Text>
        </TouchableOpacity>
      </View>

      <View style={s.cmdrGridCounterRow}>
        <TouchableOpacity style={s.cmdrGridDmgBtn} onPress={() => { onAdjustPoison(-1); haptic('impactLight'); }}>
          <Text style={s.cmdrGridDmgBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={[s.cmdrGridCounterVal, player.poisonCounters >= 10 && { color: Colors.redLight }]}>
          ☠️{player.poisonCounters}
        </Text>
        <TouchableOpacity style={s.cmdrGridDmgBtn} onPress={() => { onAdjustPoison(1); haptic('impactLight'); }}>
          <Text style={s.cmdrGridDmgBtnText}>+</Text>
        </TouchableOpacity>
        <View style={s.cmdrGridCounterDivider} />
        <TouchableOpacity style={s.cmdrGridDmgBtn} onPress={() => { onAdjustEnergy(-1); haptic('impactLight'); }}>
          <Text style={s.cmdrGridDmgBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={s.cmdrGridCounterVal}>⚡{player.energyCounters}</Text>
        <TouchableOpacity style={s.cmdrGridDmgBtn} onPress={() => { onAdjustEnergy(1); haptic('impactLight'); }}>
          <Text style={s.cmdrGridDmgBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {!player.isEliminated && opponents.length > 0 && (
        <View style={s.cmdrGridDmgSection}>
          {opponents.map(opp => {
            const dmg = player.commanderDamage?.[opp.id] ?? 0;
            const isLethal = dmg >= COMMANDER_DAMAGE_KILL;
            return (
              <View key={opp.id} style={s.cmdrGridDmgRow}>
                <Text style={[s.cmdrGridDmgName, { color: opp.color }]} numberOfLines={1}>{opp.name}</Text>
                <TouchableOpacity style={s.cmdrGridDmgBtn} onPress={() => { onAdjustCmdrDmg(player.id, opp.id, -1); haptic('impactLight'); }}>
                  <Text style={s.cmdrGridDmgBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={[s.cmdrGridDmgVal, isLethal && { color: Colors.redLight }]}>{dmg}</Text>
                <TouchableOpacity style={s.cmdrGridDmgBtn} onPress={() => { onAdjustCmdrDmg(player.id, opp.id, 1); haptic('impactLight'); }}>
                  <Text style={s.cmdrGridDmgBtnText}>+</Text>
                </TouchableOpacity>
                {isLethal && <Text style={s.cmdrGridDmgLethal}>💀</Text>}
              </View>
            );
          })}
        </View>
      )}

      {isDanger && <Text style={s.dangerAlert}>⚠️</Text>}
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function LifeCounterScreen() {
  const { state, dispatch } = useApp();
  const [commanderMode, setCommanderMode] = useState(false);
  const [players, setPlayers] = useState<LifePlayer[]>([
    { id: uuidv4(), name: 'Player 1', life: DEFAULT_LIFE, startingLife: DEFAULT_LIFE, color: PLAYER_COLORS[0], poisonCounters: 0, energyCounters: 0, isEliminated: false },
    { id: uuidv4(), name: 'Player 2', life: DEFAULT_LIFE, startingLife: DEFAULT_LIFE, color: PLAYER_COLORS[1], poisonCounters: 0, energyCounters: 0, isEliminated: false },
  ]);
  const [startLife, setStartLife] = useState(DEFAULT_LIFE);
  const [compact, setCompact] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [configuredPodId, setConfiguredPodId] = useState<string | null>(null);
  const [configuredMatchupKey, setConfiguredMatchupKey] = useState<string | null>(null);
  const [tableMode, setTableMode] = useState(false);

  // Track when we've already prompted for a given "game over" state
  const logPromptFiredRef = useRef(false);

  // ── Derive current Commander pod for this user ────────────────────────────
  const activeRoom = state.rooms.find(r => r.id === state.activeRoomId);
  const currentPod = useMemo(() => {
    if (!activeRoom || activeRoom.format !== 'commander' || activeRoom.status !== 'in_progress' || !activeRoom.commanderPods) return null;
    const maxRound = Math.max(...activeRoom.commanderPods.map(p => p.round));
    return activeRoom.commanderPods.find(
      pod => pod.round === maxRound && pod.playerIds.includes(state.currentUserId) && !pod.results,
    ) ?? null;
  }, [activeRoom, state.currentUserId]);

  function configureForCommanderPod() {
    if (!currentPod || !activeRoom) return;
    const podPlayerNames: Record<string, string> = {};
    activeRoom.players.forEach(p => { podPlayerNames[p.id] = p.name; });
    const newPlayers: LifePlayer[] = currentPod.playerIds.map((id, idx) => ({
      id: uuidv4(),
      name: podPlayerNames[id] ?? `Player ${idx + 1}`,
      life: COMMANDER_LIFE,
      startingLife: COMMANDER_LIFE,
      color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
      poisonCounters: 0,
      energyCounters: 0,
      isEliminated: false,
      commanderDamage: {},
    }));
    setCommanderMode(true);
    setStartLife(COMMANDER_LIFE);
    setPlayers(newPlayers);
    logPromptFiredRef.current = false;
    setConfiguredPodId(currentPod.id);
    haptic('notificationSuccess');
  }

  // ── Derive current matchup for non-commander formats ─────────────────────
  const currentMatchup = useMemo(() => {
    if (!activeRoom || activeRoom.status !== 'in_progress' || activeRoom.format === 'commander') return null;
    const userId = state.currentUserId;
    const me = activeRoom.players.find(p => p.id === userId);
    if (!me) return null;
    const startingLife = activeRoom.settings?.startingLife ?? DEFAULT_LIFE;
    const fmt = activeRoom.format === 'suggested'
      ? getSuggestedFormat(activeRoom.players.length)
      : activeRoom.format;

    // Bracket formats
    if (fmt === 'single_elim' || fmt === 'double_elim' || fmt === 'seeded' ||
        (fmt === 'two_phase' && activeRoom.phase === 2)) {
      const match = activeRoom.bracket?.find(m =>
        !m.result && !m.isBye && m.player1Id && m.player2Id &&
        (m.player1Id === userId || m.player2Id === userId),
      );
      if (match) {
        const oppId = match.player1Id === userId ? match.player2Id! : match.player1Id!;
        const opp = activeRoom.players.find(p => p.id === oppId);
        if (opp) return { matchPlayers: [me, opp], startingLife };
      }
    }

    // Round Robin — suggest match when both players are free (no pending earlier round obligations)
    if (fmt === 'round_robin') {
      const result = findEligibleRRPairing(
        generateRoundRobinSchedule(activeRoom.players),
        activeRoom.rrResults ?? {},
        userId,
      );
      if (!result) return null;
      const opp = activeRoom.players.find(p => p.id === result.oppId);
      if (opp) return { matchPlayers: [me, opp], startingLife };
      return null;
    }

    // Two-phase phase 1 (multi-game RR)
    if (fmt === 'two_phase' && activeRoom.phase === 1) {
      const m = findEligibleMultiGameMatch(
        generateMultiGameRRSchedule(activeRoom.players, activeRoom.settings?.rrGamesCount ?? 1),
        activeRoom.rrResults ?? {},
        userId,
      );
      if (!m) return null;
      const oppId = m.p1id === userId ? m.p2id : m.p1id;
      const opp = activeRoom.players.find(p => p.id === oppId);
      if (opp) return { matchPlayers: [me, opp], startingLife };
      return null;
    }

    // MTGA Swiss
    if (fmt === 'mtga' && activeRoom.mtgaRounds) {
      const currentRound = [...activeRoom.mtgaRounds].reverse().find(r => !r.isComplete);
      if (currentRound) {
        const matchup = currentRound.matchups.find(m =>
          !m.winnerId && !m.isBye &&
          (m.player1Id === userId || m.player2Id === userId),
        );
        if (matchup) {
          const oppId = matchup.player1Id === userId ? matchup.player2Id! : matchup.player1Id!;
          const opp = activeRoom.players.find(p => p.id === oppId);
          if (opp) return { matchPlayers: [me, opp], startingLife };
        }
      }
    }

    return null;
  }, [activeRoom, state.currentUserId]);

  function configureForMatchup() {
    if (!currentMatchup || !activeRoom) return;
    const { matchPlayers, startingLife } = currentMatchup;
    const newPlayers: LifePlayer[] = matchPlayers.map((p, idx) => ({
      id: uuidv4(),
      name: p.name,
      life: startingLife,
      startingLife,
      color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
      poisonCounters: 0,
      energyCounters: 0,
      isEliminated: false,
    }));
    setCommanderMode(false);
    setStartLife(startingLife);
    setPlayers(newPlayers);
    logPromptFiredRef.current = false;
    setConfiguredMatchupKey(`${activeRoom.id}|${matchPlayers.map(p => p.id).sort().join('|')}`);
    haptic('notificationSuccess');
  }

  // ── Life adjustment ────────────────────────────────────────────────────────
  const adjust = useCallback((id: string, delta: number) => {
    setPlayers(ps => ps.map(p => {
      if (p.id !== id) return p;
      const newLife = Math.max(0, p.life + delta);
      return { ...p, life: newLife, isEliminated: newLife === 0 };
    }));
  }, []);

  const adjustPoison = useCallback((id: string, delta: number) => {
    setPlayers(ps => ps.map(p => {
      if (p.id !== id) return p;
      const newPoison = Math.max(0, p.poisonCounters + delta);
      // 10 poison counters = eliminated in Commander/normal
      const eliminated = newPoison >= 10 ? true : p.isEliminated;
      if (newPoison >= 10 && !p.isEliminated) haptic('notificationWarning');
      return { ...p, poisonCounters: newPoison, isEliminated: eliminated };
    }));
  }, []);

  const adjustEnergy = useCallback((id: string, delta: number) => {
    setPlayers(ps => ps.map(p => {
      if (p.id !== id) return p;
      return { ...p, energyCounters: Math.max(0, p.energyCounters + delta) };
    }));
  }, []);

  // ── Commander damage ───────────────────────────────────────────────────────
  const adjustCommanderDamage = useCallback((targetId: string, sourceId: string, delta: number) => {
    setPlayers(ps => ps.map(p => {
      if (p.id !== targetId) return p;
      const prev = p.commanderDamage ?? {};
      const newDmg = Math.max(0, (prev[sourceId] ?? 0) + delta);
      const updatedCmdr = { ...prev, [sourceId]: newDmg };
      // 21+ commander damage from any single source = eliminated
      const commanderElim = Object.values(updatedCmdr).some(d => d >= COMMANDER_DAMAGE_KILL);
      if (commanderElim && !p.isEliminated) {
        haptic('notificationWarning');
        // Also set life to 0 for visual clarity
        return { ...p, commanderDamage: updatedCmdr, isEliminated: true, life: 0 };
      }
      return { ...p, commanderDamage: updatedCmdr };
    }));
  }, []);

  // ── Auto-prompt to log tournament match result ─────────────────────────────
  useEffect(() => {
    const alive = players.filter(p => !p.isEliminated && p.life > 0);
    const hasEliminated = players.some(p => p.isEliminated || p.life === 0);

    // Reset the "already prompted" flag whenever the game is clearly ongoing
    if (alive.length !== 1 || !hasEliminated) {
      logPromptFiredRef.current = false;
      return;
    }
    if (logPromptFiredRef.current) return;

    const activeRoom = state.rooms.find(r => r.id === state.activeRoomId);
    const matchup = findPendingMatchup(activeRoom, state.currentUserId);
    if (!matchup) return;

    logPromptFiredRef.current = true;
    const winner = alive[0];

    haptic('notificationSuccess');
    Alert.alert(
      '🏆 Log Match Result?',
      `${winner.name} is the last one standing!\n\nLog result for your scheduled matchup:\n${matchup.description}?`,
      [
        { text: 'Not Now', style: 'cancel' },
        {
          text: 'Log Result',
          onPress: () => {
            if (!activeRoom) return;
            const userId = state.currentUserId;
            const winnerIsCurrentUser = winner.name === state.currentUserName;
            const effectiveFmt = activeRoom.format === 'suggested'
              ? getSuggestedFormat(activeRoom.players.length)
              : activeRoom.format;

            if (effectiveFmt === 'single_elim' || effectiveFmt === 'double_elim' || effectiveFmt === 'seeded' ||
                (effectiveFmt === 'two_phase' && activeRoom.phase === 2)) {
              const match = activeRoom.bracket?.find(m =>
                !m.result && !m.isBye && m.player1Id && m.player2Id &&
                (m.player1Id === userId || m.player2Id === userId),
              );
              if (match) {
                const winnerId = winnerIsCurrentUser ? userId : (match.player1Id === userId ? match.player2Id! : match.player1Id!);
                const loserId = winnerId === match.player1Id ? match.player2Id! : match.player1Id!;
                dispatch({
                  type: 'LOG_ELIM_RESULT',
                  roomId: activeRoom.id,
                  matchId: match.id,
                  winnerId,
                  loserId,
                  winnerLife: winner.life,
                  loserLife: 0,
                });
                patchBracketMatch(activeRoom.id, match.id, winnerId, loserId, winner.life, 0);
              }
            } else if (effectiveFmt === 'round_robin') {
              const result = findEligibleRRPairing(
                generateRoundRobinSchedule(activeRoom.players),
                activeRoom.rrResults ?? {},
                userId,
              );
              if (result) {
                const { oppId } = result;
                const winnerId = winnerIsCurrentUser ? userId : oppId;
                const loserId = winnerId === userId ? oppId : userId;
                dispatch({
                  type: 'LOG_RR_RESULT',
                  roomId: activeRoom.id,
                  result: {
                    player1Id: userId,
                    player2Id: oppId,
                    winnerId,
                    loserId,
                    winnerFinalLife: winner.life,
                    completedAt: Date.now(),
                  },
                });
              }
            } else if (effectiveFmt === 'two_phase' && activeRoom.phase === 1) {
              const m = findEligibleMultiGameMatch(
                generateMultiGameRRSchedule(activeRoom.players, activeRoom.settings?.rrGamesCount ?? 1),
                activeRoom.rrResults ?? {},
                userId,
              );
              if (m) {
                const oppId = m.p1id === userId ? m.p2id : m.p1id;
                const winnerId = winnerIsCurrentUser ? userId : oppId;
                const loserId = winnerId === userId ? oppId : userId;
                dispatch({
                  type: 'LOG_RR_RESULT',
                  roomId: activeRoom.id,
                  result: {
                    player1Id: userId,
                    player2Id: oppId,
                    winnerId,
                    loserId,
                    winnerFinalLife: winner.life,
                    gameKey: m.gameKey,
                    completedAt: Date.now(),
                  },
                });
              }
            } else if (effectiveFmt === 'mtga' && activeRoom.mtgaRounds) {
              const currentRound = [...activeRoom.mtgaRounds].reverse().find(r => !r.isComplete);
              if (currentRound) {
                const matchup = currentRound.matchups.find(m =>
                  !m.winnerId && !m.isBye &&
                  (m.player1Id === userId || m.player2Id === userId),
                );
                if (matchup) {
                  const oppId = matchup.player1Id === userId ? matchup.player2Id! : matchup.player1Id!;
                  const winnerId = winnerIsCurrentUser ? userId : oppId!;
                  const loserId = winnerId === userId ? oppId! : userId;
                  dispatch({
                    type: 'LOG_MTGA_MATCHUP_RESULT',
                    roomId: activeRoom.id,
                    roundNumber: currentRound.roundNumber,
                    matchupId: matchup.id,
                    winnerId,
                    loserId,
                  });
                  patchMtgaMatchupResult(activeRoom.id, currentRound.roundNumber, matchup.id, winnerId, loserId);
                }
              }
            }
          },
        },
      ],
    );
  }, [players, state.activeRoomId, state.rooms, state.currentUserId, state.currentUserName, dispatch]);

  // ── Commander mode toggle: reset life totals ──────────────────────────────
  function toggleCommanderMode(enabled: boolean) {
    setCommanderMode(enabled);
    const newLife = enabled ? COMMANDER_LIFE : DEFAULT_LIFE;
    setStartLife(newLife);
    setPlayers(ps => ps.map(p => ({
      ...p,
      life: newLife,
      startingLife: newLife,
      isEliminated: false,
      commanderDamage: enabled ? {} : undefined,
      poisonCounters: 0,
      energyCounters: 0,
    })));
  }

  function addPlayer() {
    if (players.length >= 6) { Alert.alert('Max 6 players'); return; }
    const name = newPlayerName.trim() || `Player ${players.length + 1}`;
    setPlayers(ps => [...ps, {
      id: uuidv4(),
      name,
      life: startLife,
      startingLife: startLife,
      color: PLAYER_COLORS[players.length % PLAYER_COLORS.length],
      poisonCounters: 0,
      energyCounters: 0,
      isEliminated: false,
      commanderDamage: commanderMode ? {} : undefined,
    }]);
    setNewPlayerName('');
  }

  function removePlayer(id: string) {
    if (players.length <= 1) return;
    setPlayers(ps => ps.filter(p => p.id !== id));
  }

  function resetAll() {
    Alert.alert('Reset All Life', 'Reset all players to starting life?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        onPress: () => {
          logPromptFiredRef.current = false;
          setPlayers(ps => ps.map(p => ({
            ...p,
            life: startLife,
            isEliminated: false,
            poisonCounters: 0,
            energyCounters: 0,
            commanderDamage: commanderMode ? {} : undefined,
          })));
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Header bar */}
      <View style={s.topBar}>
        <Text style={s.topBarTitle}>❤️ Life Counter</Text>
        <View style={s.topBarActions}>
          <TouchableOpacity style={s.topBarBtn} onPress={() => setCompact(c => !c)}>
            <Text style={s.topBarBtnText}>{compact ? '⊞' : '⊟'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.topBarBtn} onPress={() => setSettingsOpen(true)}>
            <Text style={s.topBarBtnText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.topBarBtn, { borderColor: Colors.redLight }]} onPress={resetAll}>
            <Text style={[s.topBarBtnText, { color: Colors.redLight }]}>↺</Text>
          </TouchableOpacity>
        </View>
      </View>

      {commanderMode && (
        <View style={s.commanderBanner}>
          <Text style={s.commanderBannerText}>👑 COMMANDER MODE  ·  40 LIFE  ·  21 CMD DMG LETHAL</Text>
        </View>
      )}

      {currentPod && currentPod.id !== configuredPodId && (
        <TouchableOpacity style={s.podSetupBanner} onPress={configureForCommanderPod} activeOpacity={0.75}>
          <Text style={s.podSetupTitle}>👑 Commander Pod {currentPod.podIndex + 1} Active</Text>
          <Text style={s.podSetupSub}>
            Tap to configure · {activeRoom!.players.filter(p => currentPod.playerIds.includes(p.id)).map(p => p.name).join(', ')}
          </Text>
        </TouchableOpacity>
      )}

{commanderMode && players.length >= 3 && players.length <= 4 ? (
        // 2×2 no-scroll grid for commander pods
        <View style={s.commanderGrid}>
          <View style={s.commanderGridRow}>
            {players.slice(0, 2).map(p => (
              <CommanderGridCard
                key={p.id}
                player={p}
                allPlayers={players}
                onAdjust={d => adjust(p.id, d)}
                onAdjustPoison={d => adjustPoison(p.id, d)}
                onAdjustEnergy={d => adjustEnergy(p.id, d)}
                onAdjustCmdrDmg={adjustCommanderDamage}
                flipped={tableMode}
              />
            ))}
          </View>
          <View style={s.commanderGridRow}>
            {players.slice(2, 4).map(p => (
              <CommanderGridCard
                key={p.id}
                player={p}
                allPlayers={players}
                onAdjust={d => adjust(p.id, d)}
                onAdjustPoison={d => adjustPoison(p.id, d)}
                onAdjustEnergy={d => adjustEnergy(p.id, d)}
                onAdjustCmdrDmg={adjustCommanderDamage}
              />
            ))}
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[s.container, compact && s.containerCompact]}>
          {compact ? (
            <View style={s.compactGrid}>
              {players.map((p, idx) => (
                <LifeCard
                  key={p.id}
                  player={p}
                  allPlayers={players}
                  onAdjust={d => adjust(p.id, d)}
                  onAdjustPoison={d => adjustPoison(p.id, d)}
                  onAdjustEnergy={d => adjustEnergy(p.id, d)}
                  onAdjustCmdrDmg={adjustCommanderDamage}
                  onEliminate={() => removePlayer(p.id)}
                  compact
                  commanderMode={commanderMode}
                  flipped={tableMode && idx < Math.floor(players.length / 2)}
                />
              ))}
            </View>
          ) : (
            players.map((p, idx) => (
              <LifeCard
                key={p.id}
                player={p}
                allPlayers={players}
                onAdjust={d => adjust(p.id, d)}
                onAdjustPoison={d => adjustPoison(p.id, d)}
                onAdjustEnergy={d => adjustEnergy(p.id, d)}
                onAdjustCmdrDmg={adjustCommanderDamage}
                onEliminate={() => removePlayer(p.id)}
                commanderMode={commanderMode}
                flipped={tableMode && idx < Math.floor(players.length / 2)}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Settings modal */}
      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>⚙️ Life Counter Settings</Text>
            <Divider />

            {/* Commander mode toggle */}
            <Row between style={{ paddingVertical: Spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>👑 Commander Mode</Text>
                <Text style={s.settingDesc}>Sets life to 40, enables per-player commander damage tracking (21 = lethal)</Text>
              </View>
              <Switch
                value={commanderMode}
                onValueChange={toggleCommanderMode}
                thumbColor={commanderMode ? Colors.gold : Colors.textFaint}
                trackColor={{ false: Colors.border, true: Colors.goldGlow }}
              />
            </Row>

            <Divider />

            {/* Table mode toggle */}
            <Row between style={{ paddingVertical: Spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>↕️ Table Mode</Text>
                <Text style={s.settingDesc}>Flips the top player card(s) so both sides of the table can read their totals right-side up</Text>
              </View>
              <Switch
                value={tableMode}
                onValueChange={setTableMode}
                thumbColor={tableMode ? Colors.gold : Colors.textFaint}
                trackColor={{ false: Colors.border, true: Colors.goldGlow }}
              />
            </Row>

            <Divider />

            <Label style={{ marginTop: Spacing.sm }}>Starting Life</Label>
            <View style={s.lifeOptions}>
              {(commanderMode ? [20, 30, 40, 50] : [20, 30, 40, 50]).map(n => (
                <Button
                  key={n}
                  label={`${n}`}
                  onPress={() => {
                    setStartLife(n);
                    setPlayers(ps => ps.map(p => ({ ...p, life: n, startingLife: n, isEliminated: false })));
                  }}
                  variant={startLife === n ? 'gold' : 'outline'}
                  size="sm"
                  style={{ flex: 1 }}
                />
              ))}
            </View>

            <Label style={{ marginTop: Spacing.md }}>Add Player</Label>
            <View style={s.addRow}>
              <TextInput
                style={s.nameInput}
                placeholder={`Player ${players.length + 1}`}
                placeholderTextColor={Colors.textFaint}
                value={newPlayerName}
                onChangeText={setNewPlayerName}
                maxLength={20}
              />
              <Button label="Add" onPress={() => { addPlayer(); }} size="sm" />
            </View>

            <Label style={{ marginTop: Spacing.md }}>Players</Label>
            {players.map(p => (
              <View key={p.id} style={s.playerRow}>
                <View style={[s.colorDot, { backgroundColor: p.color }]} />
                <Text style={s.playerRowName}>{p.name}</Text>
                {players.length > 1 && (
                  <TouchableOpacity onPress={() => removePlayer(p.id)} style={s.removeBtn}>
                    <Text style={s.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <Button
              label="Done"
              onPress={() => setSettingsOpen(false)}
              fullWidth
              style={{ marginTop: Spacing.lg }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGold,
  },
  topBarTitle: { fontFamily: 'Georgia', fontSize: 16, color: Colors.gold },
  topBarActions: { flexDirection: 'row', gap: 8 },
  topBarBtn: {
    width: 36, height: 36, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  topBarBtnText: { fontSize: 16, color: Colors.textMuted },

  commanderBanner: {
    backgroundColor: Colors.redGlow,
    borderBottomWidth: 1,
    borderBottomColor: Colors.formatCommander,
    paddingVertical: 5,
    paddingHorizontal: Spacing.lg,
  },
  commanderBannerText: {
    ...Typography.labelSM,
    color: Colors.redLight,
    textAlign: 'center',
    letterSpacing: 1.5,
  },

  podSetupBanner: {
    backgroundColor: Colors.goldGlow,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGold,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  podSetupTitle: {
    ...Typography.labelSM,
    color: Colors.gold,
    letterSpacing: 1.2,
  },
  podSetupSub: {
    ...Typography.bodySM,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },

  matchupSetupBanner: {
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.blueLight,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },

  commanderGrid: {
    flex: 1,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  commanderGridRow: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cmdrGridCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  cmdrGridName: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  cmdrGridLife: {
    fontFamily: 'Georgia',
    fontSize: 46,
    lineHeight: 50,
    marginBottom: 4,
  },
  cmdrGridBtnRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 6,
  },
  cmdrGridBtn: {
    flex: 1,
    height: 30,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cmdrGridBtnMinus: { borderColor: Colors.redLight, backgroundColor: Colors.redGlow },
  cmdrGridBtnPlus: { borderColor: Colors.greenLight, backgroundColor: Colors.greenGlow },
  cmdrGridBtnText: { fontSize: 12, fontWeight: '700', color: Colors.text },
  cmdrGridCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 5,
  },
  cmdrGridCounterVal: {
    fontFamily: 'Georgia',
    fontSize: 12,
    color: Colors.text,
    minWidth: 28,
    textAlign: 'center',
  },
  cmdrGridCounterDivider: {
    width: 1,
    height: 14,
    backgroundColor: Colors.border,
    marginHorizontal: 2,
  },

  cmdrGridDmgSection: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 4,
  },
  cmdrGridDmgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    gap: 4,
  },
  cmdrGridDmgName: {
    flex: 1,
    fontSize: 9,
    fontWeight: '600',
  },
  cmdrGridDmgBtn: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cmdrGridDmgBtnText: { fontSize: 14, color: Colors.textMuted, lineHeight: 16 },
  cmdrGridDmgVal: {
    fontFamily: 'Georgia',
    fontSize: 14,
    color: Colors.text,
    minWidth: 20,
    textAlign: 'center',
  },
  cmdrGridDmgLethal: { fontSize: 10 },

  container: { padding: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.md },
  containerCompact: { padding: Spacing.sm },
  lifeCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1.5,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  playerCardName: {
    ...Typography.label,
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  lifeTotal: {
    fontFamily: 'Georgia',
    fontSize: 88,
    lineHeight: 96,
    marginBottom: Spacing.md,
  },
  bigBtnRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  bigBtn: {
    width: 62, height: 54, borderRadius: Radius.md,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  bigBtnMinus: { borderColor: Colors.redLight, backgroundColor: Colors.redGlow },
  bigBtnPlus: { borderColor: Colors.greenLight, backgroundColor: Colors.greenGlow },
  bigBtnText: { fontSize: 18, fontWeight: '700', color: Colors.text },
  countersRow: { flexDirection: 'row', gap: Spacing.lg },
  counterBox: { alignItems: 'center' },
  counterLabel: { ...Typography.labelSM, marginBottom: 4 },
  counterBtns: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  counterBtn: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  counterBtnText: { fontSize: 16, color: Colors.textMuted },
  counterVal: { fontFamily: 'Georgia', fontSize: 18, color: Colors.text, minWidth: 22, textAlign: 'center' },
  dangerBanner: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.redGlow,
    borderWidth: 1,
    borderColor: Colors.redLight,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  dangerBannerText: { ...Typography.labelSM, color: Colors.redLight, fontSize: 9 },
  dangerAlert: { position: 'absolute', top: 8, right: 8, fontSize: 16 },

  // Commander damage section
  cmdrSection: {
    width: '100%',
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  cmdrSectionLabel: { ...Typography.labelSM, color: Colors.redLight, marginBottom: Spacing.xs, letterSpacing: 1.5, fontSize: 9 },
  cmdrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: Spacing.sm,
  },
  cmdrOppName: { ...Typography.bodySM, flex: 1 },
  cmdrBtn: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cmdrBtnText: { fontSize: 16, color: Colors.textMuted, lineHeight: 18 },
  cmdrDmgVal: {
    fontFamily: 'Georgia',
    fontSize: 18,
    color: Colors.text,
    minWidth: 30,
    textAlign: 'center',
  },
  cmdrLethal: { ...Typography.labelSM, color: Colors.redLight, fontSize: 9 },

  compactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  compactCard: {
    width: '47%',
    backgroundColor: Colors.bgCard,
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    minHeight: 130,
    justifyContent: 'center',
  },
  compactName: { ...Typography.labelSM, marginBottom: 4, textAlign: 'center' },
  compactLife: { fontFamily: 'Georgia', fontSize: 48, lineHeight: 52 },
  compactCmdrTotal: { ...Typography.labelSM, color: Colors.redLight, fontSize: 10 },
  compactBtns: { flexDirection: 'row', gap: 10, marginTop: Spacing.sm },
  microBtn: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  microMinus: { fontSize: 20, color: Colors.redLight, lineHeight: 22 },
  microPlus: { fontSize: 20, color: Colors.greenLight, lineHeight: 22 },

  modalOverlay: { flex: 1, backgroundColor: Colors.bgOverlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.bgCard,
    borderTopWidth: 1, borderTopColor: Colors.borderGold,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.xl, paddingBottom: Spacing.xxxl,
    maxHeight: '90%',
  },
  modalTitle: { fontFamily: 'Georgia', fontSize: 18, color: Colors.gold, marginBottom: 4 },
  settingLabel: { ...Typography.bodyMD, fontWeight: '600', color: Colors.text },
  settingDesc: { ...Typography.bodySM, color: Colors.textMuted, marginTop: 2, maxWidth: '85%' },
  lifeOptions: { flexDirection: 'row', gap: Spacing.sm },
  addRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  nameInput: {
    flex: 1,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, padding: Spacing.sm,
    color: Colors.text, fontSize: 14,
  },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  playerRowName: { ...Typography.bodyMD, flex: 1 },
  removeBtn: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1, borderColor: Colors.redLight, alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { color: Colors.redLight, fontSize: 12 },
});
