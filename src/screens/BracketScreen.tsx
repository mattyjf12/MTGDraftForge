// BracketScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Modal, TextInput,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, getSuggestedFormat, FORMATS } from '../theme';
import { Button, Card, Badge, Row, Divider, EmptyState, Label, MTGColorPips } from '../components/UI';
import { useApp } from '../services/AppContext';
import { BracketMatch, Player, RRResult } from '../utils/types';
import { RoomsStackParams } from '../navigation/RootNavigator';
import { getRRKey, generateRoundRobinSchedule, generateMultiGameRRSchedule, generateFixedGamesSchedule, MultiGameRRMatch } from '../utils/tournament';
import { patchBracketMatch, patchMtgaMatchupResult } from '../services/firebase';

type Route = RouteProp<RoomsStackParams, 'Bracket'>;

// ── Log Result Modal (elimination only — no life logging) ────
function LogResultModal({ match, players, onConfirm, onClose }: {
  match: BracketMatch;
  players: Player[];
  onConfirm: (winnerId: string, loserId: string) => void;
  onClose: () => void;
}) {
  const [winnerId, setWinnerId] = useState('');

  const p1 = players.find(p => p.id === match.player1Id);
  const p2 = players.find(p => p.id === match.player2Id);

  function handleConfirm() {
    if (!winnerId) { Alert.alert('Select a winner'); return; }
    const loserId = winnerId === match.player1Id ? match.player2Id! : match.player1Id!;
    onConfirm(winnerId, loserId);
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>📝 Log Match Result</Text>
          <Text style={styles.modalMatch}>{p1?.name} vs {p2?.name}</Text>
          <Divider />

          <Label>Winner</Label>
          {[
            { p: p1, slot: 'p1' },
            { p: p2, slot: 'p2' },
          ].filter(({ p }) => Boolean(p)).map(({ p, slot }) => (
            <TouchableOpacity
              key={slot}
              style={[styles.winnerOption, winnerId === p!.id && styles.winnerOptionSelected]}
              onPress={() => setWinnerId(p!.id)}
            >
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
  const room = state.rooms.find(r => r.id === roomId)!;
  const [selectedMatch, setSelectedMatch] = useState<BracketMatch | null>(null);

  // Build seed map for seeded / two_phase-phase-2 brackets.
  // Both formats store seeds directly on player.seed — seeded format has them
  // from room setup; two_phase phase 2 has them written during ADVANCE_TO_PHASE_2.
  const seedMap: Record<string, number> = {};
  if (room.format === 'seeded' || (room.format === 'two_phase' && room.phase === 2)) {
    room.players.forEach(p => { if (p.seed) seedMap[p.id] = p.seed; });
  }
  const showSeeds = Object.keys(seedMap).length > 0;

  const bracket = room.bracket || [];
  const winnersBracket = bracket.filter(m => m.bracket === 'winners' || m.bracket === 'grand_final');

  // Group by round
  const rounds: Record<number, BracketMatch[]> = {};
  winnersBracket.forEach(m => {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  });

  const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);
  const totalRounds = roundNumbers.length;

  function getRoundLabel(roundIdx: number): string {
    const remaining = totalRounds - roundIdx;
    if (remaining === 1) return '🏆 Final';
    if (remaining === 2) return 'Semifinals';
    if (remaining === 3) return 'Quarterfinals';
    return `Round ${roundIdx + 1}`;
  }

  function handleLogResult(winnerId: string, loserId: string) {
    dispatch({
      type: 'LOG_ELIM_RESULT',
      roomId,
      matchId: selectedMatch!.id,
      winnerId, loserId,
      winnerLife: 0, loserLife: 0,
    });
    patchBracketMatch(roomId, selectedMatch!.id, winnerId, loserId, 0, 0);
    setSelectedMatch(null);
  }

  return (
    <View>
      {selectedMatch && (
        <LogResultModal
          match={selectedMatch}
          players={room.players}
          onConfirm={handleLogResult}
          onClose={() => setSelectedMatch(null)}
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
                    {!isComplete && p1 && p2 && (
                      <TouchableOpacity
                        style={styles.logBtn}
                        onPress={() => setSelectedMatch(match)}
                      >
                        <Text style={styles.logBtnText}>LOG RESULT</Text>
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
  const [modal, setModal] = useState<{ p1: Player; p2: Player; gameKey: string } | null>(null);
  const [winnerId, setWinnerId] = useState('');
  const [winnerLife, setWinnerLife] = useState('');

  const results = room.rrResults || {};
  const gamesCount = room.settings.rrGamesCount ?? 1;

  // Accumulated winner life per player across all logged RR results
  const playerLifeTotals: Record<string, number> = {};
  Object.values(results).forEach(r => {
    playerLifeTotals[r.winnerId] = (playerLifeTotals[r.winnerId] || 0) + r.winnerFinalLife;
  });

  const phase1Mode = room.settings.phase1Mode ?? 'round_robin';

  // Build a unified schedule where each match has a unique gameKey
  const schedule: Array<{ roundLabel: string; matches: MultiGameRRMatch[] }> = isTwoPhase
    ? (() => {
        if (phase1Mode === 'fixed_games') {
          // Fixed: gamesCount rounds following RR rotation
          return generateFixedGamesSchedule(room.players, gamesCount).map((round, ri) => ({
            roundLabel: `Round ${ri + 1}`,
            matches: round,
          }));
        }
        // Full round robin (possibly multiple cycles)
        const baseRounds = room.players.length % 2 === 0
          ? room.players.length - 1
          : room.players.length;
        return generateMultiGameRRSchedule(room.players, gamesCount).map((round, ri) => ({
          roundLabel: gamesCount > 1
            ? `Game ${Math.floor(ri / baseRounds) + 1}/${gamesCount} · Round ${(ri % baseRounds) + 1}`
            : `Round ${ri + 1}`,
          matches: round,
        }));
      })()
    : generateRoundRobinSchedule(room.players).map((round, ri) => ({
        roundLabel: `Round ${ri + 1}`,
        matches: round.map(([p1id, p2id]) => ({
          p1id, p2id, gameKey: getRRKey(p1id, p2id),
        })),
      }));

  function logRRResult() {
    if (!modal || !winnerId) return;
    const loserId = winnerId === modal.p1.id ? modal.p2.id : modal.p1.id;
    const result: RRResult = {
      player1Id: modal.p1.id,
      player2Id: modal.p2.id,
      winnerId,
      loserId,
      winnerFinalLife: parseInt(winnerLife) || 0,
      completedAt: Date.now(),
      gameKey: modal.gameKey,
    };
    dispatch({ type: 'LOG_RR_RESULT', roomId, result });
    setModal(null); setWinnerId(''); setWinnerLife('');
  }

  // Players sorted by accumulated life total (for the summary banner)
  const lifeSummary = room.players
    .map(p => ({ name: p.name, id: p.id, life: playerLifeTotals[p.id] || 0 }))
    .filter(p => p.life > 0)
    .sort((a, b) => b.life - a.life);

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
        <Modal transparent animationType="slide" onRequestClose={() => setModal(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>📝 Log Match</Text>
              <Text style={styles.modalMatch}>{modal.p1.name} vs {modal.p2.name}</Text>
              <Divider />
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
              <Row style={{ gap: 10, marginTop: Spacing.lg }}>
                <Button label="Confirm" onPress={logRRResult} style={{ flex: 1 }} />
                <Button label="Cancel" onPress={() => setModal(null)} variant="outline" style={{ flex: 1 }} />
              </Row>
            </View>
          </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {schedule.map(({ roundLabel, matches }, ri) => (
        <Card key={ri} style={{ marginBottom: Spacing.sm }}>
          <Text style={styles.roundLabel}>{roundLabel}</Text>
          {matches.map(({ p1id, p2id, gameKey }) => {
            const p1 = room.players.find(p => p.id === p1id)!;
            const p2 = room.players.find(p => p.id === p2id)!;
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
                    {res.winnerFinalLife > 0 && (
                      <Text style={styles.rrLifeTag}>♥ {res.winnerFinalLife}</Text>
                    )}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.logBtn}
                    onPress={() => setModal({ p1, p2, gameKey })}
                  >
                    <Text style={styles.logBtnText}>LOG</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </Card>
      ))}
    </View>
  );
}

// ── MTGA Swiss bracket ────────────────────────
function MTGABracket({ roomId }: { roomId: string }) {
  const { state, dispatch } = useApp();
  const room = state.rooms.find(r => r.id === roomId)!;
  const records = room.mtgaRecords || [];
  const rounds = room.mtgaRounds || [];
  const [selectedMatchup, setSelectedMatchup] = useState<{
    matchupId: string; roundNumber: number;
    p1Id: string; p2Id: string;
    p1Name: string; p2Name: string;
  } | null>(null);
  const [winnerId, setWinnerId] = useState('');
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());

  const currentRound = [...rounds].reverse().find(r => !r.isComplete) ?? rounds[rounds.length - 1];
  const pastRounds = rounds.filter(r => r.isComplete);
  const activePlayers = records.filter(r => r.active);
  const champion = activePlayers.length === 1 ? activePlayers[0] : null;

  function getPlayerName(id: string | null) {
    if (!id) return 'TBD';
    return room.players.find(p => p.id === id)?.name ?? 'Unknown';
  }
  function getRecord(id: string) {
    return records.find(r => r.playerId === id) ?? { wins: 0, losses: 0, active: true };
  }
  function recordLabel(id: string) {
    const r = getRecord(id);
    return `${r.wins}W ${r.losses}L`;
  }

  function confirmResult() {
    if (!selectedMatchup || !winnerId) return;
    const loserId = winnerId === selectedMatchup.p1Id ? selectedMatchup.p2Id : selectedMatchup.p1Id;
    dispatch({
      type: 'LOG_MTGA_MATCHUP_RESULT',
      roomId,
      roundNumber: selectedMatchup.roundNumber,
      matchupId: selectedMatchup.matchupId,
      winnerId,
      loserId,
    });
    patchMtgaMatchupResult(roomId, selectedMatchup.roundNumber, selectedMatchup.matchupId, winnerId, loserId);
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
      {/* Log result modal */}
      {selectedMatchup && (
        <Modal transparent animationType="slide" onRequestClose={() => setSelectedMatchup(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>📝 Log Match Result</Text>
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
                        <MTGColorPips colors={room.players.find(p => p.id === m.player1Id)?.deckColors ?? []} size="sm" />
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
                        <MTGColorPips colors={room.players.find(p => p.id === m.player1Id)?.deckColors ?? []} size="sm" />
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
                        <MTGColorPips colors={room.players.find(p => p.id === m.player2Id)?.deckColors ?? []} size="sm" />
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
                    </>
                  ) : (
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
                  )}
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
                        {m.winnerId && !m.isBye && (
                          <Text style={styles.rrLifeTag}>🏆 {getPlayerName(m.winnerId)}</Text>
                        )}
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
});
