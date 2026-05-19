// ScheduleScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, getSuggestedFormat } from '../theme';
import { Card, EmptyState, Badge, Divider, Label, Button, Row, MTGColorPips } from '../components/UI';
import { useApp } from '../services/AppContext';
import { generateRoundRobinSchedule, generateMultiGameRRSchedule, generateFixedGamesSchedule, getRRKey } from '../utils/tournament';
import { RoomsStackParams } from '../navigation/RootNavigator';
import { BracketMatch, RRResult, Bo3GameResult } from '../utils/types';

function getBo3Record(games: Bo3GameResult[], winnerId: string): string {
  const wWins = games.filter(g => g.winnerId === winnerId).length;
  const lWins = games.length - wWins;
  return `${wWins}-${lWins}`;
}

type Route = RouteProp<RoomsStackParams, 'Schedule'>;

export default function ScheduleScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<any>();
  const { state, dispatch } = useApp();
  const room = state.rooms.find(r => r.id === route.params.roomId);

  if (!room) return <SafeAreaView style={s.safe}><EmptyState icon="❓" title="Room not found" /></SafeAreaView>;

  const effectiveFmt = room.format === 'suggested' ? getSuggestedFormat(room.players.length) : room.format;
  const myName = state.currentUserName;
  const startingLife = room.settings?.startingLife ?? 20;
  const isOwner = room.ownerId === state.currentUserId;

  function getPlayerName(id: string | null): string {
    if (!id) return 'TBD';
    return room.players.find(p => p.id === id)?.name || 'Unknown';
  }

  function handlePlay(p1: string, p2: string) {
    dispatch({
      type: 'SET_PENDING_MATCHUP_CONFIG',
      config: { playerNames: [p1, p2], startingLife },
    });
    navigation.getParent()?.navigate('LifeCounter');
  }

  // Build schedule data
  type ScheduleMatch = {
    p1: string; p2: string;
    p1id?: string; p2id?: string; gameKey?: string;
    status: string; winner?: string;
    myMatch?: boolean; ownerLog?: boolean;
    bo3Record?: string;
    bo3PartialRecord?: string;  // in-progress record before series completes
  };

  type ScheduleRound = { label: string; matches: ScheduleMatch[] };

  const isBo3 = room.settings?.bestOf3 === true;
  const emptyBo3 = () => [{ winnerId: '', life: '' }, { winnerId: '', life: '' }, { winnerId: '', life: '' }];

  const [logModal, setLogModal] = useState<{ p1id: string; p2id: string; gameKey: string } | null>(null);
  const [modalWinnerId, setModalWinnerId] = useState('');
  const [modalWinnerLife, setModalWinnerLife] = useState('');
  const [bo3GameInputs, setBo3GameInputs] = useState<Array<{ winnerId: string; life: string }>>(emptyBo3());

  function openLogModal(p1id: string, p2id: string, gameKey: string) {
    setLogModal({ p1id, p2id, gameKey });
    setModalWinnerId('');
    setModalWinnerLife('');
    setBo3GameInputs(emptyBo3());
  }

  function closeLogModal() {
    setLogModal(null);
    setModalWinnerId('');
    setModalWinnerLife('');
    setBo3GameInputs(emptyBo3());
  }

  function submitLogModal() {
    if (!logModal) return;
    if (isBo3) {
      const filled = bo3GameInputs.filter(g => g.winnerId !== '');
      if (filled.length < 2) { Alert.alert('Log at least 2 games'); return; }
      const scores: Record<string, number> = {};
      filled.forEach(g => { scores[g.winnerId] = (scores[g.winnerId] || 0) + 1; });
      const winnerEntry = Object.entries(scores).find(([, w]) => w >= 2);
      if (!winnerEntry) { Alert.alert('No clear winner', 'One player must win at least 2 games'); return; }
      const [matchWinnerId] = winnerEntry;
      const matchLoserId = matchWinnerId === logModal.p1id ? logModal.p2id : logModal.p1id;
      const deciding = [...filled].reverse().find(g => g.winnerId === matchWinnerId);
      const games: Bo3GameResult[] = filled.map(g => ({ winnerId: g.winnerId, winnerFinalLife: parseInt(g.life) || 0 }));
      dispatch({ type: 'LOG_RR_RESULT', roomId: room.id, result: { player1Id: logModal.p1id, player2Id: logModal.p2id, winnerId: matchWinnerId, loserId: matchLoserId, winnerFinalLife: parseInt(deciding?.life ?? '0') || 0, completedAt: Date.now(), gameKey: logModal.gameKey, games } });
      closeLogModal();
      return;
    }
    if (!modalWinnerId) { Alert.alert('Select a winner'); return; }
    const loserId = modalWinnerId === logModal.p1id ? logModal.p2id : logModal.p1id;
    dispatch({ type: 'LOG_RR_RESULT', roomId: room.id, result: { player1Id: logModal.p1id, player2Id: logModal.p2id, winnerId: modalWinnerId, loserId, winnerFinalLife: parseInt(modalWinnerLife) || 0, completedAt: Date.now(), gameKey: logModal.gameKey } });
    closeLogModal();
  }

  let scheduleRounds: ScheduleRound[] = [];

  if (effectiveFmt === 'round_robin') {
    const pairings = generateRoundRobinSchedule(room.players);
    const results = room.rrResults || {};

    scheduleRounds = pairings.map((round, i) => ({
      label: `Round ${i + 1}`,
      matches: round.map(([p1id, p2id]) => {
        const key = getRRKey(p1id, p2id);
        const res = results[key];
        const p1 = getPlayerName(p1id);
        const p2 = getPlayerName(p2id);
        const isMyMatch = !res && (p1id === state.currentUserId || p2id === state.currentUserId);
        return {
          p1, p2, p1id, p2id, gameKey: key,
          status: res ? 'complete' : 'pending',
          winner: res ? getPlayerName(res.winnerId) : undefined,
          myMatch: isMyMatch,
          ownerLog: isOwner && !res && !isMyMatch,
          bo3Record: res?.games?.length ? getBo3Record(res.games, res.winnerId) : undefined,
          bo3PartialRecord: (() => {
            if (res || !isBo3) return undefined;
            const partial = room.bo3InProgress?.[key] ?? [];
            if (!partial.length) return undefined;
            return `${partial.filter(g => g.winnerId === p1id).length}-${partial.filter(g => g.winnerId === p2id).length}`;
          })(),
        };
      }),
    }));
  } else if (effectiveFmt === 'two_phase' && room.phase === 1) {
    const gamesCount = room.settings.rrGamesCount ?? 1;
    const phase1Mode = room.settings.phase1Mode ?? 'round_robin';
    const results = room.rrResults || {};

    let rawSchedule: Array<Array<{ p1id: string; p2id: string; gameKey: string }>>;
    let makeLabel: (ri: number) => string;

    if (phase1Mode === 'fixed_games') {
      rawSchedule = generateFixedGamesSchedule(room.players, gamesCount);
      makeLabel = (ri) => `Round ${ri + 1}`;
    } else {
      const baseRounds = room.players.length % 2 === 0
        ? room.players.length - 1
        : room.players.length;
      rawSchedule = generateMultiGameRRSchedule(room.players, gamesCount);
      makeLabel = (ri) => gamesCount > 1
        ? `Game ${Math.floor(ri / baseRounds) + 1}/${gamesCount} · Round ${(ri % baseRounds) + 1}`
        : `Round ${ri + 1}`;
    }

    scheduleRounds = rawSchedule.map((round, ri) => ({
      label: makeLabel(ri),
      matches: round.map(({ p1id, p2id, gameKey }) => {
        const res = results[gameKey];
        const p1 = getPlayerName(p1id);
        const p2 = getPlayerName(p2id);
        const isMyMatch = !res && (p1id === state.currentUserId || p2id === state.currentUserId);
        return {
          p1, p2, p1id, p2id, gameKey,
          status: res ? 'complete' : 'pending',
          winner: res ? getPlayerName(res.winnerId) : undefined,
          myMatch: isMyMatch,
          ownerLog: isOwner && !res && !isMyMatch,
          bo3Record: res?.games?.length ? getBo3Record(res.games, res.winnerId) : undefined,
          bo3PartialRecord: (() => {
            if (res || !isBo3) return undefined;
            const partial = room.bo3InProgress?.[gameKey] ?? [];
            if (!partial.length) return undefined;
            return `${partial.filter(g => g.winnerId === p1id).length}-${partial.filter(g => g.winnerId === p2id).length}`;
          })(),
        };
      }),
    }));
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
          .map((m: BracketMatch) => {
            const p1 = getPlayerName(m.player1Id);
            const p2 = getPlayerName(m.player2Id);
            const done = !!m.result?.winnerId;
            const isMyMatch = !done && !!(m.player1Id && m.player2Id) && (m.player1Id === state.currentUserId || m.player2Id === state.currentUserId);
            return {
              p1, p2,
              p1id: m.player1Id ?? undefined,
              p2id: m.player2Id ?? undefined,
              gameKey: m.id,
              status: done ? 'complete' : 'pending',
              winner: done ? getPlayerName(m.result!.winnerId) : undefined,
              myMatch: isMyMatch,
              ownerLog: isOwner && !done && !!(m.player1Id && m.player2Id) && !isMyMatch,
              bo3Record: (done && m.result?.games?.length) ? getBo3Record(m.result.games, m.result.winnerId!) : undefined,
              bo3PartialRecord: (() => {
                if (done || !isBo3 || !m.player1Id || !m.player2Id) return undefined;
                const partial = room.bo3InProgress?.[m.id] ?? [];
                if (!partial.length) return undefined;
                return `${partial.filter(g => g.winnerId === m.player1Id).length}-${partial.filter(g => g.winnerId === m.player2Id).length}`;
              })(),
            };
          }),
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
                        {match.bo3Record && (
                          <Text style={s.bo3RecordText}>{match.bo3Record}</Text>
                        )}
                        {match.bo3PartialRecord && (
                          <Text style={s.bo3PartialRecordText}>{match.bo3PartialRecord} in progress</Text>
                        )}
                        {match.myMatch && match.p2 && (
                          <TouchableOpacity
                            style={s.playBtn}
                            onPress={() => handlePlay(match.p1, match.p2!)}
                          >
                            <Text style={s.playBtnText}>▶ Play</Text>
                          </TouchableOpacity>
                        )}
                        {match.ownerLog && match.p1id && match.p2id && match.gameKey && (
                          <TouchableOpacity
                            style={s.logBtn}
                            onPress={() => openLogModal(match.p1id!, match.p2id!, match.gameKey!)}
                          >
                            <Text style={s.logBtnText}>📝 Log</Text>
                          </TouchableOpacity>
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

      {/* Owner log-result modal */}
      {logModal && (() => {
        const p1 = room.players.find(p => p.id === logModal.p1id);
        const p2 = room.players.find(p => p.id === logModal.p2id);
        return (
          <Modal transparent animationType="slide" onRequestClose={closeLogModal}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
              <View style={s.modalOverlay}>
                <View style={[s.modalCard, { maxHeight: '90%' }]}>
                  <Text style={s.modalTitle}>📝 Log Match Result</Text>
                  <Text style={s.modalMatch}>{p1?.name} vs {p2?.name}</Text>
                  <Divider style={{ marginVertical: Spacing.sm }} />
                  <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                  {isBo3 ? (
                    // BO3: game-by-game entry
                    (() => {
                      const scores: Record<string, number> = {};
                      bo3GameInputs.slice(0, 2).forEach(g => { if (g.winnerId) scores[g.winnerId] = (scores[g.winnerId] || 0) + 1; });
                      const needsGame3 = !!(bo3GameInputs[0].winnerId && bo3GameInputs[1].winnerId && bo3GameInputs[0].winnerId !== bo3GameInputs[1].winnerId);
                      return [0, 1, 2].map(gi => {
                        const isGame3 = gi === 2;
                        const disabled = isGame3 && !needsGame3;
                        const g = bo3GameInputs[gi];
                        return (
                          <View key={gi} style={{ marginBottom: Spacing.md, opacity: disabled ? 0.35 : 1 }}>
                            <Label>Game {gi + 1}{isGame3 && !needsGame3 ? ' (if needed)' : ''}</Label>
                            {[p1, p2].filter(Boolean).map(p => (
                              <TouchableOpacity key={p!.id} disabled={disabled}
                                style={[s.winnerOption, g.winnerId === p!.id && s.winnerOptionSelected]}
                                onPress={() => setBo3GameInputs(prev => prev.map((x, i) => i === gi ? { ...x, winnerId: p!.id } : x))}>
                                <View style={[s.radioCircle, g.winnerId === p!.id && s.radioSelected]}>
                                  {g.winnerId === p!.id && <View style={s.radioInner} />}
                                </View>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={[s.winnerName, g.winnerId === p!.id && { color: Colors.gold }]}>{p!.name}</Text>
                                  <MTGColorPips colors={p?.deckColors ?? []} size="sm" />
                                </View>
                                {g.winnerId === p!.id && <Text style={{ fontSize: 16 }}>🏆</Text>}
                              </TouchableOpacity>
                            ))}
                            <TextInput style={[s.lifeInput, { marginTop: 4 }]} placeholder="Winner's life total" placeholderTextColor={Colors.textFaint} keyboardType="numeric" editable={!disabled} value={g.life}
                              onChangeText={v => setBo3GameInputs(prev => prev.map((x, i) => i === gi ? { ...x, life: v } : x))} />
                          </View>
                        );
                      });
                    })()
                  ) : (
                    // Single game entry
                    <>
                      <Label>Winner</Label>
                      {[p1, p2].filter(Boolean).map(p => (
                        <TouchableOpacity key={p!.id}
                          style={[s.winnerOption, modalWinnerId === p!.id && s.winnerOptionSelected]}
                          onPress={() => setModalWinnerId(p!.id)}>
                          <View style={[s.radioCircle, modalWinnerId === p!.id && s.radioSelected]}>
                            {modalWinnerId === p!.id && <View style={s.radioInner} />}
                          </View>
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[s.winnerName, modalWinnerId === p!.id && { color: Colors.gold }]}>{p!.name}</Text>
                            <MTGColorPips colors={p?.deckColors ?? []} size="sm" />
                          </View>
                          {modalWinnerId === p!.id && <Text style={{ fontSize: 16 }}>🏆</Text>}
                        </TouchableOpacity>
                      ))}
                      <Label style={{ marginTop: Spacing.md }}>Winner's Final Life</Label>
                      <TextInput style={s.lifeInput} placeholder="e.g. 12" placeholderTextColor={Colors.textFaint} keyboardType="numeric" value={modalWinnerLife} onChangeText={setModalWinnerLife} />
                    </>
                  )}

                  </ScrollView>
                  <Row style={{ gap: 10, marginTop: Spacing.lg }}>
                    <Button label="Confirm" onPress={submitLogModal} style={{ flex: 1 }} />
                    <Button label="Cancel" onPress={closeLogModal} variant="outline" style={{ flex: 1 }} />
                  </Row>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        );
      })()}
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
  playBtn: {
    backgroundColor: Colors.goldGlow,
    borderWidth: 1,
    borderColor: Colors.gold,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginTop: 2,
  },
  playBtnText: {
    ...Typography.labelSM,
    color: Colors.gold,
    letterSpacing: 0.8,
  },
  logBtn: {
    backgroundColor: 'rgba(22,160,133,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(22,160,133,0.6)',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginTop: 2,
  },
  logBtnText: {
    ...Typography.labelSM,
    color: 'rgba(22,160,133,1)',
    letterSpacing: 0.8,
  },
  bo3RecordText: {
    fontFamily: 'Georgia',
    fontSize: 13,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  bo3PartialRecordText: {
    fontFamily: 'Georgia',
    fontSize: 11,
    color: Colors.textFaint,
    letterSpacing: 0.5,
    fontStyle: 'italic',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.bgSurface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  modalTitle: {
    fontFamily: 'Georgia',
    fontSize: 18,
    color: Colors.gold,
    marginBottom: 4,
  },
  modalMatch: {
    ...Typography.bodyMD,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  winnerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.sm,
    backgroundColor: Colors.bgDeep,
  },
  winnerOptionSelected: {
    borderColor: Colors.gold,
    backgroundColor: Colors.goldGlow,
  },
  winnerName: {
    ...Typography.bodyMD,
    color: Colors.textMuted,
    flex: 0,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: Colors.gold },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.gold,
  },
  lifeInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: Colors.text,
    fontSize: 16,
    marginTop: Spacing.sm,
    backgroundColor: Colors.bgDeep,
  },
});
