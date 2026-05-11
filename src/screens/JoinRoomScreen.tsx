// JoinRoomScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { Button, Label, Divider } from '../components/UI';
import { useApp } from '../services/AppContext';
import { RoomsStackParams } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RoomsStackParams>;

export default function JoinRoomScreen() {
  const navigation = useNavigation<Nav>();
  const { joinRoomByCode, state } = useApp();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    setError('');
    setLoading(true);
    const result = await joinRoomByCode(code);
    setLoading(false);

    if (result.status !== 'ok') {
      const messages: Record<string, string> = {
        not_found: 'Room not found. Check the code and try again.',
        full: 'This room is full.',
        already_joined: 'You\'ve already joined this room.',
      };
      setError(messages[result.status] || 'Something went wrong.');
      return;
    }

    navigation.replace('Tournament', { roomId: result.roomId });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          <View style={styles.hero}>
            <Text style={styles.heroIcon}>🔑</Text>
            <Text style={styles.heroTitle}>Join a Draft Room</Text>
            <Text style={styles.heroSub}>Enter the 6-character invite code shared by the room host</Text>
          </View>

          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.codeInput, error ? styles.inputError : null]}
              placeholder="A B C 1 2 3"
              placeholderTextColor={Colors.textFaint}
              value={code}
              onChangeText={v => { setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '')); setError(''); }}
              autoCapitalize="characters"
              maxLength={6}
              keyboardType="default"
              returnKeyType="join"
              onSubmitEditing={handleJoin}
              autoFocus
              accessibilityLabel="Room invite code input"
              accessibilityHint="Enter the 6 character code shared by the room host"
            />
            {/* Progress dots */}
            <View style={styles.dots}>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <View
                  key={i}
                  style={[styles.dot, i < code.length && styles.dotFilled]}
                />
              ))}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <Text style={styles.hint}>
            Joining as  <Text style={{ color: Colors.gold }}>{state.currentUserName}</Text>
          </Text>

          <Divider style={{ marginVertical: Spacing.xl }} />

          <Button
            label={loading ? 'Searching…' : 'Join Room'}
            onPress={handleJoin}
            size="lg"
            fullWidth
            disabled={code.length < 6 || loading}
            icon="🔑"
          />
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },
  container: { flex: 1, padding: Spacing.xl, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: Spacing.xxl },
  heroIcon: { fontSize: 52, marginBottom: Spacing.md },
  heroTitle: { fontFamily: 'Georgia', fontSize: 22, color: Colors.gold, marginBottom: 8 },
  heroSub: { ...Typography.bodySM, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  inputWrap: { marginBottom: Spacing.lg },
  codeInput: {
    backgroundColor: Colors.bgSurface,
    borderWidth: 1.5,
    borderColor: Colors.borderGold,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    color: Colors.gold,
    fontSize: 32,
    fontFamily: 'Courier',
    textAlign: 'center',
    letterSpacing: 12,
  },
  inputError: { borderColor: Colors.redLight },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: Spacing.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.borderGold,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  error: { ...Typography.bodySM, color: Colors.redLight, textAlign: 'center', marginTop: Spacing.sm },
  hint: { ...Typography.bodySM, color: Colors.textMuted, textAlign: 'center' },
});
