// CreateRoomScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Typography, Spacing, Radius, FORMATS, FormatId } from '../theme';
import { Button, Label, Card, Row, Divider } from '../components/UI';
import { useApp } from '../services/AppContext';
import { RoomsStackParams } from '../navigation/RootNavigator';
import { generateRoundRobinSchedule } from '../utils/tournament';

type Nav = NativeStackNavigationProp<RoomsStackParams>;

export default function CreateRoomScreen() {
  const navigation = useNavigation<Nav>();
  const { createRoom } = useApp();
  const [roomName, setRoomName] = useState('');
  const [format, setFormat] = useState<FormatId>('single_elim');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [phase1Mode, setPhase1Mode] = useState<'round_robin' | 'fixed_games'>('round_robin');
  const [rrGamesCount, setRrGamesCount] = useState(1);
  const [fixedGames, setFixedGames] = useState(3);
  const [error, setError] = useState('');

  function handleCreate() {
    const trimmed = roomName.trim();
    if (!trimmed) { setError('Room name is required.'); return; }
    if (trimmed.length < 3) { setError('Room name must be at least 3 characters.'); return; }
    const isTwoPhase = format === 'two_phase';
    const gamesCount = isTwoPhase
      ? (phase1Mode === 'fixed_games' ? fixedGames : rrGamesCount)
      : 1;
    const room = createRoom(
      trimmed,
      format,
      maxPlayers,
      gamesCount,
      isTwoPhase ? phase1Mode : undefined,
    );
    navigation.replace('Tournament', { roomId: room.id });
  }

  // Schedule summary helpers
  const rrRoundsPerCycle = maxPlayers % 2 === 0 ? maxPlayers - 1 : maxPlayers;
  const rrTotalMatches = Math.floor(maxPlayers / 2);

  function fullRRSummary(): string {
    const rounds = rrRoundsPerCycle * rrGamesCount;
    const games = rrTotalMatches * rrRoundsPerCycle * rrGamesCount;
    return `${rounds} rounds · ${games} total games · every pair plays ${rrGamesCount}×`;
  }

  function fixedSummary(): string {
    // Each round has floor(P/2) matches; we play fixedGames rounds total
    const gamesPerRound = Math.floor(maxPlayers / 2);
    const total = gamesPerRound * fixedGames;
    return `${fixedGames} rounds · ${total} total games · each player plays ${fixedGames}`;
  }

  const playerOptions = [4, 6, 8, 10, 12, 16];
  const fixedGameOptions = [2, 3, 4, 5, 6, 7, 8];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          <Label>Room Name</Label>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="e.g. Friday Night Draft"
            placeholderTextColor={Colors.textFaint}
            value={roomName}
            onChangeText={v => { setRoomName(v); setError(''); }}
            autoCapitalize="words"
            maxLength={40}
            returnKeyType="done"
          />
          <View style={styles.inputMeta}>
            {error
              ? <Text style={styles.error}>{error}</Text>
              : <Text style={styles.inputHint}>
                  {roomName.trim().length < 3 && roomName.length > 0
                    ? 'Keep typing…'
                    : ' '}
                </Text>
            }
            <Text style={styles.charCount}>{roomName.length}/40</Text>
          </View>

          <Label>Max Players</Label>
          <View style={styles.playerGrid}>
            {playerOptions.map(n => (
              <TouchableOpacity
                key={n}
                style={[styles.playerOption, maxPlayers === n && styles.playerOptionSelected]}
                onPress={() => setMaxPlayers(n)}
              >
                <Text style={[styles.playerOptionText, maxPlayers === n && styles.playerOptionTextSelected]}>
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Label style={{ marginTop: Spacing.md }}>Tournament Format</Label>
          {FORMATS.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[styles.formatRow, format === f.id && styles.formatRowSelected]}
              onPress={() => setFormat(f.id)}
            >
              <View style={[styles.formatRadio, format === f.id && styles.formatRadioSelected]}>
                {format === f.id && <View style={styles.formatRadioInner} />}
              </View>
              <Text style={styles.formatIcon}>{f.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.formatName, { color: format === f.id ? f.color : Colors.text }]}>
                  {f.name}
                </Text>
                <Text style={styles.formatDesc}>{f.desc}</Text>
              </View>
              {format === f.id && (
                <View style={[styles.activeTag, { borderColor: f.color }]}>
                  <Text style={[styles.activeTagText, { color: f.color }]}>SELECTED</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}

          {/* Two-Phase: phase 1 seeding options */}
          {format === 'two_phase' && (
            <View style={styles.twoPhaseBox}>
              <Label>Phase 1 Seeding Mode</Label>

              {/* Mode toggle */}
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[styles.modeBtn, phase1Mode === 'round_robin' && styles.modeBtnActive]}
                  onPress={() => setPhase1Mode('round_robin')}
                >
                  <Text style={styles.modeBtnIcon}>🔄</Text>
                  <Text style={[styles.modeBtnLabel, phase1Mode === 'round_robin' && styles.modeBtnLabelActive]}>
                    Round Robin
                  </Text>
                  <Text style={[styles.modeBtnSub, phase1Mode === 'round_robin' && { color: Colors.textMuted }]}>
                    Everyone plays everyone
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeBtn, phase1Mode === 'fixed_games' && styles.modeBtnActive]}
                  onPress={() => setPhase1Mode('fixed_games')}
                >
                  <Text style={styles.modeBtnIcon}>🎯</Text>
                  <Text style={[styles.modeBtnLabel, phase1Mode === 'fixed_games' && styles.modeBtnLabelActive]}>
                    Fixed Games
                  </Text>
                  <Text style={[styles.modeBtnSub, phase1Mode === 'fixed_games' && { color: Colors.textMuted }]}>
                    Set total rounds to play
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Round Robin sub-options */}
              {phase1Mode === 'round_robin' && (
                <>
                  <Label style={{ marginTop: Spacing.md }}>Games per Opponent</Label>
                  <Text style={styles.subDesc}>
                    Each player faces every opponent this many times.
                  </Text>
                  <View style={styles.gamesGrid}>
                    {[1, 2, 3].map(n => (
                      <TouchableOpacity
                        key={n}
                        style={[styles.gameOption, rrGamesCount === n && styles.gameOptionSelected]}
                        onPress={() => setRrGamesCount(n)}
                      >
                        <Text style={[styles.gameOptionText, rrGamesCount === n && styles.gameOptionTextSelected]}>
                          {n}
                        </Text>
                        <Text style={[styles.gameOptionSub, rrGamesCount === n && { color: Colors.gold }]}>
                          {n === 1 ? 'game' : 'games'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.summaryText}>{fullRRSummary()}</Text>
                </>
              )}

              {/* Fixed games sub-options */}
              {phase1Mode === 'fixed_games' && (
                <>
                  <Label style={{ marginTop: Spacing.md }}>Rounds to Play</Label>
                  <Text style={styles.subDesc}>
                    Each player plays this many games. Pairings follow round-robin rotation.
                  </Text>
                  <View style={styles.gamesGrid}>
                    {fixedGameOptions.map(n => (
                      <TouchableOpacity
                        key={n}
                        style={[styles.gameOption, fixedGames === n && styles.gameOptionSelected]}
                        onPress={() => setFixedGames(n)}
                      >
                        <Text style={[styles.gameOptionText, fixedGames === n && styles.gameOptionTextSelected]}>
                          {n}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.summaryText}>{fixedSummary()}</Text>
                </>
              )}
            </View>
          )}

          <Divider style={{ marginTop: Spacing.xl }} />
          <Button label="Create Room" onPress={handleCreate} size="lg" fullWidth icon="🏰" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  input: {
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: Colors.text,
    fontSize: 15,
    marginBottom: Spacing.lg,
  },
  inputError: { borderColor: Colors.redLight },
  inputMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
  },
  inputHint: { ...Typography.bodySM, color: Colors.textMuted },
  charCount: { ...Typography.bodySM, color: Colors.textFaint },
  error: { ...Typography.bodySM, color: Colors.redLight },
  playerGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    marginBottom: Spacing.lg,
  },
  playerOption: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerOptionSelected: {
    borderColor: Colors.gold,
    backgroundColor: Colors.goldGlow,
  },
  playerOptionText: { ...Typography.body, color: Colors.textMuted },
  playerOptionTextSelected: { color: Colors.gold, fontWeight: '700' },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  formatRowSelected: { borderColor: Colors.borderGold, backgroundColor: Colors.goldGlow },
  formatRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatRadioSelected: { borderColor: Colors.gold },
  formatRadioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gold },
  formatIcon: { fontSize: 18 },
  formatName: { ...Typography.bodyMD, fontWeight: '600' },
  formatDesc: { ...Typography.bodySM, color: Colors.textMuted, marginTop: 2 },
  activeTag: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  activeTagText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },

  // Two-phase box
  twoPhaseBox: {
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: 'rgba(22,160,133,0.4)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  modeBtn: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  modeBtnActive: {
    borderColor: 'rgba(22,160,133,0.8)',
    backgroundColor: 'rgba(22,160,133,0.12)',
  },
  modeBtnIcon: { fontSize: 20 },
  modeBtnLabel: { ...Typography.bodyMD, fontWeight: '600', color: Colors.textMuted, textAlign: 'center' },
  modeBtnLabelActive: { color: 'rgba(22,160,133,1)' },
  modeBtnSub: { ...Typography.bodySM, color: Colors.textFaint, textAlign: 'center' },
  subDesc: { ...Typography.bodySM, color: Colors.textMuted, marginBottom: Spacing.sm, lineHeight: 18 },
  gamesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  gameOption: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  gameOptionSelected: { borderColor: Colors.gold, backgroundColor: Colors.goldGlow },
  gameOptionText: { fontFamily: 'Georgia', fontSize: 22, color: Colors.textMuted },
  gameOptionTextSelected: { color: Colors.gold },
  gameOptionSub: { ...Typography.labelSM, color: Colors.textFaint },
  summaryText: {
    ...Typography.bodySM,
    color: 'rgba(22,160,133,0.9)',
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
