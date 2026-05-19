// ─────────────────────────────────────────────
// MTG Draft Forge — Profile Screen
// ─────────────────────────────────────────────
import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { Colors, Spacing, Radius, Typography, FORMATS } from '../theme';
import { Card, Row, Divider, EmptyState, Badge, SectionHeader, PlayerAvatar, MTGColorPips } from '../components/UI';
import { useApp } from '../services/AppContext';

const PROFILE_EMOJIS = [
  '🧙', '🧝', '🐉', '⚔️', '🔮', '🌿', '💀', '🔥', '❄️', '⚡',
  '🦅', '🐺', '🦁', '🐍', '🌊', '🏔️', '🌑', '☀️', '🌙', '🎴',
];

export default function ProfileScreen() {
  const { state, setUserName, setProfileEmoji, setAvatarUrl } = useApp();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(state.currentUserName);
  const [emojiModalVisible, setEmojiModalVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);

  // Persistent tournament history for the current user, newest first
  const history = [...state.tournamentHistory]
    .filter(h => h.standings.some(s => s.playerId === state.currentUserId))
    .sort((a, b) => b.completedAt - a.completedAt);

  // ── Lifetime stats derived from history ──────────────────────────────────
  const lifetimeStats = useMemo(() => {
    if (history.length === 0) return null;

    let totalWins = 0;
    let totalLosses = 0;
    let totalGames = 0;
    let totalPlacementFraction = 0; // placement / playerCount, so 1st/8 = 0.125
    const formatWins: Record<string, number> = {};
    const formatGames: Record<string, number> = {};
    const formatPlays: Record<string, number> = {};

    for (const entry of history) {
      const me = entry.standings.find(s => s.playerId === state.currentUserId);
      if (!me) continue;
      totalWins += me.wins;
      totalLosses += me.losses;
      totalGames += me.wins + me.losses;
      totalPlacementFraction += me.rank / entry.playerCount;

      const fmt = entry.format;
      formatWins[fmt] = (formatWins[fmt] ?? 0) + me.wins;
      formatGames[fmt] = (formatGames[fmt] ?? 0) + me.wins + me.losses;
      formatPlays[fmt] = (formatPlays[fmt] ?? 0) + 1;
    }

    const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
    const avgPlacement = history.length > 0
      ? (totalPlacementFraction / history.length * 100).toFixed(0)
      : null;

    // Most played format (by tournament count)
    const mostPlayed = Object.entries(formatPlays).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Best format: highest win rate with at least 1 tournament played
    const bestFormat = Object.entries(formatGames)
      .filter(([, g]) => g > 0)
      .map(([fmt, g]) => ({ fmt, wr: (formatWins[fmt] ?? 0) / g }))
      .sort((a, b) => b.wr - a.wr)[0]?.fmt ?? null;

    const fmtMeta = (id: string) => FORMATS.find(f => f.id === id);

    return { totalWins, totalLosses, winRate, avgPlacement, mostPlayed, bestFormat, fmtMeta };
  }, [history, state.currentUserId]);

  function saveName() {
    const trimmed = nameInput.trim();
    if (trimmed) setUserName(trimmed);
    setEditingName(false);
  }

  function cancelNameEdit() {
    setNameInput(state.currentUserName);
    setEditingName(false);
  }

  async function handlePickPhoto(source: 'library' | 'camera') {
    setAvatarModalVisible(false);
    const launch = source === 'camera' ? launchCamera : launchImageLibrary;
    const result = await launch({
      mediaType: 'photo',
      quality: 0.7,
      maxWidth: 200,
      maxHeight: 200,
      includeBase64: true,
    });

    if (result.didCancel || result.errorCode) return;

    const asset = result.assets?.[0];
    if (!asset?.base64) {
      Alert.alert('Could not read image', 'Please try selecting a different photo.');
      return;
    }

    // Build a data URL React Native's Image component can display directly
    const mime = (asset.type ?? 'image/jpeg').toLowerCase().split(';')[0].trim();
    setAvatarUrl(`data:${mime};base64,${asset.base64}`);
  }

  function handleRemoveAvatar() {
    setAvatarModalVisible(false);
    Alert.alert(
      'Remove Avatar',
      'Remove your current avatar photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => setAvatarUrl('') },
      ],
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.container}>

        {/* Header */}
        <Text style={s.screenTitle}>Profile</Text>

        {/* Avatar + Name card */}
        <Card gold style={s.profileCard}>
          {/* Avatar — tapping opens image URL modal; long-press opens emoji picker */}
          <TouchableOpacity
            style={s.avatarWrap}
            onPress={() => setAvatarModalVisible(true)}
            onLongPress={() => setEmojiModalVisible(true)}
            activeOpacity={0.8}
          >
            <PlayerAvatar
              avatarUrl={state.avatarUrl}
              emoji={state.profileEmoji}
              size="lg"
              style={s.avatarImage}
            />
            <View style={s.editAvatarTag}>
              <Text style={s.editAvatarText}>📷</Text>
            </View>
          </TouchableOpacity>
          <Text style={s.avatarHint}>Tap to change photo · Hold for emoji</Text>

          {/* Name row */}
          {editingName ? (
            <View style={s.nameEditRow}>
              <TextInput
                style={s.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                maxLength={30}
                returnKeyType="done"
                onSubmitEditing={saveName}
                selectionColor={Colors.gold}
              />
              <TouchableOpacity style={s.saveBtn} onPress={saveName}>
                <Text style={s.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={cancelNameEdit}>
                <Text style={s.cancelBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.nameRow} onPress={() => { setNameInput(state.currentUserName); setEditingName(true); }}>
              <Text style={s.nameText}>{state.currentUserName || 'Unnamed Wizard'}</Text>
              <Text style={s.nameEditIcon}>✏️</Text>
            </TouchableOpacity>
          )}

          <Text style={s.userIdText}>ID: {state.currentUserId.slice(0, 8)}…</Text>
        </Card>

        {/* Avatar picker action sheet */}
        <Modal
          visible={avatarModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setAvatarModalVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>Change Avatar</Text>
              <Divider />

              {/* Current avatar preview */}
              <View style={s.avatarPreviewWrap}>
                <PlayerAvatar
                  avatarUrl={state.avatarUrl}
                  emoji={state.profileEmoji}
                  size="lg"
                />
              </View>

              {/* Actions */}
              <TouchableOpacity style={s.actionRow} onPress={() => handlePickPhoto('library')}>
                <Text style={s.actionIcon}>🖼️</Text>
                <Text style={s.actionLabel}>Choose from Library</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionRow} onPress={() => handlePickPhoto('camera')}>
                <Text style={s.actionIcon}>📷</Text>
                <Text style={s.actionLabel}>Take Photo</Text>
              </TouchableOpacity>
              {state.avatarUrl ? (
                <TouchableOpacity style={[s.actionRow, s.actionRowDanger]} onPress={handleRemoveAvatar}>
                  <Text style={s.actionIcon}>🗑️</Text>
                  <Text style={[s.actionLabel, s.actionLabelDanger]}>Remove Photo</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity style={s.closeBtn} onPress={() => setAvatarModalVisible(false)}>
                <Text style={s.closeBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Emoji picker modal (fallback avatar) */}
        <Modal
          visible={emojiModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setEmojiModalVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>Choose Fallback Emoji</Text>
              <Divider />
              <View style={s.emojiGrid}>
                {PROFILE_EMOJIS.map(emoji => (
                  <TouchableOpacity
                    key={emoji}
                    style={[s.emojiBtn, state.profileEmoji === emoji && s.emojiBtnSelected]}
                    onPress={() => {
                      setProfileEmoji(emoji);
                      setEmojiModalVisible(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={s.emojiOption}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={s.closeBtn} onPress={() => setEmojiModalVisible(false)}>
                <Text style={s.closeBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Lifetime stats */}
        {lifetimeStats && (
          <Card gold style={s.statsCard}>
            <Text style={s.statsTitle}>📊 Lifetime Stats</Text>
            <View style={s.statsGrid}>
              <View style={s.statCell}>
                <Text style={s.statValue}>{lifetimeStats.totalWins}W / {lifetimeStats.totalLosses}L</Text>
                <Text style={s.statLabel}>ALL-TIME RECORD</Text>
              </View>
              <View style={s.statCell}>
                <Text style={s.statValue}>{lifetimeStats.winRate}%</Text>
                <Text style={s.statLabel}>WIN RATE</Text>
              </View>
              <View style={s.statCell}>
                <Text style={s.statValue}>{history.length}</Text>
                <Text style={s.statLabel}>TOURNAMENTS</Text>
              </View>
              {lifetimeStats.avgPlacement && (
                <View style={s.statCell}>
                  <Text style={s.statValue}>Top {lifetimeStats.avgPlacement}%</Text>
                  <Text style={s.statLabel}>AVG PLACEMENT</Text>
                </View>
              )}
            </View>
            {(lifetimeStats.mostPlayed || lifetimeStats.bestFormat) && (
              <View style={s.statsFooter}>
                {lifetimeStats.mostPlayed && (
                  <Text style={s.statsFooterText}>
                    Most played: {lifetimeStats.fmtMeta(lifetimeStats.mostPlayed)?.icon} {lifetimeStats.fmtMeta(lifetimeStats.mostPlayed)?.name}
                  </Text>
                )}
                {lifetimeStats.bestFormat && lifetimeStats.bestFormat !== lifetimeStats.mostPlayed && (
                  <Text style={s.statsFooterText}>
                    Best format: {lifetimeStats.fmtMeta(lifetimeStats.bestFormat)?.icon} {lifetimeStats.fmtMeta(lifetimeStats.bestFormat)?.name}
                  </Text>
                )}
              </View>
            )}
          </Card>
        )}

        {/* Tournament History */}
        <SectionHeader style={s.sectionHeader}>🏆 Tournament History</SectionHeader>

        {history.length === 0 ? (
          <EmptyState
            icon="🏆"
            title="No completed tournaments yet"
            subtitle={"Complete your first tournament to see\nstandings, rankings and match results here."}
          />
        ) : (
          history.map(entry => {
            const fmt = FORMATS.find(f => f.id === entry.format);
            const myEntry = entry.standings.find(s => s.playerId === state.currentUserId);
            const champion = entry.standings.find(s => s.rank === 1);
            const date = new Date(entry.completedAt).toLocaleDateString(undefined, {
              year: 'numeric', month: 'short', day: 'numeric',
            });
            const isChampion = myEntry?.rank === 1;

            return (
              <Card key={entry.id} style={[s.historyCard, isChampion && s.historyCardGold]}>
                <Row between style={{ marginBottom: 4 }}>
                  <Text style={s.historyRoomName} numberOfLines={1}>{entry.roomName}</Text>
                  <Badge label={fmt?.shortName ?? entry.format} variant="muted" />
                </Row>

                {/* Champion banner (if someone else won, show their name) */}
                {champion && !isChampion && (
                  <Text style={s.championText}>🏆 {champion.playerName} won</Text>
                )}
                {isChampion && (
                  <Text style={[s.championText, { color: Colors.gold }]}>🏆 You won!</Text>
                )}

                <Text style={s.historyDate}>{date} · {entry.playerCount} players</Text>

                {myEntry && (
                  <View style={s.historyStats}>
                    <View style={s.historyStat}>
                      <Text style={s.historyStatLabel}>RANK</Text>
                      <Text style={s.historyStatValue}>
                        {myEntry.rank === 1 ? '🥇' : myEntry.rank === 2 ? '🥈' : myEntry.rank === 3 ? '🥉' : `#${myEntry.rank}`}
                      </Text>
                    </View>
                    <View style={s.historyStatDivider} />
                    <View style={s.historyStat}>
                      <Text style={s.historyStatLabel}>RECORD</Text>
                      <Text style={s.historyStatValue}>
                        <Text style={{ color: Colors.greenLight }}>{myEntry.wins}W</Text>
                        <Text style={{ color: Colors.textMuted }}> / </Text>
                        <Text style={{ color: Colors.redLight }}>{myEntry.losses}L</Text>
                      </Text>
                    </View>
                    {myEntry.deckName || (myEntry.deckColors && myEntry.deckColors.length > 0) ? (
                      <>
                        <View style={s.historyStatDivider} />
                        <View style={s.historyStat}>
                          <Text style={s.historyStatLabel}>DECK</Text>
                          <View style={{ alignItems: 'center', gap: 4 }}>
                            {myEntry.deckColors && myEntry.deckColors.length > 0 && (
                              <MTGColorPips colors={myEntry.deckColors} size="sm" />
                            )}
                            {myEntry.deckName ? (
                              <Text style={s.deckNameText} numberOfLines={1}>{myEntry.deckName}</Text>
                            ) : null}
                          </View>
                        </View>
                      </>
                    ) : null}
                  </View>
                )}

                <Text style={s.historyPlayers}>
                  {entry.standings.map(s => s.playerName).join(', ')}
                </Text>
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  screenTitle: {
    fontFamily: 'Georgia',
    fontSize: 22,
    color: Colors.gold,
    marginBottom: Spacing.lg,
  },

  // Profile card
  profileCard: { alignItems: 'center', paddingVertical: Spacing.xl },
  avatarWrap: { position: 'relative', marginBottom: 4 },
  avatarImage: { borderWidth: 2, borderColor: Colors.borderGold },
  avatarHint: { ...Typography.bodySM, color: Colors.textFaint, marginBottom: Spacing.md },
  editAvatarTag: {
    position: 'absolute',
    bottom: -2,
    right: -6,
    backgroundColor: Colors.bgSurface,
    borderRadius: Radius.full,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderGold,
  },
editAvatarText: { fontSize: 14 },

  // Avatar picker modal
  avatarPreviewWrap: { alignItems: 'center', marginVertical: Spacing.lg },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  actionRowDanger: { marginTop: 4 },
  actionIcon: { fontSize: 22, width: 30, textAlign: 'center' },
  actionLabel: { ...Typography.bodyMD, color: Colors.text },
  actionLabelDanger: { color: Colors.redLight },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 6 },
  nameText: { fontFamily: 'Georgia', fontSize: 20, color: Colors.text },
  nameEditIcon: { fontSize: 14, opacity: 0.6 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 6 },
  nameInput: {
    flex: 1,
    fontFamily: 'Georgia',
    fontSize: 18,
    color: Colors.text,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  saveBtn: {
    backgroundColor: Colors.goldDark,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  saveBtnText: { color: Colors.text, fontWeight: '600', fontSize: 13 },
  cancelBtn: { padding: 8 },
  cancelBtnText: { color: Colors.textMuted, fontSize: 16 },
  userIdText: { ...Typography.bodySM, color: Colors.textFaint },

  // Emoji picker modal
  modalOverlay: { flex: 1, backgroundColor: Colors.bgOverlay, justifyContent: 'flex-end' },
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
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md, justifyContent: 'center' },
  emojiBtn: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgSurface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiBtnSelected: { borderColor: Colors.gold, backgroundColor: Colors.goldGlow },
  emojiOption: { fontSize: 28 },
  closeBtn: {
    marginTop: Spacing.lg,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  closeBtnText: { ...Typography.bodyMD, color: Colors.textMuted },

  // Section header
  sectionHeader: { marginTop: Spacing.sm, marginBottom: Spacing.sm },

  // History cards
  historyCard: { marginBottom: Spacing.sm },
  historyCardGold: { borderColor: Colors.borderGold, backgroundColor: Colors.goldGlow },
  championText: { ...Typography.bodySM, color: Colors.textMuted, marginBottom: 2 },
  historyRoomName: {
    fontFamily: 'Georgia',
    fontSize: 15,
    color: Colors.text,
    flex: 1,
    marginRight: Spacing.sm,
  },
  historyDate: { ...Typography.bodySM, color: Colors.textFaint, marginBottom: Spacing.md },
  historyStats: {
    flexDirection: 'row',
    backgroundColor: Colors.bgSurface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  historyStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: 4,
  },
  historyStatDivider: { width: 1, backgroundColor: Colors.border },
  historyStatLabel: { ...Typography.labelSM, color: Colors.textFaint },
  historyStatValue: { fontFamily: 'Georgia', fontSize: 16, color: Colors.text },
  deckNameText: { ...Typography.bodySM, color: Colors.textMuted, maxWidth: 70, textAlign: 'center' },
  historyPlayers: { ...Typography.bodySM, color: Colors.textFaint, lineHeight: 18 },

  // Lifetime stats
  statsCard: { marginBottom: Spacing.lg },
  statsTitle: { fontFamily: 'Georgia', fontSize: 16, color: Colors.gold, marginBottom: Spacing.md },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCell: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.bgSurface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  statValue: { fontFamily: 'Georgia', fontSize: 18, color: Colors.text },
  statLabel: { ...Typography.labelSM, color: Colors.textFaint, marginTop: 2 },
  statsFooter: { marginTop: Spacing.sm, gap: 2 },
  statsFooterText: { ...Typography.bodySM, color: Colors.textMuted },
});
