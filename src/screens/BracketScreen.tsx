// BracketScreen.tsx
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Modal, TextInput,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, getSuggestedFormat } from '../theme';
import { Button, Card, Badge, Row, Divider, EmptyState, Label, MTGColorPips } from '../components/UI';
import { useApp } from '../services/AppContext';
import { BracketMatch, Player, RRResult, Bo3GameResult } from '../utils/types';
import { RoomsStackParams } from '../navigation/RootNavigator';
import { getRRKey, generateRoundRobinSchedule, generateMultiGameRRSchedule, generateFixedGamesSchedule, MultiGameRRMatch } from '../utils/tournament';
import { patchBracketMatch, patchMtgaMatchupResult } from '../services/firebase';

type Route = RouteProp<RoomsStackParams, 'Bracket'>;

function getBo3Record(games: Bo3GameResult[], winnerId: string): string {
  const wWins = games.filter(g => g.winnerId === winnerId).length;
  const lWins = games.length - wWins;
  return `${wWins}-${lWins}`;
}

// ── Log Result Modal (elimination bracket) ────────────────────
function LogResultModal({ match, players, onConfirm, onClose, title, isBo3 }: {
  match: BracketMatch;
  players: Player[];
  onConfirm: (winnerId: string, loserId: string, games?: Bo3GameResult[]) => void;
  onClose: () => void;
  title?: string;
  isBo3?: boolean;
}) {
  const [winnerId, setWinnerId] = useState('');
  const emptyBo3 = () => [{ winnerId: '', life: '' }, { winnerId: '', life: '' }, { winnerId: '', life: '' }];
  const [bo3Inputs, setBo3Inputs] = useState<Array<{ winnerId: string; life: string }>>(emptyBo3());

  const p1 = players.find(p => p.id === match.player1Id);
  const p2 = players.find(p => p.id === match.player2Id);

  function handleConfirm() {
    if (isBo3) {
      const filled = bo3Inputs.filter(g => g.winnerId !== '');
      if (filled.length < 2) { Alert.alert('Log at least 2 games'); return; }
      const scores: Record<string, number> = {};
      filled.forEach(g => { scores[g.winnerId] = (scores[g.winnerId] || 0) + 1; });
      const entry = Object.entries(scores).find(([, w]) => w >= 2);
      if (!entry) { Alert.alert('No clear winner', 'One player must win 2 games'); return; }
      const [wId] = entry;
      const lId = wId === match.player1Id ? match.player2Id! : match.player1Id!;
      onConfirm(wId, lId, filled.map(g => ({ winnerId: g.winnerId, winnerFinalLife: parseInt(g.life) || 0 })));
      return;
    }
    if (!winnerId) { Alert.alert('Select a winner'); return; }
    const loserId = winnerId === match.player1Id ? match.player2Id! : match.player1Id!;
    onConfirm(winnerId, loserId);
  }

  const needsGame3 = isBo3 && bo3Inputs[0].winnerId && bo3Inputs[1].winnerId && bo3Inputs[0].winnerId !== bo3Inputs[1].winnerId;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxHeight: '90%' }]}>
          <Text style={styles.modalTitle}>{title ?? '📝 Log Match Result'}</Text>
          <Text style={styles.modalMatch}>{p1?.name} vs {p2?.name}</Text>
          <Divider />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {isBo3 ? (
            [0, 1, 2].map(gi => {
              const disabled = gi === 2 && !needsGame3;
              const g = bo3Inputs[gi];
              return (
                <View key={gi} style={{ marginBottom: Spacing.md, opacity: disabled ? 0.35 : 1 }}>
                  <Label>Game {gi + 1}{gi === 2 && !needsGame3 ? ' (if needed)' : ''}</Label>
                  {[p1, p2].filter(Boolean).map(p => (
                    <TouchableOpacity key={p!.id} disabled={!!disabled}
                      style={[styles.winnerOption, g.winnerId === p!.id && styles.winnerOptionSelected]}
                      onPress={() => setBo3Inputs(prev => prev.map((x, i) => i === gi ? { ...x, winnerId: p!.id } : x))}>
                      <View style={[styles.radioCircle, g.winnerId === p!.id && styles.radioSelected]}>
                        {g.winnerId === p!.id && <View style={styles.radioInner} />}
                      </View>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.winnerName, g.winnerId === p!.id && { color: Colors.gold }, { flex: 0 }]}>{p!.name}</Text>
                        <MTGColorPips colors={p?.deckColors ?? []} size="sm" />
                      </View>
                      {g.winnerId === p!.id && <Text style={{ fontSize: 16 }}>🏆</Text>}
                    </TouchableOpacity>
                  ))}
                  <TextInput style={[styles.lifeInput, { marginTop: 4 }]} placeholder="Winner's life total" placeholderTextColor={Colors.textFaint} keyboardType="numeric" editable={!disabled} value={g.life}
                    onChangeText={v => setBo3Inputs(prev => prev.map((x, i) => i === gi ? { ...x, life: v } : x))} />
                </View>
              );
            })
          ) : (
            <>
              <Label>Winner</Label>
              {[{ p: p1, slot: 'p1' }, { p: p2, slot: 'p2' }].filter(({ p }) => Boolean(p)).map(({ p, slot }) => (
                <TouchableOpacity key={slot}
                  style={[styles.winnerOption, winnerId === p!.id && styles.winnerOptionSelected]}
                  onPress={() => setWinnerId(p!.id)}>
                  <View style={[styles.radioCircle, winnerId === p!.id && styles.radioSelected]}>
                    {winnerId === p!.id && <View style={styles.radioInner} />}
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.winnerName, winnerId === p!.id && { color: Colors.gold }, { flex: 0 }]}>{p!.name}</Text>
                    <MTGColorPips colors={p?.deckColors ?? []} size="sm" />
                  </View>
                  {winnerId === p!.id && <Text style={{ fontSize: 16 }}>🏆</Text>}
                </TouchableOpacity>
              ))}
            </>
          )}
          </ScrollView>
          <Row style={{ gap: 10, marginTop: Spacing.lg }}>
            <Button label="Confirm" onPress={handleConfirm} style={{ flex: 1 }} />
            <Button label="Cancel" onPress={onClose} variant="outline" style={{ flex: 1 }} />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

