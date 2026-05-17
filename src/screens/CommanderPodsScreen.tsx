// CommanderPodsScreen.tsx
// Shows Commander tournament pods for the current round.
// The host can log each pod's placement order (1st → 4th).
// Top-2 from every pod automatically advance to the next round.
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { Button, Card, Row, Divider, Badge } from '../components/UI';
import { useApp } from '../services/AppContext';
import { patchCommanderPodResult } from '../services/firebase';
import { CommanderPod, CommanderPodResult } from '../utils/types';
import { RoomsStackParams } from '../navigation/RootNavigator';
import { haptic } from '../components/UI';

type Nav = NativeStackNavigationProp<RoomsStackParams>;
type RouteT = RouteProp<RoomsStackParams, 'CommanderPods'>;

// ── Placement drag-and-drop (simplified: tap to cycle) ───────────────────────

const PLACEMENTS = ['🥇', '🥈', '🥉', '4️⃣'];

function PodCard({
  pod,
  playerNames,
  isOwner,
  currentUserId,
  isFinal,
  onLogResult,
}: {
  pod: CommanderPod;
  playerNames: Record<string, string>;
  isOwner: boolean;
  currentUserId: string;
  isFinal: boolean;
  onLogResult: (podId: string, results: CommanderPodResult[]) => void;
}) {
  // Local placement ordering — tapping a player cycles their placement
  const [order, setOrder] = useState<string[]>(pod.playerIds);

  const isDone = !!pod.results;
  const advanceCount = isFinal ? 1 : 2;
  const canLog = isOwner || pod.playerIds.includes(currentUserId);

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...order];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setOrder(next);
    haptic('impactLight');
  }

  function moveDown(idx: number) {
    if (idx >= order.length - 1) return;
    const next = [...order];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setOrder(next);
    haptic('impactLight');
  }

  function handleLog() {
    const names = order.slice(0, advanceCount).map(id => playerNames[id] ?? id).join(' & ');
    Alert.alert(
      'Confirm Pod Result',
      `Advance ${names} to the next round?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            const results: CommanderPodResult[] = order.map((id, i) => ({
              playerId: id,
              placement: i + 1,
              finalLife: 0, // life isn't tracked here; can be improved
            }));
            onLogResult(pod.id, results);
          },
        },
      ],
    );
  }

  const borderColor = isDone ? Colors.border : Colors.borderGold;

  return (
    <Card style={{ borderColor, marginBottom: Spacing.md }}>
      <Row between style={{ marginBottom: Spacing.sm }}>
        <Text style={s.podTitle}>Pod {pod.podIndex + 1}</Text>
        {isDone
          ? <Badge label="DONE" variant="green" />
          : <Badge label={`Round ${pod.round}`} variant="blue" />}
      </Row>

      {isDone ? (
        // Show final placement
        pod.results!.map((res, i) => (
          <Row key={res.playerId} style={s.placementRow}>
            <Text style={s.placementEmoji}>{PLACEMENTS[i] ?? `${i + 1}.`}</Text>
            <Text style={[s.placementName, i < advanceCount && { color: Colors.greenLight }]}>
              {playerNames[res.playerId] ?? res.playerId}
            </Text>
            {i < advanceCount && <Text style={s.advanceBadge}>ADVANCES</Text>}
          </Row>
        ))
      ) : (
        // Drag-to-order placement UI
        <>
          <Text style={s.hint}>Tap ▲ ▼ to rank players from 1st → last, then log the result</Text>
          <Divider />
          {order.map((id, idx) => (
            <Row key={id} style={s.orderRow} between>
              <Row style={{ gap: Spacing.sm }}>
                <Text style={s.posNum}>{PLACEMENTS[idx] ?? `${idx + 1}.`}</Text>
                <Text style={[s.orderName, idx < advanceCount && s.advanceText]}>
                  {playerNames[id] ?? id}
                </Text>
                {idx < advanceCount && (
                  <View style={s.advanceTag}><Text style={s.advanceTagText}>ADVANCE</Text></View>
                )}
              </Row>
              <View style={s.arrows}>
                <TouchableOpacity
                  onPress={() => moveUp(idx)}
                  disabled={idx === 0}
                  style={[s.arrowBtn, idx === 0 && s.arrowDisabled]}
                  accessibilityLabel="Move up"
                >
                  <Text style={s.arrowText}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveDown(idx)}
                  disabled={idx >= order.length - 1}
                  style={[s.arrowBtn, idx >= order.length - 1 && s.arrowDisabled]}
                  accessibilityLabel="Move down"
                >
                  <Text style={s.arrowText}>▼</Text>
                </TouchableOpacity>
              </View>
            </Row>
          ))}
          {canLog && (
            <Button
              label={`Log Result — ${order.slice(0, advanceCount).map(id => playerNames[id]).join(' & ')} advance`}
              onPress={handleLog}
              variant="gold"
              size="sm"
              fullWidth
              style={{ marginTop: Spacing.md }}
            />
          )}
        </>
      )}
    </Card>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CommanderPodsScreen() {
  const { state, dispatch } = useApp();
  const route = useRoute<RouteT>();
  const navigation = useNavigation<Nav>();
  const { roomId } = route.params;

  const room = state.rooms.find(r => r.id === roomId);

  if (!room || !room.commanderPods) {
    return (
      <SafeAreaView style={s.safe}>
        <Text style={s.empty}>No commander pods found.</Text>
      </SafeAreaView>
    );
  }

  const isOwner = room.ownerId === state.currentUserId;
  const playerNames: Record<string, string> = {};
  room.players.forEach(p => { playerNames[p.id] = p.name; });

  // Show only current round pods
  const maxRound = Math.max(...room.commanderPods.map(p => p.round));
  const currentRoundPods = room.commanderPods.filter(p => p.round === maxRound);
  const allRounds = [...new Set(room.commanderPods.map(p => p.round))].sort((a, b) => a - b);

  function handleLogResult(podId: string, results: CommanderPodResult[]) {
    dispatch({ type: 'LOG_COMMANDER_POD_RESULT', roomId, podId, results });
    patchCommanderPodResult(roomId, podId, results);
    haptic('notificationSuccess');
  }

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.container}>
        {/* Round header */}
        <View style={s.roundHeader}>
          <Text style={s.roundTitle}>
            {currentRoundPods.every(p => !!p.results)
              ? room.status === 'completed' ? '🏆 Tournament Complete' : `Round ${maxRound} Complete`
              : `Round ${maxRound} — ${currentRoundPods.length} Pod${currentRoundPods.length !== 1 ? 's' : ''}`}
          </Text>
          {allRounds.length > 1 && (
            <Text style={s.roundSub}>
              {allRounds.map(r => `R${r}`).join(' → ')}
            </Text>
          )}
        </View>

        {/* Advancing players banner (if round complete and not final) */}
        {currentRoundPods.every(p => !!p.results) && room.status !== 'completed' && (() => {
          const nextRound = maxRound + 1;
          const nextPods = room.commanderPods!.filter(p => p.round === nextRound);
          if (nextPods.length === 0) return null;
          const advancingIds = nextPods.flatMap(p => p.playerIds);
          return (
            <Card style={s.advanceBanner}>
              <Text style={s.advanceBannerTitle}>⚡ Round {nextRound} Pods Generated</Text>
              <Text style={s.advanceBannerSub}>
                {advancingIds.map(id => playerNames[id]).join(', ')}
              </Text>
            </Card>
          );
        })()}

        {/* Tournament complete */}
        {room.status === 'completed' && currentRoundPods.every(p => !!p.results) && (() => {
          const winner = currentRoundPods[0]?.results?.find(r => r.placement === 1);
          return (
            <Card gold style={s.championCard}>
              <Text style={s.champEmoji}>👑</Text>
              <Text style={s.champTitle}>Champion</Text>
              <Text style={s.champName}>{winner ? playerNames[winner.playerId] ?? 'Unknown' : '—'}</Text>
            </Card>
          );
        })()}

        {/* Current round pods */}
        <Text style={s.sectionLabel}>
          {currentRoundPods.every(p => !!p.results)
            ? `Round ${maxRound} Results`
            : 'Active Pods'}
        </Text>
        {currentRoundPods.map(pod => (
          <PodCard
            key={pod.id}
            pod={pod}
            playerNames={playerNames}
            isOwner={isOwner}
            currentUserId={state.currentUserId}
            isFinal={currentRoundPods.length === 1}
            onLogResult={handleLogResult}
          />
        ))}

        {/* Past rounds (collapsed view) */}
        {allRounds.filter(r => r < maxRound).reverse().map(roundNum => {
          const pods = room.commanderPods!.filter(p => p.round === roundNum);
          return (
            <View key={roundNum}>
              <Text style={[s.sectionLabel, { color: Colors.textMuted }]}>
                Round {roundNum} (completed)
              </Text>
              {pods.map(pod => (
                <PodCard
                  key={pod.id}
                  pod={pod}
                  playerNames={playerNames}
                  isOwner={false}
                  currentUserId={state.currentUserId}
                  isFinal={pods.length === 1}
                  onLogResult={() => {}}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  empty: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', marginTop: 80 },

  roundHeader: { alignItems: 'center', marginBottom: Spacing.lg },
  roundTitle: { fontFamily: 'Georgia', fontSize: 20, color: Colors.gold, textAlign: 'center' },
  roundSub: { ...Typography.bodySM, color: Colors.textMuted, marginTop: 4, letterSpacing: 2 },

  sectionLabel: { ...Typography.labelGold, fontSize: 10, marginBottom: Spacing.sm, marginTop: Spacing.md },

  podTitle: { fontFamily: 'Georgia', fontSize: 16, color: Colors.text },
  hint: { ...Typography.bodySM, color: Colors.textMuted, marginBottom: Spacing.sm },

  // Placement display (completed)
  placementRow: { paddingVertical: 6, gap: Spacing.sm },
  placementEmoji: { fontSize: 20, width: 28 },
  placementName: { ...Typography.bodyMD, flex: 1, color: Colors.text },
  advanceBadge: { ...Typography.labelSM, color: Colors.greenLight, fontSize: 9 },

  // Ordering UI (pending)
  orderRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  posNum: { fontSize: 18, width: 28 },
  orderName: { ...Typography.bodyMD, color: Colors.textMuted },
  advanceText: { color: Colors.text },
  advanceTag: {
    backgroundColor: Colors.greenGlow,
    borderWidth: 1,
    borderColor: Colors.greenLight,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  advanceTagText: { ...Typography.labelSM, color: Colors.greenLight, fontSize: 8 },
  arrows: { flexDirection: 'row', gap: 10 },
  arrowBtn: {
    width: 40, height: 40, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.borderGold,
    backgroundColor: Colors.bgCard,
    alignItems: 'center', justifyContent: 'center',
  },
  arrowDisabled: { opacity: 0.25, borderColor: Colors.border },
  arrowText: { fontSize: 16, color: Colors.gold },

  // Banners
  advanceBanner: { marginBottom: Spacing.md },
  advanceBannerTitle: { ...Typography.bodyMD, color: Colors.blueLight, fontWeight: '600', marginBottom: 4 },
  advanceBannerSub: { ...Typography.bodySM, color: Colors.textMuted },
  championCard: { alignItems: 'center', paddingVertical: Spacing.xl, marginBottom: Spacing.md },
  champEmoji: { fontSize: 48 },
  champTitle: { ...Typography.labelGold, marginTop: Spacing.sm },
  champName: { fontFamily: 'Georgia', fontSize: 26, color: Colors.gold, marginTop: 4 },
});
