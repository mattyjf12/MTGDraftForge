// RoomSettingsScreen.tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Typography, Spacing, Radius, getSuggestedFormat } from '../theme';
import { Button, Card, Label, Divider, EmptyState, Row } from '../components/UI';
import { useApp } from '../services/AppContext';
import { RoomsStackParams } from '../navigation/RootNavigator';

type Route = RouteProp<RoomsStackParams, 'RoomSettings'>;
type Nav = NativeStackNavigationProp<RoomsStackParams>;

const FIXED_GAME_OPTIONS = [2, 3, 4, 5, 6, 7, 8];
const ROUND_DURATION_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30m', value: 30 },
  { label: '40m', value: 40 },
  { label: '50m', value: 50 },
  { label: '60m', value: 60 },
  { label: '75m', value: 75 },
  { label: '90m', value: 90 },
];

function SettingRow({ label, desc, value, onToggle }: {
  label: string; desc?: string; value: boolean; onToggle: (v: boolean) => void;
}) {
  return (
    <View style={s.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.settingLabel}>{label}</Text>
        {desc && <Text style={s.settingDesc}>{desc}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.border, true: Colors.goldDark }}
        thumbColor={value ? Colors.gold : Colors.textFaint}
      />
    </View>
  );
}

export default function RoomSettingsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { state, dispatch } = useApp();
  const room = state.rooms.find(r => r.id === route.params.roomId);

  if (!room || room.ownerId !== state.currentUserId) {
    return (
      <SafeAreaView style={s.safe}>
        <EmptyState icon="🔒" title="Owner access only" subtitle="Only the room host can change settings" />
      </SafeAreaView>
    );
  }

  const [settings, setSettings] = useState({ ...room.settings });
  const [phase1Mode, setPhase1Mode] = useState<'round_robin' | 'fixed_games'>(
    room.settings.phase1Mode ?? 'round_robin'
  );

  const effectiveFmt = room.format === 'suggested' ? getSuggestedFormat(room.players.length) : room.format;
  const isTwoPhase = effectiveFmt === 'two_phase';
  const isRRPhase = effectiveFmt === 'round_robin';
  const hasLoggedGames = Object.keys(room.rrResults || {}).length > 0;
  const canChangeSettings = room.status === 'waiting' || !hasLoggedGames;

  function save() {
    dispatch({
      type: 'UPDATE_ROOM',
      room: { ...room, settings: { ...settings, phase1Mode: isTwoPhase ? phase1Mode : settings.phase1Mode } },
    });
    navigation.goBack();
  }

  function deleteRoom() {
    Alert.alert(
      'Delete Room',
      `Permanently delete "${room.name}" and all its data?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => {
            dispatch({ type: 'DELETE_ROOM', roomId: room.id });
            navigation.popToTop();
          },
        },
      ]
    );
  }


  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.container}>

        {/* Room info */}
        <Card gold>
          <Row between>
            <Text style={s.roomName}>{room.name}</Text>
          </Row>
          <Text style={s.roomSub}>
            {room.players.length} players · {room.format.replace('_', ' ')} · Code: {room.inviteCode}
          </Text>
        </Card>

        {/* Starting life */}
        <Card>
          <Label>Starting Life Total</Label>
          <View style={s.lifeOptions}>
            {[20, 30, 40].map(n => (
              <Button
                key={n}
                label={`${n}`}
                onPress={() => setSettings(prev => ({ ...prev, startingLife: n }))}
                variant={settings.startingLife === n ? 'gold' : 'outline'}
                size="sm"
                style={{ flex: 1 }}
              />
            ))}
          </View>
        </Card>

        {/* Two-Phase: Phase 1 seeding mode */}
        {isTwoPhase && (
          <Card>
            <Label>Phase 1 Seeding Mode</Label>
            {!canChangeSettings && (
              <Text style={s.lockedNote}>Cannot change after games have been logged.</Text>
            )}

            {/* Mode toggle */}
            <View style={s.modeToggle}>
              {(['round_robin', 'fixed_games'] as const).map(mode => (
                <TouchableOpacity
                  key={mode}
                  disabled={!canChangeSettings}
                  style={[
                    s.modeBtn,
                    phase1Mode === mode && s.modeBtnActive,
                    !canChangeSettings && { opacity: 0.4 },
                  ]}
                  onPress={() => canChangeSettings && setPhase1Mode(mode)}
                >
                  <Text style={s.modeBtnIcon}>{mode === 'round_robin' ? '🔄' : '🎯'}</Text>
                  <Text style={[s.modeBtnLabel, phase1Mode === mode && s.modeBtnLabelActive]}>
                    {mode === 'round_robin' ? 'Round Robin' : 'Fixed Games'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Round Robin sub-options */}
            {phase1Mode === 'round_robin' && (
              <>
                <Label style={{ marginTop: Spacing.md }}>Games per Opponent</Label>
                <View style={s.lifeOptions}>
                  {[1, 2, 3].map(n => (
                    <TouchableOpacity
                      key={n}
                      disabled={!canChangeSettings}
                      style={[s.gameOption, settings.rrGamesCount === n && s.gameOptionSelected, !canChangeSettings && { opacity: 0.4 }]}
                      onPress={() => canChangeSettings && setSettings(prev => ({ ...prev, rrGamesCount: n }))}
                    >
                      <Text style={[s.gameOptionNum, settings.rrGamesCount === n && { color: Colors.gold }]}>{n}</Text>
                      <Text style={[s.gameOptionSub, settings.rrGamesCount === n && { color: Colors.gold }]}>
                        {n === 1 ? 'game' : 'games'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Fixed games sub-options */}
            {phase1Mode === 'fixed_games' && (
              <>
                <Label style={{ marginTop: Spacing.md }}>Rounds to Play</Label>
                <Text style={s.settingDesc}>Each player plays this many games. Pairings follow round-robin rotation.</Text>
                <View style={[s.lifeOptions, { flexWrap: 'wrap' }]}>
                  {FIXED_GAME_OPTIONS.map(n => (
                    <TouchableOpacity
                      key={n}
                      disabled={!canChangeSettings}
                      style={[s.gameOption, settings.rrGamesCount === n && s.gameOptionSelected, !canChangeSettings && { opacity: 0.4 }]}
                      onPress={() => canChangeSettings && setSettings(prev => ({ ...prev, rrGamesCount: n }))}
                    >
                      <Text style={[s.gameOptionNum, settings.rrGamesCount === n && { color: Colors.gold }]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </Card>
        )}

        {/* Round Robin games per opponent (pure RR rooms) */}
        {isRRPhase && (
          <Card>
            <Label>Round Robin Games per Opponent</Label>
            <Text style={s.settingDesc}>
              {canChangeSettings
                ? 'How many times each pair plays before standings are finalized.'
                : 'Cannot change after Round Robin games have been logged.'}
            </Text>
            <View style={s.lifeOptions}>
              {[1, 2, 3].map(n => (
                <TouchableOpacity
                  key={n}
                  disabled={!canChangeSettings}
                  style={[s.gameOption, settings.rrGamesCount === n && s.gameOptionSelected, !canChangeSettings && { opacity: 0.4 }]}
                  onPress={() => canChangeSettings && setSettings(prev => ({ ...prev, rrGamesCount: n }))}
                >
                  <Text style={[s.gameOptionNum, settings.rrGamesCount === n && { color: Colors.gold }]}>{n}</Text>
                  <Text style={[s.gameOptionSub, settings.rrGamesCount === n && { color: Colors.gold }]}>
                    {n === 1 ? 'game' : 'games'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        )}

        {/* Round timer */}
        <Card>
          <Label>Round Timer</Label>
          <Text style={s.settingDesc}>Countdown timer shown to all players during the round. Set to Off to disable.</Text>
          <View style={[s.lifeOptions, { flexWrap: 'wrap' }]}>
            {ROUND_DURATION_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[s.gameOption, { flex: 0, width: 52 }, (settings.roundDuration ?? 0) === opt.value && s.gameOptionSelected]}
                onPress={() => setSettings(prev => ({ ...prev, roundDuration: opt.value }))}
              >
                <Text style={[s.gameOptionNum, { fontSize: 13 }, (settings.roundDuration ?? 0) === opt.value && { color: Colors.gold }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Toggles */}
        <Card>
          <SettingRow
            label="Allow Spectators"
            desc="Non-players can view the tournament"
            value={settings.allowSpectators}
            onToggle={v => setSettings(prev => ({ ...prev, allowSpectators: v }))}
          />
          <Divider style={{ marginVertical: Spacing.sm }} />
          <SettingRow
            label="Require Result Confirmation"
            desc="Both players must confirm match results"
            value={settings.requireConfirmation}
            onToggle={v => setSettings(prev => ({ ...prev, requireConfirmation: v }))}
          />
          <Divider style={{ marginVertical: Spacing.sm }} />
          <SettingRow
            label="Life Total Tiebreaker"
            desc="Use final life total to break ties in standings"
            value={settings.tiebreakerByLife}
            onToggle={v => setSettings(prev => ({ ...prev, tiebreakerByLife: v }))}
          />
          <Divider style={{ marginVertical: Spacing.sm }} />
          <SettingRow
            label="Best of 3"
            desc="Each matchup is a best-of-3 series — first to win 2 games wins the match"
            value={settings.bestOf3 ?? false}
            onToggle={v => setSettings(prev => ({ ...prev, bestOf3: v }))}
          />
        </Card>

        <Button label="Save Settings" onPress={save} fullWidth size="lg" />

        <Divider style={{ marginVertical: Spacing.lg }} />

        <Button
          label="🗑️ Delete Room"
          onPress={deleteRoom}
          variant="danger"
          fullWidth
        />

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  roomName: { fontFamily: 'Georgia', fontSize: 18, color: Colors.gold },
  roomSub: { ...Typography.bodySM, color: Colors.textMuted, marginTop: 4 },
  lifeOptions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  settingLabel: { ...Typography.bodyMD },
  settingDesc: { ...Typography.bodySM, color: Colors.textMuted, marginTop: 2, marginBottom: Spacing.sm, lineHeight: 18 },
  lockedNote: { ...Typography.bodySM, color: Colors.amber, marginBottom: Spacing.sm },
  modeToggle: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  modeBtn: {
    flex: 1,
    backgroundColor: Colors.bgSurface,
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
  modeBtnIcon: { fontSize: 18 },
  modeBtnLabel: { ...Typography.bodyMD, color: Colors.textMuted, textAlign: 'center' },
  modeBtnLabelActive: { color: 'rgba(22,160,133,1)', fontWeight: '600' },
  gameOption: {
    flex: 1,
    height: 60,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  gameOptionSelected: { borderColor: Colors.gold, backgroundColor: Colors.goldGlow },
  gameOptionNum: { fontFamily: 'Georgia', fontSize: 22, color: Colors.textMuted },
  gameOptionSub: { ...Typography.labelSM, color: Colors.textFaint },
});
