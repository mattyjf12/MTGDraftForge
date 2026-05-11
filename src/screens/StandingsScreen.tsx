// StandingsScreen.tsx
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { Card, EmptyState, Divider, MTGColorPips } from '../components/UI';
import { useApp } from '../services/AppContext';
import { computeStandings } from '../utils/tournament';
import { RoomsStackParams } from '../navigation/RootNavigator';

type Route = RouteProp<RoomsStackParams, 'Standings'>;

const MEDALS = ['🥇', '🥈', '🥉'];

export function StandingsScreen() {
  const route = useRoute<Route>();
  const { state } = useApp();
  const room = state.rooms.find(r => r.id === route.params.roomId);

  if (!room) return <SafeAreaView style={s.safe}><EmptyState icon="❓" title="Room not found" /></SafeAreaView>;

  const standings = computeStandings(room);

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.container}>
        {/* Header row */}
        <View style={s.headerRow}>
          <Text style={[s.headerCell, { width: 32 }]}>#</Text>
          <Text style={[s.headerCell, { flex: 1 }]}>Player</Text>
          <Text style={[s.headerCell, { width: 32 }]}>W</Text>
          <Text style={[s.headerCell, { width: 32 }]}>L</Text>
          <Text style={[s.headerCell, { width: 40 }]}>LP</Text>
          <Text style={[s.headerCell, { width: 44 }]}>PTS</Text>
        </View>
        <Divider style={{ marginBottom: 4 }} />

        {standings.map((entry, i) => (
          <View key={entry.playerId} style={[s.row, i === 0 && s.rowGold]}>
            <Text style={[s.rank, i === 0 && { color: Colors.gold }, i === 1 && { color: '#aaa' }, i === 2 && { color: Colors.goldDark }]}>
              {MEDALS[i] || `#${entry.rank}`}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.playerName, entry.isEliminated && s.eliminated]}>
                {entry.playerName}
              </Text>
              {entry.isEliminated && <Text style={s.eliminatedTag}>eliminated</Text>}
              {(() => {
                const player = room.players.find(p => p.id === entry.playerId);
                return player?.deckColors && player.deckColors.length > 0
                  ? <MTGColorPips colors={player.deckColors} size="sm" />
                  : null;
              })()}
            </View>
            <Text style={[s.cell, { color: Colors.greenLight, width: 32 }]}>{entry.wins}</Text>
            <Text style={[s.cell, { color: Colors.redLight, width: 32 }]}>{entry.losses}</Text>
            <Text style={[s.cell, { color: Colors.textMuted, width: 40, fontSize: 11 }]}>{entry.totalFinalLife}</Text>
            <Text style={[s.cell, { color: Colors.gold, width: 44, fontWeight: '700' }]}>{entry.matchPoints}</Text>
          </View>
        ))}

        <Divider style={{ marginTop: Spacing.md }} />
        <Text style={s.legend}>W = Wins · L = Losses · LP = Life Points (tiebreaker) · PTS = Match Points (3/win)</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default StandingsScreen;

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginBottom: 6 },
  headerCell: { ...Typography.labelSM, color: Colors.textFaint, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    gap: 4,
  },
  rowGold: { borderColor: Colors.borderGold, backgroundColor: Colors.goldGlow },
  rank: { width: 28, fontSize: 16, textAlign: 'center' },
  playerName: { ...Typography.bodyMD },
  eliminated: { opacity: 0.5, textDecorationLine: 'line-through' },
  eliminatedTag: { ...Typography.labelSM, color: Colors.redLight, marginTop: 1 },
  cell: { ...Typography.bodyMD, textAlign: 'center' },
  legend: { ...Typography.bodySM, color: Colors.textFaint, textAlign: 'center', lineHeight: 20 },
});
