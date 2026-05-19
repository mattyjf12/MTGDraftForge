// SeatingScreen.tsx
import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { Button, Card, EmptyState, Divider } from '../components/UI';
import { useApp } from '../services/AppContext';
import { RoomsStackParams } from '../navigation/RootNavigator';

type Route = RouteProp<RoomsStackParams, 'Seating'>;

export default function SeatingScreen() {
  const route = useRoute<Route>();
  const { state, dispatch } = useApp();
  const room = state.rooms.find(r => r.id === route.params.roomId);

  if (!room) return <SafeAreaView style={s.safe}><EmptyState icon="❓" title="Room not found" /></SafeAreaView>;

  function randomize() {
    dispatch({ type: 'RANDOMIZE_SEATING', roomId: room!.id });
  }

  const seats = room.seating?.seats || [];
  const n = seats.length;
  const cx = 160, cy = 160, r = 110;

  // Snake draft order: rounds 1,3,5… go 1→N; rounds 2,4,6… go N→1
  // For a typical 3-pack draft with N players there are N*3 picks total
  const snakeDraft = useMemo(() => {
    if (n === 0) return [];
    const PACKS = 3;
    const picks: { pick: number; seat: number; pack: number; direction: string }[] = [];
    let pick = 1;
    for (let pack = 1; pack <= PACKS; pack++) {
      const forward = pack % 2 === 1; // odd packs left→right, even right→left
      const order = forward ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
      for (const idx of order) {
        picks.push({ pick, seat: idx + 1, pack, direction: forward ? '→' : '←' });
        pick++;
      }
    }
    return picks;
  }, [n]);

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.container}>
        <Card>
          <Text style={s.desc}>Randomize seating positions for the draft pod. Pass packs clockwise from seat 1.</Text>
          <Button label="🎲 Randomize Seats" onPress={randomize} fullWidth />
        </Card>

        {seats.length > 0 && (
          <>
            {/* Circular table diagram */}
            <Card style={{ alignItems: 'center' }}>
              <Text style={s.sectionTitle}>Table Layout</Text>
              <Svg width={320} height={320} viewBox="0 0 320 320">
                {/* Table circle */}
                <Circle cx={cx} cy={cy} r={55} fill={Colors.bgSurface} stroke={Colors.borderGold} strokeWidth={1.5} />
                <SvgText
                  x={cx} y={cy + 5}
                  textAnchor="middle"
                  fontSize={11}
                  fill={Colors.gold}
                  fontFamily="System"
                >
                  TABLE
                </SvgText>

                {/* Player seats */}
                {seats.map((playerId, i) => {
                  const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
                  const x = cx + r * Math.cos(angle);
                  const y = cy + r * Math.sin(angle);
                  const player = room.players.find(p => p.id === playerId);
                  const name = player?.name || '?';
                  const shortName = name.length > 6 ? name.slice(0, 6) + '…' : name;

                  return (
                    <React.Fragment key={playerId}>
                      <Circle cx={x} cy={y} r={26} fill={Colors.bgCard} stroke={Colors.borderGold} strokeWidth={1.5} />
                      <SvgText x={x} y={y - 4} textAnchor="middle" fontSize={10} fill={Colors.gold} fontFamily="System" fontWeight="700">
                        {i + 1}
                      </SvgText>
                      <SvgText x={x} y={y + 9} textAnchor="middle" fontSize={8} fill={Colors.textMuted} fontFamily="System">
                        {shortName}
                      </SvgText>
                    </React.Fragment>
                  );
                })}
              </Svg>
            </Card>

            {/* Seat list */}
            <Card>
              <Text style={s.sectionTitle}>Seat Assignments</Text>
              {seats.map((playerId, i) => {
                const player = room.players.find(p => p.id === playerId);
                return (
                  <View key={playerId} style={s.seatRow}>
                    <View style={s.seatNum}>
                      <Text style={s.seatNumText}>{i + 1}</Text>
                    </View>
                    <Text style={s.seatName}>{player?.name || 'Unknown'}</Text>
                    {i === 0 && (
                      <View style={s.firstTag}>
                        <Text style={s.firstTagText}>FIRST PICK</Text>
                      </View>
                    )}
                  </View>
                );
              })}
              <Divider />
              <Text style={s.hint}>Packs pass clockwise (Seat 1 → 2 → 3 → … → {n} → 1)</Text>
            </Card>

            {/* Snake draft pick order */}
            <Card>
              <Text style={s.sectionTitle}>🐍 Pick Order (3-Pack Snake)</Text>
              <Text style={[s.hint, { marginBottom: Spacing.sm }]} numberOfLines={2}>
                Odd packs pass left (→), even packs pass right (←). Each row = one pick.
              </Text>
              {[1, 2, 3].map(pack => {
                const packPicks = snakeDraft.filter(p => p.pack === pack);
                const direction = pack % 2 === 1 ? '→' : '←';
                return (
                  <View key={pack} style={s.packSection}>
                    <Text style={s.packLabel}>Pack {pack} {direction}</Text>
                    <View style={s.pickGrid}>
                      {packPicks.map(({ pick, seat }) => {
                        const player = room.players.find(p => p.id === seats[seat - 1]);
                        return (
                          <View key={pick} style={s.pickCell}>
                            <Text style={s.pickNum}>#{pick}</Text>
                            <Text style={s.pickSeat}>Seat {seat}</Text>
                            <Text style={s.pickName} numberOfLines={1}>{player?.name ?? '?'}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  desc: { ...Typography.bodySM, color: Colors.textMuted, marginBottom: Spacing.md, lineHeight: 20 },
  sectionTitle: { ...Typography.label, marginBottom: Spacing.sm },
  seatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  seatNum: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1, borderColor: Colors.borderGold,
    alignItems: 'center', justifyContent: 'center',
  },
  seatNumText: { fontSize: 13, color: Colors.gold, fontWeight: '700' },
  seatName: { ...Typography.bodyMD, flex: 1 },
  firstTag: {
    backgroundColor: Colors.goldGlow,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  firstTagText: { ...Typography.labelGold, fontSize: 9 },
  hint: { ...Typography.bodySM, color: Colors.textFaint, textAlign: 'center', marginTop: 4 },
  packSection: { marginBottom: Spacing.md },
  packLabel: { ...Typography.label, color: Colors.gold, marginBottom: Spacing.xs },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  pickCell: {
    width: 70,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    padding: 6,
    alignItems: 'center',
  },
  pickNum: { fontFamily: 'Georgia', fontSize: 15, color: Colors.gold },
  pickSeat: { ...Typography.labelSM, color: Colors.textFaint, marginTop: 1 },
  pickName: { ...Typography.bodySM, color: Colors.textMuted, marginTop: 2 },
});
