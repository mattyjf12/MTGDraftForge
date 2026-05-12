// ─────────────────────────────────────────────
// MTG Draft Forge — Profile Screen
// ─────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, SafeAreaView, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Colors, Spacing, Radius, Typography, FORMATS } from '../theme';
import { Card, Row, Divider, EmptyState, Badge, SectionHeader, PlayerAvatar } from '../components/UI';
import { MTGColorPips } from '../components/UI';
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
  const [urlInput, setUrlInput] = useState(state.avatarUrl);
  const [urlPreviewError, setUrlPreviewError] = useState(false);

  // Persistent tournament history for the current user, newest first
  const history = [...state.tournamentHistory]
    .filter(h => h.standings.some(s => s.playerId === state.currentUserId))
    .sort((a, b) => b.completedAt - a.completedAt);

  function saveName() {
    const trimmed = nameInput.trim();
    if (trimmed) setUserName(trimmed);
    setEditingName(false);
  }

  function cancelNameEdit() {
    setNameInput(state.currentUserName);
    setEditingName(false);
  }

  function saveAvatarUrl() {
    setAvatarUrl(urlInput.trim());
    setAvatarModalVisible(false);
  }

  function clearAvatar() {
    setUrlInput('');
    setAvatarUrl('');
    setAvatarModalVisible(false);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container}>

        {/* Header */}
        <Text style={s.screenTitle}>Profile</Text>

        {/* Avatar + Name card */}
        <Card gold style={s.profileCard}>
          {/* Avatar — tapping opens image URL modal; long-press opens emoji picker */}
          <TouchableOpacity
            style={s.avatarWrap}
            onPress={() => { setUrlInput(state.avatarUrl); setUrlPreviewError(false); setAvatarModalVisible(true); }}
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
              <Text style={s.editAvatarText}>✏️</Text>
            </View>
          </TouchableOpacity>
          <Text style={s.avatarHint}>Tap to set image URL · Hold for emoji</Text>

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

        {/* Avatar URL modal */}
        <Modal
          visible={avatarModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setAvatarModalVisible(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.modalOverlay}>
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>Set Avatar Image</Text>
              <Divider />

              {/* Live preview */}
              <View style={s.avatarPreviewWrap}>
                {urlInput.trim() && !urlPreviewError ? (
                  <Image
                    source={{ uri: urlInput.trim() }}
                    style={s.avatarPreview}
                    onError={() => setUrlPreviewError(true)}
                  />
                ) : (
                  <View style={[s.avatarPreview, s.avatarPreviewFallback]}>
                    <Text style={{ fontSize: 44 }}>{state.profileEmoji}</Text>
                    {urlPreviewError && (
                      <Text style={s.previewError}>⚠️ Couldn't load image</Text>
                    )}
                  </View>
                )}
              </View>

              <Text style={s.urlLabel}>Image URL</Text>
              <TextInput
                style={s.urlInput}
                value={urlInput}
                onChangeText={v => { setUrlInput(v); setUrlPreviewError(false); }}
                placeholder="https://example.com/avatar.png"
                placeholderTextColor={Colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                selectionColor={Colors.gold}
              />

              <View style={s.modalBtns}>
                <TouchableOpacity style={s.saveBtn} onPress={saveAvatarUrl}>
                  <Text style={s.saveBtnText}>Save</Text>
                </TouchableOpacity>
                {state.avatarUrl ? (
                  <TouchableOpacity style={s.clearBtn} onPress={clearAvatar}>
                    <Text style={s.clearBtnText}>Remove</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={s.cancelBtn} onPress={() => setAvatarModalVisible(false)}>
                  <Text style={s.cancelBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          </KeyboardAvoidingView>
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
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderGold,
  },
  editAvatarText: { fontSize: 12 },

  // Avatar URL modal
  avatarPreviewWrap: { alignItems: 'center', marginVertical: Spacing.md },
  avatarPreview: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: Colors.borderGold },
  avatarPreviewFallback: { backgroundColor: Colors.bgSurface, alignItems: 'center', justifyContent: 'center' },
  previewError: { ...Typography.bodySM, color: Colors.redLight, marginTop: 4, textAlign: 'center' },
  urlLabel: { ...Typography.labelSM, color: Colors.textFaint, marginBottom: 4 },
  urlInput: {
    fontFamily: 'Georgia',
    fontSize: 13,
    color: Colors.text,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    marginBottom: Spacing.md,
  },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  clearBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.redLight,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  clearBtnText: { color: Colors.redLight, fontWeight: '600', fontSize: 13 },

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
});
