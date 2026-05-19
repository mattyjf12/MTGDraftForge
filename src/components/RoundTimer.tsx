// RoundTimer.tsx
// Countdown timer for tournament rounds.
// Owner can pause, extend by 5 min, or reset. All players see the same clock
// display (local per device — syncing the exact millisecond isn't required for
// this use case since TOs announce time aloud anyway).
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { haptic } from './UI';

interface RoundTimerProps {
  durationMinutes: number;  // Total round duration from room settings
  isOwner: boolean;
}

export default function RoundTimer({ durationMinutes, isOwner }: RoundTimerProps) {
  const totalSeconds = durationMinutes * 60;
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warnedRef = useRef(false);

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  useEffect(() => {
    if (!running) { stop(); return; }
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        // 5-minute warning
        if (prev === 300 && !warnedRef.current) {
          warnedRef.current = true;
          haptic('impactMedium');
          Alert.alert('⏰ 5 Minutes Remaining', 'Finish your current game.');
        }
        if (prev <= 1) {
          haptic('notificationWarning');
          setRunning(false);
          setFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return stop;
  }, [running, stop]);

  function toggle() {
    if (finished) return;
    haptic('impactLight');
    setRunning(r => !r);
  }

  function extend() {
    haptic('impactLight');
    setSecondsLeft(s => s + 300); // +5 min
    setFinished(false);
  }

  function reset() {
    Alert.alert('Reset Timer?', 'This will restart the countdown from the beginning.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', onPress: () => {
        stop();
        setRunning(false);
        setFinished(false);
        setSecondsLeft(totalSeconds);
        warnedRef.current = false;
      }},
    ]);
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const isWarning = secondsLeft <= 300 && secondsLeft > 0;
  const timerColor = finished ? Colors.redLight : isWarning ? Colors.amber : Colors.gold;

  return (
    <View style={s.container}>
      <View style={[s.clockBox, finished && s.clockBoxDone, isWarning && !finished && s.clockBoxWarn]}>
        <Text style={s.label}>⏱ ROUND TIMER</Text>
        <Text style={[s.clock, { color: timerColor }]}>{display}</Text>
        {finished && <Text style={s.doneText}>TIME</Text>}

        {/* Owner controls */}
        {isOwner && (
          <View style={s.controls}>
            <TouchableOpacity style={s.ctrlBtn} onPress={toggle} disabled={finished}>
              <Text style={[s.ctrlText, finished && { color: Colors.textFaint }]}>
                {running ? '⏸ Pause' : '▶ Start'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ctrlBtn} onPress={extend}>
              <Text style={s.ctrlText}>+5 min</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ctrlBtn} onPress={reset}>
              <Text style={[s.ctrlText, { color: Colors.textMuted }]}>↺ Reset</Text>
            </TouchableOpacity>
          </View>
        )}
        {!isOwner && !running && !finished && (
          <Text style={s.waitingText}>Waiting for host to start…</Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  clockBox: {
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  clockBoxWarn: { borderColor: Colors.amber, backgroundColor: 'rgba(230,126,34,0.08)' },
  clockBoxDone: { borderColor: Colors.redLight, backgroundColor: 'rgba(192,40,27,0.08)' },
  label: { ...Typography.labelSM, color: Colors.textFaint, letterSpacing: 1.5, marginBottom: 4 },
  clock: {
    fontFamily: 'Georgia',
    fontSize: 52,
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
  doneText: {
    fontFamily: 'Georgia',
    fontSize: 22,
    color: Colors.redLight,
    letterSpacing: 6,
    marginTop: -8,
    marginBottom: 4,
  },
  waitingText: { ...Typography.bodySM, color: Colors.textFaint, marginTop: Spacing.sm },
  controls: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  ctrlBtn: {
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  ctrlText: { ...Typography.labelSM, color: Colors.gold },
});
