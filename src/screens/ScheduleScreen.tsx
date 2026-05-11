// ScheduleScreen.tsx
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, getSuggestedFormat } from '../theme';
import { Card, EmptyState, Badge, Divider } from '../components/UI';
import { useApp } from '../services/AppContext';
import { generateRoundRobinSchedule, generateMultiGameRRSchedule } from '../utils/tournament';
import { RoomsStackParams } from '../navigation/RootNavigator';
import { BracketMatch } from '../utils/types';

type Route = RouteProp<RoomsStackParams, 'Schedule'>;

export default function ScheduleScreen() {
  const route = useRoute<Route>();
  const { state } = useApp();
  const room = state.rooms.find(r => r.id === route.params.roomId);

  if (!room) return <SafeAreaView style={s.safe}><EmptyState icon="❓" title="Room not found" /></SafeAreaView>;

  const effectiveFmt = room.format === 'suggested' ? getSuggestedFormat(room.players.length) : room.format;

  function getPlayerName(id: string | null): string {
    if (!id) return 'TBD';
    return room.players.find(p => p.id === id)?.name || 'Unknown';
  }

  // Build schedule data
  let scheduleRounds: Array<{ label: string; matches: Array<{ p1: string; p2: string; status: string; winner?: string }> }> = [];

  if (effectiveFmt === 'round_robin') {
    const pairings = generateRoundRobinSchedule(room.players);
    const results = room.rrResults || {};
    const getRRKeyLocal = (a: string, b: string) => [a, b].sort().join('|');

    scheduleRounds = pairings.map((round, i) => ({
      label: `Round ${i + 1}`,
      matches: round.map(([p1id, p2id]) => {
        const key = getRRKeyLocal(p1id, p2id);
        const res = results[key];
        return {
          p1: getPlayerName(p1id),
          p2: getPlayerName(p2id),
          status: res ? 'complete' : 'pending',
          winner: res ? getPlayerName(res.winnerId) : undefined,
        };
      }),
    }));
  } else if (effectiveFmt === 'two_phase' && room.phase === 1) {
    // Multi-game RR schedule for two_phase Phase 1
    const gamesCount = room.settings.rrGamesCount ?? 1;
    const baseRounds = room.players.length % 2 === 0
      ? room.players.length - 1
      : room.players.length;
    const multiSchedule = generateMultiGameRRSchedule(room.players, gamesCount);
    const results = room.rrResults || {};

    scheduleRounds = multiSchedule.map((round, ri) => {
      const gameNum = Math.floor(ri / baseRounds) + 1;
      const roundNum = (ri % baseRounds) + 1;
      const label = gamesCount > 1
        ? `Game ${gameNum}/${gamesCount} · Round ${roundNum}`
        : `Round ${roundNum}`;
      return {
        label,
        matches: round.map(({ p1id, p2id, gameKey }) => {
          const res = results[gameKey];
          return {
            p1: getPlayerName(p1id),
            p2: getPlayerName(p2id),
            status: res ? 'complete' : 'pending',
            winner: res ? getPlayerName(res.winnerId) : undefined,
          };
        }),
      };
    });
  } else if (effectiveFmt === 'two_phase' && room.phase === 2) {
    // Phase 2: seeded elimination — handled by the bracket block below
  } else if (effectiveFmt === 'mtga') {
    scheduleRounds = [{
      label: 'MTGA Format',
      matches: room.players.map(p => ({
        p1: p.name,
        p2: '',
        status: 'ongoing',
      })),
    }];
  }

  if (scheduleRounds.length === 0 && room.bracket && room.bracket.length > 0) {
    // Group bracket matches by round
    const bracketMatches = room.bracket.filter((m: BracketMatch) => m.bracket === 'winners' || m.bracket === 'grand_final');
    const rounds: Record<number, BracketMatch[]> = {};
    bracketMatches.forEach((m: BracketMatch) => {
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round].push(m);
    });

    const roundNums = Object.keys(rounds).map(Number).sort();
    const total = roundNums.length;

    scheduleRounds = roundNums.map((rn, ri) => {
      const remaining = total - ri;
      let label = `Round ${ri + 1}`;
      if (remaining === 1) label = 'Final';
      else if (remaining === 2) label = 'Semifinals';
      else if (remaining === 3) label = 'Quarterfinals';

      return {
        label,
        matches: rounds[rn]
          .filter((m: BracketMatch) => !m.isBye && (m.player1Id || m.player2Id))
          .map((m: BracketMatch) => ({
            p1: getPlayerName(m.player1Id),
            p2: getPlayerName(m.player2Id),
            status: m.result?.winnerId ? 'complete' : 'pending',
            winner: m.result?.winnerId ? getPlayerName(m.result.winnerId) : undefined,
          })),
      };
    }).filter(r => r.matches.length > 0);
  }

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.container}>
        {scheduleRounds.length === 0 ? (
          <EmptyState icon="📅" title="No schedule yet" subtitle="Start the tournament to generate pairings" />
        ) : (
          scheduleRounds.map((round, ri) => (
            <View key={ri} style={{ marginBottom: Spacing.lg }}>
              <Text style={s.roundLabel}>{round.label}</Text>
              <Card>
                {round.matches.map((match, mi) => (
                  <View key={mi}>
                    <View style={s.matchRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.playerText, match.winner === match.p1 && { color: Colors.gold }]}>
                          {match.p1}
                        </Text>
                        {match.p2 ? (
                          <>
                            <Text style={s.vsText}>vs</Text>
                            <Text style={[s.playerText, match.winner === match.p2 && { color: Colors.gold }]}>
                              {match.p2}
                            </Text>
                          </>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Badge
                          label={match.status === 'complete' ? 'Done' : match.status === 'ongoing' ? 'Live' : 'Pending'}
                          variant={match.status === 'complete' ? 'green' : match.status === 'ongoing' ? 'gold' : 'muted'}
                        />
                        {match.winner && (
                          <Text style={s.winnerText}>🏆 {match.winner}</Text>
                        )}
                      </View>
                    </View>
                    {mi < round.matches.length - 1 && <Divider style={{ marginVertical: 8 }} />}
                  </View>
                ))}
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  roundLabel: {
    fontFamily: 'Georgia',
    fontSize: 16,
    color: Colors.gold,
    marginBottom: Spacing.sm,
    letterSpacing: 0.5,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  playerText: { ...Typography.bodyMD },
  vsText: { ...Typography.bodySM, color: Colors.textFaint, marginVertical: 2, marginLeft: 4 },
  winnerText: { ...Typography.bodySM, color: Colors.gold },
});
