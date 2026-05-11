// DiceRollerScreen.tsx
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { Card, Row, Divider, haptic } from '../components/UI';
import { DiceRoll } from '../utils/types';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const DICE_TYPES = [
  { sides: 4,   symbol: '▲',  label: 'd4',   color: Colors.blueLight },
  { sides: 6,   symbol: '⬡',  label: 'd6',   color: Colors.greenLight },
  { sides: 8,   symbol: '◆',  label: 'd8',   color: Colors.amber },
  { sides: 10,  symbol: '◈',  label: 'd10',  color: Colors.redLight },
  { sides: 12,  symbol: '⬟',  label: 'd12',  color: Colors.purpleLight },
  { sides: 20,  symbol: '⬠',  label: 'd20',  color: Colors.gold },
  { sides: 100, symbol: '%',  label: 'd100', color: Colors.textMuted },
];

function DieButton({ sides, symbol, label, color, selected, onPress }: {
  sides: number; symbol: string; label: string; color: string;
  selected: boolean; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePress() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 25 }),
    ]).start();
    onPress();
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[s.dieBtn, selected && { borderColor: color, backgroundColor: `${color}22` }]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Text style={[s.dieSymbol, { color: selected ? color : Colors.textMuted }]}>{symbol}</Text>
        <Text style={[s.dieLabel, { color: selected ? color : Colors.textFaint }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function RollResultDisplay({ results, dieType, rolling }: {
  results: number[]; dieType: { sides: number; symbol: string; label: string; color: string }; rolling: boolean;
}) {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (rolling) {
      Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        { iterations: 3 },
      ).start();
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.7, duration: 150, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1.1, useNativeDriver: true, speed: 15 }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }),
      ]).start();
    }
  }, [rolling]);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const total = results.reduce((a, b) => a + b, 0);
  const isNat20 = dieType.sides === 20 && results.length === 1 && results[0] === 20;
  const isCrit1 = dieType.sides === 20 && results.length === 1 && results[0] === 1;

  return (
    <Card style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
      <Animated.View style={[s.bigDieFace, {
        borderColor: isNat20 ? Colors.gold : isCrit1 ? Colors.redLight : dieType.color,
        backgroundColor: isNat20 ? Colors.goldGlow : isCrit1 ? Colors.redGlow : `${dieType.color}12`,
        transform: [{ rotate: rolling ? spin : '0deg' }, { scale: scaleAnim }],
      }]}>
        {rolling ? (
          <Text style={[s.bigDieSymbol, { color: dieType.color, opacity: 0.4 }]}>?</Text>
        ) : results.length > 0 ? (
          <Text style={[s.bigDieNumber, { color: isNat20 ? Colors.gold : isCrit1 ? Colors.redLight : dieType.color }]}>
            {results.length === 1 ? results[0] : total}
          </Text>
        ) : (
          <Text style={[s.bigDieSymbol, { color: Colors.textFaint }]}>{dieType.symbol}</Text>
        )}
      </Animated.View>

      {isNat20 && !rolling && (
        <Text style={s.critBanner}>✨ NATURAL 20 ✨</Text>
      )}
      {isCrit1 && !rolling && (
        <Text style={[s.critBanner, { color: Colors.redLight }]}>💀 CRITICAL FAIL</Text>
      )}

      {results.length > 1 && !rolling && (
        <View style={s.multiResults}>
          <Text style={s.multiLabel}>Individual rolls:</Text>
          <View style={s.diceRow}>
            {results.map((r, i) => (
              <View key={i} style={[s.miniDie, { borderColor: dieType.color }]}>
                <Text style={[s.miniDieNum, { color: dieType.color }]}>{r}</Text>
              </View>
            ))}
          </View>
          <Text style={s.sumText}>Total: <Text style={{ color: dieType.color, fontFamily: 'Georgia', fontSize: 20 }}>{total}</Text></Text>
        </View>
      )}
    </Card>
  );
}

