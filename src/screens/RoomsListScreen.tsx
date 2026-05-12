// Rooms List — main lobby screen
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Typography, Spacing, Radius, FORMATS } from '../theme';
import { Button, Card, Badge, Row, EmptyState } from '../components/UI';
import { useApp } from '../services/AppContext';
import { deleteRoomFromFirestore } from '../services/firebase';
import { DraftRoom } from '../utils/types';
import { RoomsStackParams } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RoomsStackParams>;

function RoomCard({ room, isActive, onOpen, onDelete }: {
  room: DraftRoom;
  isActive: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const fmt = FORMATS.find(f => f.id === room.format);
  const statusColors: Record<string, string> = {
    waiting: Colors.textMuted,
    drafting: Colors.amber,
    in_progress: Colors.greenLight,
    completed: Colors.blueLight,
  };

  return (
    <Card gold={isActive} onPress={onOpen}>
      <Row between style={{ marginBottom: 8 }}>
        <Text style={[styles.roomName, isActive && { color: Colors.gold }]}>{room.name}</Text>
        <Badge
          label={`${room.players.length}/${room.maxPlayers}`}
          variant={room.players.length >= room.maxPlayers ? 'red' : 'blue'}
        />
      </Row>

      <Row style={{ marginBottom: 10, gap: 10 }}>
        <Text style={[styles.formatTag, { color: fmt?.color || Colors.textMuted }]}>
          {fmt?.icon} {fmt?.shortName}
        </Text>
        <Text style={[styles.statusTag, { color: statusColors[room.status] }]}>
          ● {room.status.replace('_', ' ').toUpperCase()}
        </Text>
      </Row>

      {/* Invite code */}
      <View style={styles.codeRow}>
        <Text style={styles.codeLabel}>CODE</Text>
        <Text style={styles.codeText}>{room.inviteCode}</Text>
      </View>

      <Row style={{ gap: 8, marginTop: 10 }}>
        <Button
          label={isActive ? '✓ Open' : 'Open'}
          onPress={onOpen}
          variant={isActive ? 'gold' : 'outline'}
          size="sm"
          style={{ flex: 1 }}
        />
        <TouchableOpacity
          onPress={onDelete}
          style={styles.deleteBtn}
          accessibilityLabel={`Delete room ${room.name}`}
          accessibilityRole="button"
        >
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </Row>
    </Card>
  );
}

export default function RoomsListScreen() {
  const navigation = useNavigation<Nav>();
  const { state, dispatch } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  // Pull-to-refresh: Firestore sync is automatic via onSnapshot, so a brief
  // visual refresh is all we need — the live subscription will have already
  // delivered any new data. We just give the user feedback that the app is alive.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 800));
    setRefreshing(false);
  }, []);

  function openRoom(roomId: string) {
    dispatch({ type: 'SET_ACTIVE_ROOM', roomId });
    navigation.navigate('Tournament', { roomId });
  }

  function deleteRoom(room: DraftRoom) {
    Alert.alert(
      'Delete Room',
      `Delete "${room.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => {
            dispatch({ type: 'DELETE_ROOM', roomId: room.id });
            deleteRoomFromFirestore(room.id);
          },
        },
      ]
    );
  }

  function deleteAllRooms() {
    if (state.rooms.length === 0) return;
    Alert.alert(
      'Delete All Rooms',
      `This will permanently delete all ${state.rooms.length} room${state.rooms.length !== 1 ? 's' : ''}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All', style: 'destructive',
          onPress: () => {
            state.rooms.forEach(r => deleteRoomFromFirestore(r.id));
            dispatch({ type: 'DELETE_ALL_ROOMS' });
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Action buttons */}
      <View style={styles.actions}>
        <Button
          label="+ Create Room"
          onPress={() => navigation.navigate('CreateRoom')}
          variant="gold"
          style={{ flex: 1 }}
        />
        <Button
          label="🔑 Join"
          onPress={() => navigation.navigate('JoinRoom')}
          variant="outline"
          style={{ flex: 1 }}
        />
      </View>

      {/* Delete All Rooms button — hidden for now
      {state.rooms.length > 0 && (
        <TouchableOpacity style={styles.deleteAllBtn} onPress={deleteAllRooms}>
          <Text style={styles.deleteAllText}>🗑 Delete All Rooms</Text>
        </TouchableOpacity>
      )}
      */}

      {/* Your name pill */}
      <View style={styles.namePill}>
        <Text style={styles.namePillText}>⚔️ Playing as  </Text>
        <Text style={[styles.namePillText, { color: Colors.gold }]}>{state.currentUserName}</Text>
      </View>

      {/* Room list */}
      <FlatList
        data={state.rooms}
        keyExtractor={r => r.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.gold}
            colors={[Colors.gold]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="🏰"
            title="No draft rooms yet"
            subtitle={"Create a room to host a tournament,\nor enter a friend's invite code to join one."}
            cta={
              <Button
                label="+ Create Your First Room"
                onPress={() => navigation.navigate('CreateRoom')}
                variant="gold"
                size="md"
                icon="🏰"
              />
            }
          />
        }
        renderItem={({ item }) => (
          <RoomCard
            room={item}
            isActive={state.activeRoomId === item.id}
            onOpen={() => openRoom(item.id)}
            onDelete={() => deleteRoom(item)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  namePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
  },
  namePillText: { ...Typography.bodySM, color: Colors.textMuted, letterSpacing: 0.5 },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  roomName: { ...Typography.h3, flex: 1, marginRight: 8 },
  formatTag: { ...Typography.labelSM, letterSpacing: 0.8 },
  statusTag: { ...Typography.labelSM, letterSpacing: 0.8 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  codeLabel: { ...Typography.labelGold, fontSize: 9 },
  codeText: {
    fontFamily: 'Courier',
    fontSize: 18,
    color: Colors.gold,
    letterSpacing: 6,
    flex: 1,
    textAlign: 'center',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { color: Colors.redLight, fontSize: 14 },
  deleteAllBtn: {
    alignSelf: 'center',
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  deleteAllText: { ...Typography.bodySM, color: Colors.redLight, letterSpacing: 0.5 },
});
