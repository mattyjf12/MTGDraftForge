// TournamentScreen.tsx — hub screen for a specific room
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Typography, Spacing, Radius, FORMATS, getSuggestedFormat } from '../theme';
import { Button, Card, Badge, Row, InviteCodeBox, Divider, EmptyState, Label, MTGColorPips, PlayerAvatar, haptic } from '../components/UI';
import { useApp } from '../services/AppContext';
import { maybeProposeReview } from '../services/reviewPrompt';
import { RoomsStackParams } from '../navigation/RootNavigator';
import { computeStandings, generateMultiGameRRSchedule, generateFixedGamesSchedule } from '../utils/tournament';
import { MTGColor } from '../utils/types';
import VictoryOverlay from '../components/VictoryOverlay';
import RoundTimer from '../components/RoundTimer';

type Nav = NativeStackNavigationProp<RoomsStackParams>;
type Route = RouteProp<RoomsStackParams, 'Tournament'>;

// Nav tile
function NavTile({ icon, label, onPress, disabled }: {
  icon: string; label: string; onPress: () => void; disabled?: boolean
}) {
  return (
    <TouchableOpacity
      style={[styles.navTile, disabled && styles.navTileDisabled]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={disabled ? 1 : 0.7}
    >
      <Text style={styles.navTileIcon}>{icon}</Text>
      <Text style={[styles.navTileLabel, disabled && { color: Colors.textFaint }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function TournamentScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { state, dispatch, addBot, removeBot, renameBot } = useApp();

  const room = state.rooms.find(r => r.id === route.params.roomId);

  const myPlayer = room?.players.find(p => p.id === state.currentUserId);
  const amSpectating = myPlayer?.isSpectator === true;
  const [deckModal, setDeckModal] = useState(false);
  const [deckName, setDeckName] = useState(myPlayer?.deckName ?? '');
  const [deckColors, setDeckColors] = useState<MTGColor[]>(myPlayer?.deckColors ?? []);
  const [renameBotModal, setRenameBotModal] = useState(false);
  const [renameBotId, setRenameBotId] = useState('');
  const [renameBotName, setRenameBotName] = useState('');
  const [showVictory, setShowVictory] = useState(false);

  // Fire review prompt 3 seconds after the tournament completes.
  // prevStatusRef lets us detect the exact moment it flips to 'completed'.
  const prevStatusRef = useRef(room?.status);
  useEffect(() => {
    if (!room) return;
    if (room.status === 'completed' && prevStatusRef.current !== 'completed') {
      haptic('notificationSuccess');
      setShowVictory(true);
      const timer = setTimeout(() => maybeProposeReview(), 3000);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = room.status;
  }, [room?.status]);

  // Room was deleted (locally or by the host on another device) — navigate back.
  useEffect(() => {
    if (!room && navigation.canGoBack()) {
      const timer = setTimeout(() => navigation.goBack(), 1500);
      return () => clearTimeout(timer);
    }
  }, [room, navigation]);

  if (!room) return (
    <SafeAreaView style={styles.safe}>
      <EmptyState
        icon="🗑️"
        title="Room deleted"
        subtitle="This room was deleted. Taking you back…"
        cta={
          <Button
            label="Go Back"
            onPress={() => navigation.goBack()}
            variant="outline"
            size="md"
          />
        }
      />
    </SafeAreaView>
  );

  // Separate active players from spectators — spectators join after the tournament
  // starts and must not affect bracket generation, player counts, or start logic.
  const activePlayers = room.players.filter(p => !p.isSpectator);
  const spectatorPlayers = room.players.filter(p => p.isSpectator);

  const fmt = FORMATS.find(f => f.id === room.format);
  const effectiveFmt = room.format === 'suggested' ? getSuggestedFormat(activePlayers.length) : room.format;
  const effectiveFmtMeta = FORMATS.find(f => f.id === effectiveFmt);
  const minPlayers = effectiveFmtMeta?.minPlayers ?? 2;
  const standings = computeStandings(room);
  const hasStarted = room.status === 'in_progress' || room.status === 'completed';
  const isOwner = room.ownerId === state.currentUserId;
  const isRoundRobin = effectiveFmt === 'round_robin';
  const champion = room.status === 'completed' ? standings[0] : null;
  const roundDuration = room.settings.roundDuration ?? 0;

  async function exportResults() {
    const lines: string[] = [`🏆 ${room.name}`, `Format: ${fmt?.name ?? room.format}`];
    if (room.setName) lines.push(`Set: ${room.setName}`);
    lines.push('', '--- Final Standings ---');
    standings.forEach(s => {
      const deck = room.players.find(p => p.id === s.playerId)?.deckName;
      lines.push(`#${s.rank} ${s.playerName} — ${s.wins}W/${s.losses}L${deck ? ` (${deck})` : ''}`);
    });
    lines.push('', `Generated by MTG Draft Forge · ${new Date().toLocaleDateString()}`);
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // user cancelled or share not available
    }
  }

  // Format helpers
  const isTwoPhase = effectiveFmt === 'two_phase';
  const isCommander = effectiveFmt === 'commander';
  const gamesCount = room.settings.rrGamesCount ?? 1;
  const phase1Mode = room.settings.phase1Mode ?? 'round_robin';
  const totalRRGames = useMemo(() => {
    if (!isTwoPhase) return 0;
    const schedule = phase1Mode === 'fixed_games'
      ? generateFixedGamesSchedule(activePlayers, gamesCount)
      : generateMultiGameRRSchedule(activePlayers, gamesCount);
    return schedule.reduce((sum, round) => sum + round.length, 0);
  }, [isTwoPhase, phase1Mode, activePlayers, gamesCount]);
  const completedRRGames = isTwoPhase ? Object.keys(room.rrResults || {}).length : 0;

  function startTournament() {
    dispatch({ type: 'START_TOURNAMENT', roomId: room.id });
  }

  function advanceToPhase2() {
    dispatch({ type: 'ADVANCE_TO_PHASE_2', roomId: room.id });
  }

  function confirmRevertToPhase1() {
    Alert.alert(
      'Revert to Phase 1?',
      'This will clear the elimination bracket. All Round Robin results are preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revert', style: 'destructive', onPress: () => dispatch({ type: 'REVERT_TO_PHASE_1', roomId: room.id }) },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* Room header */}
        <Card gold>
          <Row between style={{ marginBottom: 8 }}>
            <Text style={styles.roomName}>{room.name}</Text>
            <Badge label={room.status.replace('_', ' ')} variant={hasStarted ? 'green' : 'muted'} />
          </Row>
          <Row style={{ gap: 12, marginBottom: room.setName ? 6 : 12 }}>
            <Text style={[styles.fmtText, { color: fmt?.color }]}>{fmt?.icon} {fmt?.name}</Text>
            <Text style={styles.playerCount}>👥 {activePlayers.length}/{room.maxPlayers}{spectatorPlayers.length > 0 ? ` · 👁 ${spectatorPlayers.length}` : ''}</Text>
          </Row>
          {room.setName ? (
            <Text style={styles.setNameText}>📦 {room.setName}</Text>
          ) : null}
          {room.format === 'suggested' && (
            <Row style={{ marginBottom: 10 }}>
              <Text style={styles.suggestedBadge}>
                ✨ Auto-selected: {FORMATS.find(f=>f.id===effectiveFmt)?.name}
              </Text>
            </Row>
          )}
          <InviteCodeBox code={room.inviteCode} />
          {/* QR code for quick joining */}
          <View style={styles.qrContainer}>
            <QRCode
              value={`mtgdraftforge://join/${room.inviteCode}`}
              size={90}
              color={Colors.gold}
              backgroundColor="transparent"
            />
            <Text style={styles.qrHint}>Scan to join</Text>
          </View>
        </Card>

        {/* Players */}
        {/* Spectating banner — shown only to spectators */}
        {amSpectating && (
          <View style={styles.spectatorBanner}>
            <Text style={styles.spectatorBannerIcon}>👁</Text>
            <Text style={styles.spectatorBannerText}>
              You're spectating this tournament. Match results and standings are read-only.
            </Text>
          </View>
        )}

        <Card>
          <Text style={styles.sectionTitle}>⚔️ Players ({activePlayers.length}/{room.maxPlayers})</Text>
          {activePlayers.map((p, i) => (
            <View key={p.id} style={styles.playerRow}>
              <View style={styles.playerSeed}>
                <Text style={styles.playerSeedText}>{i + 1}</Text>
              </View>
              <PlayerAvatar
                avatarUrl={p.isBot ? undefined : p.avatarUrl}
                emoji={p.isBot ? '🤖' : '🧙'}
                size="sm"
                style={styles.playerAvatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.playerName}>{p.name}</Text>
                {(p.deckColors && p.deckColors.length > 0) || p.deckName ? (
                  <View style={styles.deckInfoRow}>
                    {p.deckColors && p.deckColors.length > 0 && (
                      <MTGColorPips colors={p.deckColors} size="sm" />
                    )}
                    {p.deckName ? (
                      <Text style={styles.deckNameText} numberOfLines={1}>
                        {p.deckName.length > 12 ? p.deckName.slice(0, 12) + '…' : p.deckName}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
              {p.isBot && <Badge label="Bot" variant="muted" />}
              {!p.isBot && p.id === room.ownerId && <Badge label="Host" variant="gold" />}
              {!p.isBot && p.id === state.currentUserId && <Badge label="You" variant="blue" />}
              {!p.isBot && p.id === state.currentUserId && !amSpectating && (
                <TouchableOpacity
                  style={styles.pencilBtn}
                  onPress={() => {
                    setDeckName(p.deckName ?? state.lastDeckName ?? '');
                    setDeckColors(p.deckColors ?? state.lastDeckColors ?? []);
                    setDeckModal(true);
                  }}
                >
                  <Text style={styles.pencilBtnText}>✏️</Text>
                </TouchableOpacity>
              )}
              {p.isBot && isOwner && !hasStarted && (
                <>
                  <TouchableOpacity
                    style={styles.pencilBtn}
                    onPress={() => {
                      setRenameBotId(p.id);
                      setRenameBotName(p.name);
                      setRenameBotModal(true);
                    }}
                  >
                    <Text style={styles.pencilBtnText}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeBotBtn}
                    onPress={() => removeBot(room.id, p.id)}
                  >
                    <Text style={styles.removeBotText}>✕</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ))}
          {isOwner && !hasStarted && activePlayers.length < room.maxPlayers && (
            <TouchableOpacity style={styles.addBotRow} onPress={() => addBot(room.id)}>
              <Text style={styles.addBotIcon}>🤖</Text>
              <Text style={styles.addBotLabel}>Add Bot</Text>
            </TouchableOpacity>
          )}

          {/* Spectators section */}
          {spectatorPlayers.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, styles.spectatorsSectionTitle]}>👁 Spectators</Text>
              {spectatorPlayers.map(p => (
                <View key={p.id} style={[styles.playerRow, styles.spectatorRow]}>
                  <PlayerAvatar
                    avatarUrl={p.avatarUrl}
                    emoji="🧙"
                    size="sm"
                    style={[styles.playerAvatar, styles.spectatorAvatar]}
                  />
                  <Text style={styles.spectatorName}>{p.name}</Text>
                  {p.id === state.currentUserId && <Badge label="You" variant="blue" />}
                </View>
              ))}
            </>
          )}
        </Card>

        {/* Deck edit modal */}
        <Modal
          visible={deckModal}
          transparent
          animationType="slide"
          onRequestClose={() => setDeckModal(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>🎴 My Deck</Text>
              <Divider />
              <Label>Deck Name</Label>
              <TextInput
                style={styles.deckInput}
                value={deckName}
                onChangeText={setDeckName}
                placeholder="e.g. Gruul Aggro"
                placeholderTextColor={Colors.textFaint}
                maxLength={40}
                selectionColor={Colors.gold}
              />
              <Label style={{ marginTop: Spacing.md }}>Colors</Label>
              <Row style={styles.colorToggles}>
                {(['W', 'U', 'B', 'R', 'G'] as MTGColor[]).map(c => {
                  const active = deckColors.includes(c);
                  const colorMap: Record<MTGColor, { bg: string; text: string }> = {
                    W: { bg: '#f0ede0', text: '#3a3520' },
                    U: { bg: '#1a5fa8', text: '#fff' },
                    B: { bg: '#1a1a1a', text: '#ccc' },
                    R: { bg: '#c0281c', text: '#fff' },
                    G: { bg: '#1a6b2a', text: '#fff' },
                  };
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.colorToggle,
                        active && { backgroundColor: colorMap[c].bg, borderColor: Colors.gold },
                      ]}
                      onPress={() => {
                        setDeckColors(prev =>
                          prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                        );
                      }}
                    >
                      <Text style={[styles.colorToggleText, active && { color: colorMap[c].text }]}>
                        {c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </Row>
              <Row style={{ gap: 10, marginTop: Spacing.lg }}>
                <Button
                  label="Confirm"
                  onPress={() => {
                    dispatch({
                      type: 'SET_DECK_INFO',
                      roomId: room.id,
                      playerId: state.currentUserId,
                      deckName,
                      deckColors,
                      isCurrentUser: true,
                    });
                    setDeckModal(false);
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Cancel"
                  onPress={() => setDeckModal(false)}
                  variant="outline"
                  style={{ flex: 1 }}
                />
              </Row>
            </View>
          </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Rename bot modal */}
        <Modal
          visible={renameBotModal}
          transparent
          animationType="fade"
          onRequestClose={() => setRenameBotModal(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Rename Bot</Text>
              <TextInput
                style={styles.modalInput}
                value={renameBotName}
                onChangeText={setRenameBotName}
                maxLength={20}
                autoFocus
                selectTextOnFocus
                placeholderTextColor={Colors.textFaint}
              />
              <View style={styles.modalActions}>
                <Button
                  label="Save"
                  onPress={() => {
                    const trimmed = renameBotName.trim();
                    if (trimmed) renameBot(room.id, renameBotId, trimmed);
                    setRenameBotModal(false);
                  }}
                />
                <Button label="Cancel" variant="ghost" onPress={() => setRenameBotModal(false)} />
              </View>
            </View>
          </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Tournament controls / nav */}
        {!hasStarted && isOwner && (
          <Card gold style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
            <Text style={styles.ctaIcon}>🏆</Text>
            <Text style={styles.ctaTitle}>Ready to Begin?</Text>
            <Text style={styles.ctaSub}>
              {activePlayers.length < minPlayers
                ? `Needs at least ${minPlayers} players to start (${activePlayers.length} joined).`
                : `${activePlayers.length} players locked in. Generate the bracket and start!`}
            </Text>
            <Button
              label="Start Tournament"
              onPress={startTournament}
              size="lg"
              fullWidth
              disabled={activePlayers.length < minPlayers}
              style={{ marginTop: Spacing.lg }}
            />
          </Card>
        )}

        {/* Two-phase phase banner */}
        {hasStarted && isTwoPhase && (
          <View style={[styles.phaseBanner, room.phase === 2 && styles.phaseBannerElim]}>
            <Text style={styles.phaseBannerIcon}>{room.phase === 1 ? '📊' : '🏆'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.phaseBannerTitle}>
                {room.phase === 1
                  ? `Phase 1: ${phase1Mode === 'fixed_games' ? 'Fixed Games' : 'Round Robin'}`
                  : 'Phase 2: Seeded Elimination'}
              </Text>
              {room.phase === 1 && (
                <Text style={styles.phaseBannerSub}>
                  {completedRRGames}/{totalRRGames} games complete ·{' '}
                  {phase1Mode === 'fixed_games'
                    ? `${gamesCount} round${gamesCount > 1 ? 's' : ''} per player`
                    : `${gamesCount} game${gamesCount > 1 ? 's' : ''} per opponent`}
                </Text>
              )}
              {room.phase === 2 && (
                <Text style={styles.phaseBannerSub}>Seeded from Round Robin standings</Text>
              )}
            </View>
          </View>
        )}

        {/* Phase 2 advance button (owner only, phase 1) */}
        {hasStarted && isTwoPhase && room.phase === 1 && isOwner && (
          <Card gold style={{ marginBottom: Spacing.md }}>
            <Text style={styles.advanceTitle}>Ready for Phase 2?</Text>
            <Text style={styles.advanceSub}>
              {completedRRGames < totalRRGames
                ? `${totalRRGames - completedRRGames} Round Robin games still pending.`
                : 'All Round Robin games complete!'}
              {' '}Advancing will seed players by their current standings and generate the elimination bracket.
            </Text>
            <Button
              label="Advance to Phase 2 →"
              onPress={advanceToPhase2}
              size="lg"
              fullWidth
              style={{ marginTop: Spacing.md }}
            />
          </Card>
        )}

        {/* Revert to Phase 1 button (owner only, phase 2) */}
        {hasStarted && isTwoPhase && room.phase === 2 && isOwner && (
          <Card style={{ marginBottom: Spacing.md }}>
            <Text style={styles.advanceTitle}>⬅ Back to Phase 1?</Text>
            <Text style={styles.advanceSub}>
              Clears the elimination bracket. All Round Robin results are kept intact.
            </Text>
            <Button
              label="Revert to Phase 1"
              onPress={confirmRevertToPhase1}
              variant="outline"
              size="lg"
              fullWidth
              style={{ marginTop: Spacing.md }}
            />
          </Card>
        )}

        {/* Round timer — only shown when in_progress and owner has set a duration */}
        {room.status === 'in_progress' && roundDuration > 0 && (
          <RoundTimer durationMinutes={roundDuration} isOwner={isOwner} />
        )}

        {hasStarted && (
          <>
            <Text style={styles.sectionTitle}>Navigate</Text>
            <View style={styles.navGrid}>
              {/* Combined Schedule / Bracket tile — bracket-mode when an active bracket exists */}
              {(() => {
                const bracketActive =
                  isCommander ||
                  effectiveFmt === 'single_elim' ||
                  effectiveFmt === 'double_elim' ||
                  effectiveFmt === 'seeded' ||
                  (isTwoPhase && room.phase === 2);
                const icon  = bracketActive ? (isCommander ? '👑' : '🏆') : '📅';
                const label = bracketActive ? (isCommander ? 'Pods' : 'Bracket') : 'Schedule';
                const dest  = bracketActive
                  ? (isCommander ? 'CommanderPods' : 'Bracket')
                  : 'Schedule';
                return (
                  <NavTile
                    icon={icon}
                    label={label}
                    onPress={() => navigation.navigate(dest as any, { roomId: room.id })}
                  />
                );
              })()}
              <NavTile icon="📊" label="Standings" onPress={() => navigation.navigate('Standings', { roomId: room.id })} />
              <NavTile icon="🪑" label="Seating" onPress={() => navigation.navigate('Seating', { roomId: room.id })} />
            </View>

            {/* Commander: mini pod status */}
            {isCommander && room.commanderPods && (() => {
              const maxRound = Math.max(...room.commanderPods.map(p => p.round));
              const currentPods = room.commanderPods.filter(p => p.round === maxRound);
              const done = currentPods.filter(p => !!p.results).length;
              return (
                <Card>
                  <Text style={styles.sectionTitle}>👑 Round {maxRound} Pods</Text>
                  <Text style={[styles.sectionTitle, { color: Colors.textMuted, fontSize: 13, fontFamily: 'System' }]}>
                    {done}/{currentPods.length} pods complete
                  </Text>
                  <Button
                    label="View Pods →"
                    onPress={() => navigation.navigate('CommanderPods', { roomId: room.id })}
                    variant="ghost"
                    size="sm"
                    style={{ marginTop: 4 }}
                  />
                </Card>
              );
            })()}

            {/* Champion banner — shown for all completed tournament types */}
            {champion && (() => {
              const championPlayer = room.players.find(p => p.id === champion.playerId);
              return (
                <Card gold style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
                  <Text style={{ fontSize: 40, marginBottom: Spacing.sm }}>🏆</Text>
                  <Text style={styles.ctaTitle}>Tournament Complete!</Text>
                  <Text style={[styles.ctaSub, { fontSize: 16, color: Colors.goldLight, fontFamily: 'Georgia', marginBottom: 4 }]}>
                    {champion.playerName}
                  </Text>
                  <Text style={styles.ctaSub}>{champion.wins}W – {champion.losses}L</Text>
                  {(championPlayer?.deckColors?.length || championPlayer?.deckName) ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm }}>
                      {championPlayer?.deckColors && championPlayer.deckColors.length > 0 && (
                        <MTGColorPips colors={championPlayer.deckColors} size="md" />
                      )}
                      {championPlayer?.deckName ? (
                        <Text style={styles.ctaSub}>{championPlayer.deckName}</Text>
                      ) : null}
                    </View>
                  ) : null}
                  <Button
                    label="📤 Export Results"
                    onPress={exportResults}
                    variant="outline"
                    size="sm"
                    style={{ marginTop: Spacing.lg }}
                  />
                </Card>
              );
            })()}

            {/* Mini standings preview */}
            {standings.length > 0 && !isCommander && (
              <Card>
                <Text style={styles.sectionTitle}>🥇 Live Standings</Text>
                {standings.slice(0, 3).map((s, i) => (
                  <View key={s.playerId} style={styles.standingsRow}>
                    <Text style={[styles.standingsRank, i === 0 ? styles.gold : styles.silver]}>#{s.rank}</Text>
                    <Text style={styles.standingsName}>{s.playerName}</Text>
                    <Text style={styles.standingsWins}>{s.wins}W</Text>
                    <Text style={styles.standingsLosses}>{s.losses}L</Text>
                  </View>
                ))}
                <Button
                  label="Full Standings →"
                  onPress={() => navigation.navigate('Standings', { roomId: room.id })}
                  variant="ghost"
                  size="sm"
                  style={{ marginTop: 4 }}
                />
              </Card>
            )}
          </>
        )}

        {isOwner && (
          <>
            <Divider />
            {/* Complete / Reopen */}
            {room.status === 'in_progress' && (
              <Button
                label="✅ Complete Tournament"
                onPress={() => Alert.alert(
                  'Complete Tournament?',
                  'This will close the room and save results to tournament history. You can reopen it later.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Complete', onPress: () => dispatch({ type: 'COMPLETE_TOURNAMENT', roomId: room.id }) },
                  ],
                )}
                variant="outline"
                fullWidth
                style={{ marginBottom: Spacing.sm }}
              />
            )}
            {room.status === 'completed' && (
              <Button
                label="🔓 Reopen Tournament"
                onPress={() => Alert.alert(
                  'Reopen Tournament?',
                  'This will mark the room as in progress again and remove the saved history entry.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Reopen', onPress: () => dispatch({ type: 'REOPEN_TOURNAMENT', roomId: room.id }) },
                  ],
                )}
                variant="outline"
                fullWidth
                style={{ marginBottom: Spacing.sm }}
              />
            )}
            <Button
              label="⚙️ Room Settings"
              onPress={() => navigation.navigate('RoomSettings', { roomId: room.id })}
              variant="outline"
              fullWidth
            />
          </>
        )}
      </ScrollView>

      <VictoryOverlay
        visible={showVictory}
        winnerName={champion?.playerName ?? ''}
        wins={champion?.wins ?? 0}
        losses={champion?.losses ?? 0}
        deckName={room.players.find(p => p.id === champion?.playerId)?.deckName}
        deckColors={room.players.find(p => p.id === champion?.playerId)?.deckColors}
        onDismiss={() => setShowVictory(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  roomName: { fontFamily: 'Georgia', fontSize: 18, color: Colors.gold, flex: 1, marginRight: 8 },
  fmtText: { ...Typography.bodyMD, fontWeight: '600' },
  playerCount: { ...Typography.bodySM, color: Colors.textMuted },
  setNameText: { ...Typography.bodySM, color: Colors.textMuted, marginBottom: 10 },
  qrContainer: { alignItems: 'center', marginTop: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  qrHint: { ...Typography.bodySM, color: Colors.textFaint, marginTop: 6 },
  suggestedBadge: {
    ...Typography.bodySM,
    color: Colors.amber,
    backgroundColor: 'rgba(230,126,34,0.1)',
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  sectionTitle: { ...Typography.label, marginBottom: Spacing.sm },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  playerSeed: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerSeedText: { fontSize: 10, color: Colors.gold, fontWeight: '700' },
  playerAvatar: { borderWidth: 1, borderColor: Colors.border },
  playerName: { ...Typography.bodyMD },
  deckInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  deckNameText: { ...Typography.bodySM, color: Colors.textMuted },
  pencilBtn: { padding: 4 },
  pencilBtnText: { fontSize: 14 },
  removeBotBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBotText: { fontSize: 10, color: Colors.textMuted, fontWeight: '700' },
  addBotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 10,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  addBotIcon: { fontSize: 18 },
  addBotLabel: { ...Typography.bodySM, color: Colors.textMuted },
  modalOverlay: { flex: 1, backgroundColor: Colors.bgOverlay, justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.xxxl,
  },
  modalInput: {
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    color: Colors.text,
    fontSize: 15,
    fontFamily: 'System',
    marginBottom: Spacing.md,
  },
  modalActions: { gap: Spacing.sm },
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
  deckInput: {
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    color: Colors.text,
    fontSize: 15,
    fontFamily: 'System',
    marginBottom: 4,
  },
  colorToggles: { gap: Spacing.sm, marginTop: 4 },
  colorToggle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgSurface,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorToggleText: { fontFamily: 'System', fontWeight: '700', fontSize: 14, color: Colors.textMuted },
  ctaIcon: { fontSize: 40, marginBottom: Spacing.sm },
  ctaTitle: { fontFamily: 'Georgia', fontSize: 18, color: Colors.gold, marginBottom: 6 },
  ctaSub: { ...Typography.bodySM, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  navGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  navTile: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  navTileDisabled: { borderColor: Colors.border, opacity: 0.5 },
  navTileIcon: { fontSize: 28 },
  navTileLabel: { ...Typography.label, color: Colors.textGold, textAlign: 'center' },
  standingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: Spacing.sm,
  },
  standingsRank: { fontFamily: 'Georgia', fontSize: 16, minWidth: 28 },
  standingsName: { ...Typography.bodyMD, flex: 1 },
  standingsWins: { ...Typography.bodyMD, color: Colors.greenLight, minWidth: 28, textAlign: 'right' },
  standingsLosses: { ...Typography.bodyMD, color: Colors.redLight, minWidth: 28, textAlign: 'right' },
  gold: { color: Colors.gold },
  silver: { color: '#aaa' },
  phaseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(22,160,133,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(22,160,133,0.35)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  phaseBannerElim: {
    backgroundColor: Colors.goldGlow,
    borderColor: Colors.borderGold,
  },
  phaseBannerIcon: { fontSize: 24 },
  phaseBannerTitle: { ...Typography.bodyMD, color: Colors.text, fontWeight: '600' },
  phaseBannerSub: { ...Typography.bodySM, color: Colors.textMuted, marginTop: 2 },
  advanceTitle: { fontFamily: 'Georgia', fontSize: 16, color: Colors.gold, marginBottom: 6 },
  advanceSub: { ...Typography.bodySM, color: Colors.textMuted, lineHeight: 18 },

  // Spectator UI
  spectatorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(100,100,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(100,100,255,0.25)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  spectatorBannerIcon: { fontSize: 20 },
  spectatorBannerText: { ...Typography.bodySM, color: Colors.textMuted, flex: 1, lineHeight: 18 },
  spectatorsSectionTitle: { marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
  spectatorRow: { opacity: 0.75 },
  spectatorAvatar: { opacity: 0.7 },
  spectatorName: { ...Typography.bodyMD, color: Colors.textMuted, flex: 1 },
});