export default function DiceRollerScreen() {
  const [selectedDie, setSelectedDie] = useState(DICE_TYPES[5]); // default d20
  const [count, setCount] = useState(1);
  const [results, setResults] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const [history, setHistory] = useState<DiceRoll[]>([]);

  const roll = useCallback(() => {
    if (rolling) return;
    setRolling(true);
    haptic('impactHeavy');

    setTimeout(() => {
      const rolls = Array.from({ length: count }, () =>
        Math.floor(Math.random() * selectedDie.sides) + 1
      );
      const total = rolls.reduce((a, b) => a + b, 0);

      setResults(rolls);
      setHistory(h => [{
        id: uuidv4(),
        dieType: selectedDie.sides,
        count,
        results: rolls,
        total,
        timestamp: Date.now(),
      }, ...h].slice(0, 20));
      setRolling(false);
    }, 500);
  }, [rolling, count, selectedDie]);

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.container}>

        {/* Die selector */}
        <Card>
          <Text style={s.sectionLabel}>Select Die</Text>
          <View style={s.diceGrid}>
            {DICE_TYPES.map(d => (
              <DieButton
                key={d.sides}
                {...d}
                selected={selectedDie.sides === d.sides}
                onPress={() => { setSelectedDie(d); setResults([]); }}
              />
            ))}
          </View>
        </Card>

        {/* Count selector */}
        <Card>
          <Row between>
            <Text style={s.sectionLabel}>Number of Dice</Text>
            <Row style={{ gap: 14 }}>
              <TouchableOpacity onPress={() => setCount(c => Math.max(1, c - 1))} style={s.countBtn}>
                <Text style={s.countBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={s.countNum}>{count}</Text>
              <TouchableOpacity onPress={() => setCount(c => Math.min(10, c + 1))} style={s.countBtn}>
                <Text style={s.countBtnText}>+</Text>
              </TouchableOpacity>
            </Row>
          </Row>
        </Card>

        {/* Result display */}
        <RollResultDisplay results={results} dieType={selectedDie} rolling={rolling} />

        {/* Roll button */}
        <TouchableOpacity
          style={[s.rollBtn, { borderColor: selectedDie.color, opacity: rolling ? 0.6 : 1 }]}
          onPress={roll}
          disabled={rolling}
          activeOpacity={0.85}
        >
          <Text style={[s.rollBtnText, { color: selectedDie.color }]}>
            {rolling ? '…' : `Roll ${count === 1 ? '' : count}${selectedDie.label}`}
          </Text>
        </TouchableOpacity>

        {/* Quick dice row */}
        <View style={s.quickRow}>
          {[4, 6, 8, 12, 20].map(sides => {
            const d = DICE_TYPES.find(dt => dt.sides === sides)!;
            return (
              <TouchableOpacity
                key={sides}
                style={[s.quickBtn, { borderColor: d.color }]}
                onPress={() => { setSelectedDie(d); setResults([]); setTimeout(roll, 50); }}
              >
                <Text style={[s.quickBtnText, { color: d.color }]}>d{sides}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* History */}
        {history.length > 0 && (
          <Card>
            <Text style={s.sectionLabel}>Roll History</Text>
            {history.map(h => {
              const die = DICE_TYPES.find(d => d.sides === h.dieType)!;
              return (
                <View key={h.id} style={s.historyRow}>
                  <Text style={s.historyTime}>{formatTime(h.timestamp)}</Text>
                  <Text style={[s.historyDice, { color: die?.color || Colors.textMuted }]}>
                    {h.count}d{h.dieType}
                  </Text>
                  <Text style={s.historyRolls}>
                    {h.count > 1 ? `[${h.results.join(', ')}]` : ''}
                  </Text>
                  <Text style={[s.historyTotal, { color: die?.color || Colors.gold }]}>{h.total}</Text>
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  sectionLabel: { ...Typography.label, marginBottom: Spacing.md },
  diceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  dieBtn: {
    width: 60, height: 60,
    borderRadius: Radius.md, borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bgSurface,
    alignItems: 'center', justifyContent: 'center',
    gap: 2,
  },
  dieSymbol: { fontSize: 20 },
  dieLabel: { fontSize: 11, fontFamily: 'System', fontWeight: '600', letterSpacing: 0.5 },
  countBtn: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  countBtnText: { fontSize: 20, color: Colors.textMuted, lineHeight: 22 },
  countNum: { fontFamily: 'Georgia', fontSize: 24, color: Colors.text, minWidth: 28, textAlign: 'center' },
  bigDieFace: {
    width: 120, height: 120, borderRadius: Radius.xl,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  bigDieSymbol: { fontSize: 44 },
  bigDieNumber: { fontFamily: 'Georgia', fontSize: 52, lineHeight: 56 },
  critBanner: {
    fontFamily: 'Georgia',
    fontSize: 14,
    color: Colors.gold,
    letterSpacing: 2,
    marginTop: 4,
  },
  multiResults: { alignItems: 'center', marginTop: Spacing.sm, gap: 8 },
  multiLabel: { ...Typography.labelSM },
  diceRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  miniDie: {
    width: 36, height: 36, borderRadius: Radius.sm,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bgSurface,
  },
  miniDieNum: { fontFamily: 'Georgia', fontSize: 15 },
  sumText: { ...Typography.bodyMD, color: Colors.textMuted },
  rollBtn: {
    borderWidth: 2,
    borderRadius: Radius.full,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
    alignSelf: 'center',
    marginVertical: Spacing.sm,
    minWidth: 180,
  },
  rollBtnText: {
    fontFamily: 'Georgia',
    fontSize: 18,
    letterSpacing: 1,
  },
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  quickBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: Radius.sm,
  },
  quickBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  historyTime: { ...Typography.bodySM, color: Colors.textFaint, width: 70 },
  historyDice: { ...Typography.bodyMD, fontWeight: '700', width: 44 },
  historyRolls: { ...Typography.bodySM, color: Colors.textMuted, flex: 1 },
  historyTotal: { fontFamily: 'Georgia', fontSize: 18 },
});