// ── Elimination bracket ───────────────────────
function EliminationBracket({ roomId }: { roomId: string }) {
  const { state, dispatch } = useApp();
  const navigation = useNavigation<any>();
  const room = state.rooms.find(r => r.id === roomId)!;
  const isOwner = room.ownerId === state.currentUserId;
  const [selectedMatch, setSelectedMatch] = useState<BracketMatch | null>(null);
  const [isOverride, setIsOverride] = useState(false);

  // Build seed map for seeded / two_phase-phase-2 brackets.
  // Both formats store seeds directly on player.seed — seeded format has them
  // from room setup; two_phase phase 2 has them written during ADVANCE_TO_PHASE_2.
  const seedMap: Record<string, number> = {};
  if (room.format === 'seeded' || (room.format === 'two_phase' && room.phase === 2)) {
    room.players.forEach(p => { if (p.seed) seedMap[p.id] = p.seed; });
  }
  const showSeeds = Object.keys(seedMap).length > 0;

  const bracket = room.bracket || [];

  const { rounds, roundNumbers } = useMemo(() => {
    const winnersBracket = bracket.filter(m => m.bracket === 'winners' || m.bracket === 'grand_final');
    const r: Record<number, BracketMatch[]> = {};
    winnersBracket.forEach(m => {
      if (!r[m.round]) r[m.round] = [];
      r[m.round].push(m);
    });
    return { rounds: r, roundNumbers: Object.keys(r).map(Number).sort((a, b) => a - b) };
  }, [bracket]);

  const totalRounds = roundNumbers.length;

  function getRoundLabel(roundIdx: number): string {
    const remaining = totalRounds - roundIdx;
    if (remaining === 1) return '🏆 Final';
    if (remaining === 2) return 'Semifinals';
    if (remaining === 3) return 'Quarterfinals';
    return `Round ${roundIdx + 1}`;
  }

  function handlePlay(p1Name: string, p2Name: string) {
    const startingLife = room.settings?.startingLife ?? 20;
    dispatch({
      type: 'SET_PENDING_MATCHUP_CONFIG',
      config: { playerNames: [p1Name, p2Name], startingLife },
    });
    navigation.getParent()?.navigate('LifeCounter');
  }

  function handleLogResult(winnerId: string, loserId: string, games?: Bo3GameResult[]) {
    if (isOverride) {
      dispatch({ type: 'OVERRIDE_ELIM_RESULT', roomId, matchId: selectedMatch!.id, winnerId, loserId });
      // Full room sync handled by AppProvider state-change effect
    } else {
      dispatch({
        type: 'LOG_ELIM_RESULT',
        roomId,
        matchId: selectedMatch!.id,
        winnerId, loserId,
        winnerLife: 0, loserLife: 0,
        games,
      });
      patchBracketMatch(roomId, selectedMatch!.id, winnerId, loserId, 0, 0);
    }
    setSelectedMatch(null);
    setIsOverride(false);
  }

  return (
    <View>
      {selectedMatch && (
        <LogResultModal
          match={selectedMatch}
          players={room.players}
          onConfirm={handleLogResult}
          onClose={() => { setSelectedMatch(null); setIsOverride(false); }}
          title={isOverride ? '✏️ Override Match Result' : undefined}
          isBo3={!isOverride && (room.settings?.bestOf3 ?? false)}
        />
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.bracketScroll}>
          {roundNumbers.map((roundNum, ri) => (
            <View key={roundNum} style={styles.bracketRound}>
              <Text style={styles.roundLabel}>{getRoundLabel(ri)}</Text>
              {rounds[roundNum].filter(m => !m.isBye).map(match => {
                const p1 = room.players.find(p => p.id === match.player1Id);
                const p2 = room.players.find(p => p.id === match.player2Id);
                const isComplete = !!match.result?.winnerId;

                return (
                  <View key={match.id} style={styles.matchBlock}>
                    <View style={styles.bracketMatchCard}>
                      {[
                        { player: p1, id: match.player1Id, slot: 0 },
                        { player: p2, id: match.player2Id, slot: 1 },
                      ].map(({ player, id, slot }) => {
                        const isWinner = match.result?.winnerId === id;
                        const isLoser = isComplete && !isWinner;
                        const seed = id ? seedMap[id] : undefined;
                        return (
                          <View key={`${match.id}_slot${slot}`} style={[
                            styles.bracketPlayer,
                            isWinner && styles.bracketPlayerWinner,
                            isLoser && styles.bracketPlayerLoser,
                          ]}>
                            {showSeeds && (
                              <Text style={[styles.seedBadge, isWinner && { color: Colors.gold }, isLoser && { color: Colors.textFaint }]}>
                                {seed ? `#${seed}` : '?'}
                              </Text>
                            )}
                            <Text style={[
                              styles.bracketPlayerName,
                              isWinner && { color: Colors.gold },
                              isLoser && { color: Colors.textFaint, textDecorationLine: 'line-through' },
                            ]}>
                              {player?.name || 'TBD'}
                            </Text>
                            {player?.deckColors && player.deckColors.length > 0 && (
                              <MTGColorPips colors={player.deckColors} size="sm" />
                            )}
                            {isWinner && <Text style={{ fontSize: 10 }}>👑</Text>}
                          </View>
                        );
                      })}
                    </View>
                    {isComplete && match.result?.games && match.result.games.length > 0 && (
                      <Text style={styles.bo3RecordTag}>
                        {getBo3Record(match.result.games, match.result.winnerId!)}
                      </Text>
                    )}
                    {!isComplete && (() => {
                      const partial = room.bo3InProgress?.[match.id] ?? [];
                      if (!partial.length) return null;
                      const p1w = partial.filter(g => g.winnerId === match.player1Id).length;
                      const p2w = partial.filter(g => g.winnerId === match.player2Id).length;
                      return <Text style={styles.bo3RecordTag}>{p1w}-{p2w}</Text>;
                    })()}
                    {!isComplete && p1 && p2 && (match.player1Id === state.currentUserId || match.player2Id === state.currentUserId) && (
                      <TouchableOpacity
                        style={[styles.logBtn, styles.playBtn]}
                        onPress={() => handlePlay(p1.name, p2.name)}
                      >
                        <Text style={styles.playBtnText}>▶ PLAY</Text>
                      </TouchableOpacity>
                    )}
                    {!isComplete && p1 && p2 && isOwner && match.player1Id !== state.currentUserId && match.player2Id !== state.currentUserId && (
                      <TouchableOpacity
                        style={styles.logBtn}
                        onPress={() => { setIsOverride(false); setSelectedMatch(match); }}
                      >
                        <Text style={styles.logBtnText}>LOG RESULT</Text>
                      </TouchableOpacity>
                    )}
                    {isComplete && isOwner && (
                      <TouchableOpacity
                        style={[styles.logBtn, styles.overrideBtn]}
                        onPress={() => { setIsOverride(true); setSelectedMatch(match); }}
                      >
                        <Text style={styles.overrideBtnText}>✏️ OVERRIDE</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Round Robin view ──────────────────────────
// isTwoPhase=true uses multi-game keys (gameKey = "p1|p2|N")
// isTwoPhase=false uses simple pair keys (gameKey = "p1|p2")
function RoundRobinBracket({ roomId, isTwoPhase = false }: { roomId: string; isTwoPhase?: boolean }) {
  const { state, dispatch } = useApp();
  const room = state.rooms.find(r => r.id === roomId)!;
  const isOwner = room.ownerId === state.currentUserId;
  const [modal, setModal] = useState<{ p1: Player; p2: Player; gameKey: string } | null>(null);
  const [isOverride, setIsOverride] = useState(false);
  const [winnerId, setWinnerId] = useState('');
  const [winnerLife, setWinnerLife] = useState('');
  const isBo3 = room.settings?.bestOf3 === true;
  const emptyBo3RR = () => [{ winnerId: '', life: '' }, { winnerId: '', life: '' }, { winnerId: '', life: '' }];
  const [bo3GameInputs, setBo3GameInputs] = useState<Array<{ winnerId: string; life: string }>>(emptyBo3RR());

  const results = room.rrResults || {};
  const gamesCount = room.settings.rrGamesCount ?? 1;
  const phase1Mode = room.settings.phase1Mode ?? 'round_robin';

  const playerLifeTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.values(results).forEach(r => {
      totals[r.winnerId] = (totals[r.winnerId] || 0) + r.winnerFinalLife;
    });
    return totals;
  }, [results]);

  // Build a unified schedule where each match has a unique gameKey
  const schedule = useMemo((): Array<{ roundLabel: string; matches: MultiGameRRMatch[] }> => {
    if (isTwoPhase) {
      if (phase1Mode === 'fixed_games') {
        return generateFixedGamesSchedule(room.players, gamesCount).map((round, ri) => ({
          roundLabel: `Round ${ri + 1}`,
          matches: round,
        }));
      }
      const baseRounds = room.players.length % 2 === 0
        ? room.players.length - 1
        : room.players.length;
      return generateMultiGameRRSchedule(room.players, gamesCount).map((round, ri) => ({
        roundLabel: gamesCount > 1
          ? `Game ${Math.floor(ri / baseRounds) + 1}/${gamesCount} · Round ${(ri % baseRounds) + 1}`
          : `Round ${ri + 1}`,
        matches: round,
      }));
    }
    return generateRoundRobinSchedule(room.players).map((round, ri) => ({
      roundLabel: `Round ${ri + 1}`,
      matches: round.map(([p1id, p2id]) => ({
        p1id, p2id, gameKey: getRRKey(p1id, p2id),
      })),
    }));
  }, [room.players, gamesCount, phase1Mode, isTwoPhase]);

  const lifeSummary = useMemo(() =>
    room.players
      .map(p => ({ name: p.name, id: p.id, life: playerLifeTotals[p.id] || 0 }))
      .filter(p => p.life > 0)
      .sort((a, b) => b.life - a.life),
    [room.players, playerLifeTotals],
  );

  function logRRResult() {
    if (!modal) return;

    let finalWinnerId: string;
    let finalWinnerLife: number;
    let games: Bo3GameResult[] | undefined;

    if (isBo3 && !isOverride) {
      const filled = bo3GameInputs.filter(g => g.winnerId !== '');
      if (filled.length < 2) { Alert.alert('Log at least 2 games'); return; }
      const scores: Record<string, number> = {};
      filled.forEach(g => { scores[g.winnerId] = (scores[g.winnerId] || 0) + 1; });
      const entry = Object.entries(scores).find(([, w]) => w >= 2);
      if (!entry) { Alert.alert('No clear winner', 'One player must win 2 games'); return; }
      finalWinnerId = entry[0];
      finalWinnerLife = parseInt(filled[filled.length - 1].life) || 0;
      games = filled.map(g => ({ winnerId: g.winnerId, winnerFinalLife: parseInt(g.life) || 0 }));
    } else {
      if (!winnerId) return;
      finalWinnerId = winnerId;
      finalWinnerLife = parseInt(winnerLife) || 0;
    }

    const loserId = finalWinnerId === modal.p1.id ? modal.p2.id : modal.p1.id;
    const result: RRResult = {
      player1Id: modal.p1.id,
      player2Id: modal.p2.id,
      winnerId: finalWinnerId,
      loserId,
      winnerFinalLife: finalWinnerLife,
      completedAt: Date.now(),
      gameKey: modal.gameKey,
      games,
    };
    // LOG_RR_RESULT overwrites an existing result for the same key, so it
    // doubles as the override action for round-robin matches.
    dispatch({ type: 'LOG_RR_RESULT', roomId, result });
    setModal(null); setWinnerId(''); setWinnerLife(''); setIsOverride(false); setBo3GameInputs(emptyBo3RR());
  }

  return (
    <View>
      {/* Accumulated life summary */}
      {lifeSummary.length > 0 && (
        <View style={styles.lifeSummaryBanner}>
          <Text style={styles.lifeSummaryTitle}>♥ Winner Life Totals</Text>
          <View style={styles.lifeSummaryRow}>
            {lifeSummary.map(p => (
              <View key={p.id} style={styles.lifeSummaryChip}>
                <Text style={styles.lifeSummaryName}>{p.name}</Text>
                <Text style={styles.lifeSummaryNum}>{p.life}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {modal && (
        <Modal transparent animationType="slide" onRequestClose={() => { setModal(null); setIsOverride(false); setBo3GameInputs(emptyBo3RR()); }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxHeight: '90%' }]}>
              <Text style={styles.modalTitle}>{isOverride ? '✏️ Override Match' : '📝 Log Match'}</Text>
              <Text style={styles.modalMatch}>{modal.p1.name} vs {modal.p2.name}</Text>
              <Divider />
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {isBo3 && !isOverride ? (
                (() => {
                  const needsGame3 = bo3GameInputs[0].winnerId && bo3GameInputs[1].winnerId && bo3GameInputs[0].winnerId !== bo3GameInputs[1].winnerId;
                  return [0, 1, 2].map(gi => {
                    const disabled = gi === 2 && !needsGame3;
                    const g = bo3GameInputs[gi];
                    return (
                      <View key={gi} style={{ marginBottom: Spacing.md, opacity: disabled ? 0.35 : 1 }}>
                        <Label>Game {gi + 1}{gi === 2 && !needsGame3 ? ' (if needed)' : ''}</Label>
                        {[modal.p1, modal.p2].map(p => (
                          <TouchableOpacity key={p.id} disabled={!!disabled}
                            style={[styles.winnerOption, g.winnerId === p.id && styles.winnerOptionSelected]}
                            onPress={() => setBo3GameInputs(prev => prev.map((x, i) => i === gi ? { ...x, winnerId: p.id } : x))}>
                            <View style={[styles.radioCircle, g.winnerId === p.id && styles.radioSelected]}>
                              {g.winnerId === p.id && <View style={styles.radioInner} />}
                            </View>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.winnerName, g.winnerId === p.id && { color: Colors.gold }, { flex: 0 }]}>{p.name}</Text>
                              <MTGColorPips colors={p?.deckColors ?? []} size="sm" />
                            </View>
                            {g.winnerId === p.id && <Text style={{ fontSize: 16 }}>🏆</Text>}
                          </TouchableOpacity>
                        ))}
                        <TextInput style={[styles.lifeInput, { marginTop: 4 }]} placeholder="Winner's life total" placeholderTextColor={Colors.textFaint} keyboardType="numeric" editable={!disabled} value={g.life}
                          onChangeText={v => setBo3GameInputs(prev => prev.map((x, i) => i === gi ? { ...x, life: v } : x))} />
                      </View>
                    );
                  });
                })()
              ) : (
                <>
                  <Label>Winner</Label>
                  {[modal.p1, modal.p2].map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.winnerOption, winnerId === p.id && styles.winnerOptionSelected]}
                      onPress={() => setWinnerId(p.id)}
                    >
                      <View style={[styles.radioCircle, winnerId === p.id && styles.radioSelected]}>
                        {winnerId === p.id && <View style={styles.radioInner} />}
                      </View>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.winnerName, winnerId === p.id && { color: Colors.gold }, { flex: 0 }]}>{p.name}</Text>
                        <MTGColorPips colors={p?.deckColors ?? []} size="sm" />
                      </View>
                    </TouchableOpacity>
                  ))}
                  <Label style={{ marginTop: Spacing.md }}>Winner's Final Life</Label>
                  <TextInput
                    style={styles.lifeInput}
                    placeholder="e.g. 12"
                    placeholderTextColor={Colors.textFaint}
                    keyboardType="numeric"
                    value={winnerLife}
                    onChangeText={setWinnerLife}
                  />
                </>
              )}
              </ScrollView>
              <Row style={{ gap: 10, marginTop: Spacing.lg }}>
                <Button label="Confirm" onPress={logRRResult} style={{ flex: 1 }} />
                <Button label="Cancel" onPress={() => { setModal(null); setIsOverride(false); setBo3GameInputs(emptyBo3RR()); }} variant="outline" style={{ flex: 1 }} />
              </Row>
            </View>
          </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {(() => {
        const playerMap = new Map(room.players.map(p => [p.id, p]));
        return schedule.map(({ roundLabel, matches }, ri) => (
        <Card key={ri} style={{ marginBottom: Spacing.sm }}>
          <Text style={styles.roundLabel}>{roundLabel}</Text>
          {matches.map(({ p1id, p2id, gameKey }) => {
            const p1 = playerMap.get(p1id)!;
            const p2 = playerMap.get(p2id)!;
            if (!p1 || !p2) return null;
            const res = results[gameKey];
            return (
              <View key={gameKey} style={styles.rrMatchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rrPlayerName, res?.winnerId === p1id && { color: Colors.gold }]}>{p1.name}</Text>
                  <Text style={styles.vsText}>vs</Text>
                  <Text style={[styles.rrPlayerName, res?.winnerId === p2id && { color: Colors.gold }]}>{p2.name}</Text>
                </View>
                {res ? (
                  <View style={styles.rrResult}>
                    <Badge label="Done" variant="green" />
                    {res.games && res.games.length > 0 && (
                      <Text style={styles.bo3RecordTag}>{getBo3Record(res.games, res.winnerId)}</Text>
                    )}
                    {res.winnerFinalLife > 0 && (
                      <Text style={styles.rrLifeTag}>♥ {res.winnerFinalLife}</Text>
                    )}
                    {isOwner && (
                      <TouchableOpacity
                        style={[styles.logBtn, styles.overrideBtn]}
                        onPress={() => { setIsOverride(true); setWinnerId(''); setWinnerLife(''); setBo3GameInputs(emptyBo3RR()); setModal({ p1, p2, gameKey }); }}
                      >
                        <Text style={styles.overrideBtnText}>✏️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (() => {
                  const partial = room.bo3InProgress?.[gameKey] ?? [];
                  const p1w = partial.filter(g => g.winnerId === p1id).length;
                  const p2w = partial.filter(g => g.winnerId === p2id).length;
                  return (
                    <View style={styles.rrResult}>
                      {partial.length > 0 && (
                        <Text style={styles.bo3RecordTag}>{p1w}-{p2w}</Text>
                      )}
                      {(isOwner || p1id === state.currentUserId || p2id === state.currentUserId) && (
                        <TouchableOpacity
                          style={styles.logBtn}
                          onPress={() => { setIsOverride(false); setModal({ p1, p2, gameKey }); }}
                        >
                          <Text style={styles.logBtnText}>LOG</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })()}
              </View>
            );
          })}
        </Card>
      ));
      })()}
    </View>
  );
}

// ── MTGA Swiss bracket ────────────────────────
function MTGABracket({ roomId }: { roomId: string }) {
  const { state, dispatch } = useApp();
  const room = state.rooms.find(r => r.id === roomId)!;
  const isOwner = room.ownerId === state.currentUserId;
  const records = room.mtgaRecords || [];
  const rounds = room.mtgaRounds || [];
  const [selectedMatchup, setSelectedMatchup] = useState<{
    matchupId: string; roundNumber: number;
    p1Id: string; p2Id: string;
    p1Name: string; p2Name: string;
    isOverride?: boolean;
  } | null>(null);
  const [winnerId, setWinnerId] = useState('');
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());

  const currentRound = rounds.slice().reverse().find(r => !r.isComplete) ?? rounds[rounds.length - 1];
  const pastRounds = rounds.filter(r => r.isComplete);
  const activePlayers = records.filter(r => r.active);
  const champion = activePlayers.length === 1 ? activePlayers[0] : null;

  const playerMap = useMemo(() => new Map(room.players.map(p => [p.id, p])), [room.players]);
  const recordMap = useMemo(() => new Map(records.map(r => [r.playerId, r])), [records]);

  function getPlayerName(id: string | null) {
    if (!id) return 'TBD';
    return playerMap.get(id)?.name ?? 'Unknown';
  }
  function getRecord(id: string) {
    return recordMap.get(id) ?? { wins: 0, losses: 0, active: true };
  }
  function recordLabel(id: string) {
    const r = getRecord(id);
    return `${r.wins}W ${r.losses}L`;
  }

  function confirmResult() {
    if (!selectedMatchup || !winnerId) return;
    const loserId = winnerId === selectedMatchup.p1Id ? selectedMatchup.p2Id : selectedMatchup.p1Id;
    if (selectedMatchup.isOverride) {
      dispatch({
        type: 'OVERRIDE_MTGA_MATCHUP_RESULT',
        roomId,
        roundNumber: selectedMatchup.roundNumber,
        matchupId: selectedMatchup.matchupId,
        winnerId,
        loserId,
      });
      // Full room sync handled by AppProvider state-change effect
    } else {
      dispatch({
        type: 'LOG_MTGA_MATCHUP_RESULT',
        roomId,
        roundNumber: selectedMatchup.roundNumber,
        matchupId: selectedMatchup.matchupId,
        winnerId,
        loserId,
      });
      patchMtgaMatchupResult(roomId, selectedMatchup.roundNumber, selectedMatchup.matchupId, winnerId, loserId);
    }
    setSelectedMatchup(null);
    setWinnerId('');
  }

  function toggleRoundExpanded(n: number) {
    setExpandedRounds(prev => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
  }

  return (
    <View>
      {/* Log / Override result modal */}
      {selectedMatchup && (
        <Modal transparent animationType="slide" onRequestClose={() => setSelectedMatchup(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{selectedMatchup.isOverride ? '✏️ Override Match Result' : '📝 Log Match Result'}</Text>
              <Text style={styles.modalMatch}>
                {selectedMatchup.p1Name} vs {selectedMatchup.p2Name}
              </Text>
              <Divider />
              <Label>Winner</Label>
              {([
                { id: selectedMatchup.p1Id, name: selectedMatchup.p1Name },
                { id: selectedMatchup.p2Id, name: selectedMatchup.p2Name },
              ] as const).map(({ id, name }) => {
                const player = room.players.find(p => p.id === id);
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.winnerOption, winnerId === id && styles.winnerOptionSelected]}
                    onPress={() => setWinnerId(id)}
                  >
                    <View style={[styles.radioCircle, winnerId === id && styles.radioSelected]}>
                      {winnerId === id && <View style={styles.radioInner} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: winnerId === id ? Colors.gold : Colors.text, fontSize: 15, fontFamily: 'System' }}>
                          {name}
                        </Text>
                        <MTGColorPips colors={player?.deckColors ?? []} size="sm" />
                      </View>
                      <Text style={styles.vsText}>{recordLabel(id)}</Text>
                    </View>
                    {winnerId === id && <Text style={{ fontSize: 16 }}>🏆</Text>}
                  </TouchableOpacity>
                );
              })}
              <Row style={{ gap: 10, marginTop: Spacing.lg }}>
                <Button label="Confirm" onPress={confirmResult} style={{ flex: 1 }} disabled={!winnerId} />
                <Button label="Cancel" onPress={() => { setSelectedMatchup(null); setWinnerId(''); }} variant="outline" style={{ flex: 1 }} />
              </Row>
            </View>
          </View>
        </Modal>
      )}

      {/* Champion banner */}
      {champion && (
        <Card gold style={{ alignItems: 'center', marginBottom: Spacing.md }}>
          <Text style={{ fontSize: 40, marginBottom: 4 }}>🏆</Text>
          <Text style={[styles.mtgaPlayerName, { color: Colors.gold, textAlign: 'center' }]}>
            {getPlayerName(champion.playerId)}
          </Text>
          <Text style={[styles.vsText, { textAlign: 'center', marginTop: 4 }]}>
            Tournament Champion · {champion.wins}W {champion.losses}L
          </Text>
        </Card>
      )}

      {/* Current / latest round */}
      {currentRound && !champion && (
        <Card gold style={{ marginBottom: Spacing.md }}>
          <Row between style={{ marginBottom: Spacing.sm }}>
            <Text style={styles.roundLabel}>Round {currentRound.roundNumber}</Text>
            <Badge
              label={currentRound.isComplete ? 'Complete' : `${currentRound.matchups.filter(m => m.winnerId).length}/${currentRound.matchups.length} done`}
              variant={currentRound.isComplete ? 'green' : 'gold'}
            />
          </Row>
          {currentRound.matchups.map(m => {
            const isLogged = !!m.winnerId;
            return (
              <View key={m.id} style={styles.mtgaMatchRow}>
                {/* Player 1 */}
                <View style={{ flex: 1 }}>
                  {m.isBye ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.rrPlayerName, { color: Colors.gold }]}>{getPlayerName(m.player1Id)}</Text>
                        <MTGColorPips colors={playerMap.get(m.player1Id)?.deckColors ?? []} size="sm" />
                      </View>
                      <Text style={styles.vsText}>{recordLabel(m.player1Id)} · BYE</Text>
                    </>
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[
                          styles.rrPlayerName,
                          isLogged && m.winnerId === m.player1Id && { color: Colors.gold },
                          isLogged && m.winnerId !== m.player1Id && { color: Colors.textFaint, textDecorationLine: 'line-through' as const },
                        ]}>
                          {getPlayerName(m.player1Id)}
                        </Text>
                        <MTGColorPips colors={playerMap.get(m.player1Id)?.deckColors ?? []} size="sm" />
                      </View>
                      <Text style={styles.vsText}>{recordLabel(m.player1Id)}</Text>
                      <Text style={[styles.vsText, { marginTop: 2 }]}>vs</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[
                          styles.rrPlayerName,
                          isLogged && m.winnerId === m.player2Id && { color: Colors.gold },
                          isLogged && m.winnerId !== m.player2Id && { color: Colors.textFaint, textDecorationLine: 'line-through' as const },
                        ]}>
                          {getPlayerName(m.player2Id)}
                        </Text>
                        <MTGColorPips colors={playerMap.get(m.player2Id ?? '')?.deckColors ?? []} size="sm" />
                      </View>
                      <Text style={styles.vsText}>{recordLabel(m.player2Id!)}</Text>
                    </>
                  )}
                </View>
                {/* Status */}
                <View style={{ alignItems: 'flex-end', gap: 4, minWidth: 80 }}>
                  {m.isBye ? (
                    <Badge label="Auto Win" variant="green" />
                  ) : isLogged ? (
                    <>
                      <Badge label="Done" variant="green" />
                      <Text style={styles.rrLifeTag}>🏆 {getPlayerName(m.winnerId!)}</Text>
                      {isOwner && (
                        <TouchableOpacity
                          style={[styles.logBtn, styles.overrideBtn]}
                          onPress={() => { setWinnerId(''); setSelectedMatchup({ matchupId: m.id, roundNumber: currentRound.roundNumber, p1Id: m.player1Id, p2Id: m.player2Id!, p1Name: getPlayerName(m.player1Id), p2Name: getPlayerName(m.player2Id), isOverride: true }); }}
                        >
                          <Text style={styles.overrideBtnText}>✏️ OVERRIDE</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  ) : (isOwner || m.player1Id === state.currentUserId || m.player2Id === state.currentUserId) ? (
                    <TouchableOpacity
                      style={styles.logBtn}
                      onPress={() => setSelectedMatchup({
                        matchupId: m.id,
                        roundNumber: currentRound.roundNumber,
                        p1Id: m.player1Id,
                        p2Id: m.player2Id!,
                        p1Name: getPlayerName(m.player1Id),
                        p2Name: getPlayerName(m.player2Id),
                      })}
                    >
                      <Text style={styles.logBtnText}>LOG RESULT</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {/* Standings strip */}
      <View style={styles.mtgaStandingsStrip}>
        <Text style={styles.lifeSummaryTitle}>STANDINGS</Text>
        {[...records]
          .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
          .map((rec, i) => (
            <View key={rec.playerId} style={styles.mtgaStandingRow}>
              <Text style={[styles.mtgaStandingRank, !rec.active && { color: Colors.textFaint }]}>
                #{i + 1}
              </Text>
              <Text style={[styles.mtgaStandingName, !rec.active && { color: Colors.textFaint, textDecorationLine: 'line-through' as const }]}>
                {getPlayerName(rec.playerId)}
              </Text>
              <Text style={[styles.mtgaStandingRecord, !rec.active && { color: Colors.textFaint }]}>
                {rec.wins}W {rec.losses}L
              </Text>
              {!rec.active && <Badge label="Out" variant="red" style={{ marginLeft: 4 }} />}
            </View>
          ))}
      </View>

      {/* Past rounds */}
      {pastRounds.length > 0 && (
        <View style={{ marginTop: Spacing.sm }}>
          <Text style={[styles.roundLabel, { marginBottom: Spacing.sm }]}>HISTORY</Text>
          {[...pastRounds].reverse().map(round => {
            const isExpanded = expandedRounds.has(round.roundNumber);
            return (
              <Card key={round.roundNumber} style={{ marginBottom: Spacing.sm }}>
                <TouchableOpacity onPress={() => toggleRoundExpanded(round.roundNumber)}>
                  <Row between>
                    <Text style={styles.roundLabel}>Round {round.roundNumber}</Text>
                    <Row style={{ gap: 8 }}>
                      <Badge label="Complete" variant="green" />
                      <Text style={styles.vsText}>{isExpanded ? '▲' : '▼'}</Text>
                    </Row>
                  </Row>
                </TouchableOpacity>
                {isExpanded && (
                  <View style={{ marginTop: Spacing.sm }}>
                    {round.matchups.map(m => (
                      <View key={m.id} style={[styles.mtgaMatchRow, { paddingVertical: 6 }]}>
                        <View style={{ flex: 1 }}>
                          {m.isBye ? (
                            <Text style={styles.rrPlayerName}>{getPlayerName(m.player1Id)} — BYE</Text>
                          ) : (
                            <Text style={styles.rrPlayerName}>
                              <Text style={m.winnerId === m.player1Id ? { color: Colors.gold } : { color: Colors.textFaint }}>
                                {getPlayerName(m.player1Id)}
                              </Text>
                              <Text style={{ color: Colors.textFaint }}> vs </Text>
                              <Text style={m.winnerId === m.player2Id ? { color: Colors.gold } : { color: Colors.textFaint }}>
                                {getPlayerName(m.player2Id)}
                              </Text>
                            </Text>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          {m.winnerId && !m.isBye && (
                            <Text style={styles.rrLifeTag}>🏆 {getPlayerName(m.winnerId)}</Text>
                          )}
                          {m.winnerId && !m.isBye && isOwner && (
                            <TouchableOpacity
                              style={[styles.logBtn, styles.overrideBtn]}
                              onPress={() => { setWinnerId(''); setSelectedMatchup({ matchupId: m.id, roundNumber: round.roundNumber, p1Id: m.player1Id, p2Id: m.player2Id!, p1Name: getPlayerName(m.player1Id), p2Name: getPlayerName(m.player2Id), isOverride: true }); }}
                            >
                              <Text style={styles.overrideBtnText}>✏️</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────
export default function BracketScreen() {
  const route = useRoute<Route>();
  const { state } = useApp();
  const room = state.rooms.find(r => r.id === route.params.roomId);

  if (!room) return (
    <SafeAreaView style={styles.safe}>
      <EmptyState icon="❓" title="Room not found" />
    </SafeAreaView>
  );

  const effectiveFmt = room.format === 'suggested' ? getSuggestedFormat(room.players.length) : room.format;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        {effectiveFmt === 'round_robin' && <RoundRobinBracket roomId={room.id} isTwoPhase={false} />}
        {effectiveFmt === 'mtga' && <MTGABracket roomId={room.id} />}
        {(effectiveFmt === 'single_elim' || effectiveFmt === 'seeded' || effectiveFmt === 'double_elim') && (
          <EliminationBracket roomId={room.id} />
        )}
        {effectiveFmt === 'two_phase' && room.phase === 1 && (
          <RoundRobinBracket roomId={room.id} isTwoPhase={true} />
        )}
        {effectiveFmt === 'two_phase' && room.phase === 2 && (
          <EliminationBracket roomId={room.id} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  bracketScroll: { flexDirection: 'row', gap: Spacing.xl, paddingHorizontal: Spacing.sm },
  bracketRound: { width: 150, flexDirection: 'column', gap: Spacing.xl },
  roundLabel: { ...Typography.labelGold, textAlign: 'center', marginBottom: 6 },
  matchBlock: { gap: 4 },
  bracketMatchCard: {
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  bracketPlayer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  bracketPlayerWinner: { backgroundColor: Colors.goldGlow },
  bracketPlayerLoser: { opacity: 0.5 },
  bracketPlayerName: { ...Typography.bodySM, flex: 1 },
  seedBadge: { ...Typography.labelSM, color: Colors.textMuted, fontSize: 9, minWidth: 20, marginRight: 3 },
  logBtn: {
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    borderRadius: Radius.sm,
    padding: 5,
    alignItems: 'center',
  },
  logBtnText: { ...Typography.labelGold, fontSize: 9 },
  playBtn: {
    borderColor: Colors.gold,
    backgroundColor: Colors.goldGlow,
  },
  playBtnText: { ...Typography.labelGold, fontSize: 9, color: Colors.gold },
  lifeTag: { ...Typography.labelSM, textAlign: 'center', color: Colors.textFaint },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.bgOverlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGold,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  modalTitle: { fontFamily: 'Georgia', fontSize: 18, color: Colors.gold, marginBottom: 6 },
  modalMatch: { ...Typography.bodyMD, color: Colors.textMuted, marginBottom: 4 },
  winnerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  winnerOptionSelected: { borderColor: Colors.gold, backgroundColor: Colors.goldGlow },
  radioCircle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: Colors.gold },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.gold },
  winnerName: { ...Typography.body, flex: 1 },
  lifeInput: {
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    color: Colors.text,
    fontSize: 18,
    textAlign: 'center',
    fontFamily: 'Georgia',
  },
  bo3RecordTag: {
    fontFamily: 'Georgia',
    fontSize: 12,
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  rrMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rrPlayerName: { ...Typography.bodyMD },
  vsText: { ...Typography.bodySM, color: Colors.textFaint, marginVertical: 2 },
  rrResult: { alignItems: 'flex-end', gap: 4 },
  rrLifeTag: { ...Typography.bodySM, color: Colors.redLight },
  lifeSummaryBanner: {
    backgroundColor: 'rgba(192,57,43,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.25)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  lifeSummaryTitle: { ...Typography.labelSM, color: Colors.redLight, marginBottom: Spacing.sm },
  lifeSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  lifeSummaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.3)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  lifeSummaryName: { ...Typography.bodySM, color: Colors.text },
  lifeSummaryNum: { fontFamily: 'Georgia', fontSize: 14, color: Colors.redLight },
  mtgaMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  mtgaPlayerName: { ...Typography.h3 },
  mtgaStandingsStrip: {
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  mtgaStandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  mtgaStandingRank: { fontFamily: 'Georgia', fontSize: 14, color: Colors.gold, minWidth: 28 },
  mtgaStandingName: { ...Typography.bodyMD, flex: 1 },
  mtgaStandingRecord: { ...Typography.bodySM, color: Colors.textMuted },
  overrideBtn: {
    borderColor: Colors.textMuted,
    backgroundColor: 'transparent',
    marginTop: 2,
  },
  overrideBtnText: { ...Typography.labelSM, fontSize: 9, color: Colors.textMuted },
});
