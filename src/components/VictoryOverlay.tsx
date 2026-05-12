import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { MTGColorPips } from './UI';
import { MTGColor } from '../utils/types';

interface Props {
  visible: boolean;
  winnerName: string;
  wins: number;
  losses: number;
  deckName?: string;
  deckColors?: MTGColor[];
  onDismiss: () => void;
}

// Confetti particle config
const PARTICLE_COUNT = 28;
const COLORS = ['#c9a84c', '#f0d080', '#4eca7f', '#5aade0', '#e06c5a', '#b07fe0', '#fff'];

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

interface Particle {
  x: number;
  color: string;
  delay: number;
  duration: number;
  size: number;
  rotate: number;
}

export default function VictoryOverlay({ visible, winnerName, wins, losses, deckName, deckColors, onDismiss }: Props) {
  const overlayOpacity  = useRef(new Animated.Value(0)).current;
  const trophyScale     = useRef(new Animated.Value(0)).current;
  const trophyOpacity   = useRef(new Animated.Value(0)).current;
  const nameTranslate   = useRef(new Animated.Value(30)).current;
  const nameOpacity     = useRef(new Animated.Value(0)).current;
  const detailsOpacity  = useRef(new Animated.Value(0)).current;
  const shimmer         = useRef(new Animated.Value(0)).current;

  // Per-particle animated values
  const [particles] = useState<Particle[]>(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      x: random(5, 95),
      color: COLORS[i % COLORS.length],
      delay: random(0, 600),
      duration: random(1200, 2200),
      size: random(6, 12),
      rotate: random(0, 360),
    }))
  );
  const particleAnims = useRef(particles.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!visible) {
      // Reset all
      overlayOpacity.setValue(0);
      trophyScale.setValue(0);
      trophyOpacity.setValue(0);
      nameTranslate.setValue(30);
      nameOpacity.setValue(0);
      detailsOpacity.setValue(0);
      shimmer.setValue(0);
      particleAnims.forEach(a => a.setValue(0));
      return;
    }

    // Fire sequence
    Animated.sequence([
      // 1. Overlay fades in
      Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      // 2. Trophy bounces in
      Animated.parallel([
        Animated.spring(trophyScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
        Animated.timing(trophyOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      // 3. Name slides up
      Animated.parallel([
        Animated.spring(nameTranslate, { toValue: 0, friction: 6, tension: 100, useNativeDriver: true }),
        Animated.timing(nameOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      // 4. Details fade in
      Animated.timing(detailsOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Shimmer loop on trophy
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    // Confetti particles
    particleAnims.forEach((anim, i) => {
      Animated.sequence([
        Animated.delay(particles[i].delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: particles[i].duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [visible]);

  const trophyGlow = shimmer.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        {/* Confetti */}
        {particles.map((p, i) => {
          const translateY = particleAnims[i].interpolate({ inputRange: [0, 1], outputRange: [-20, 700] });
          const opacity    = particleAnims[i].interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.8, 0] });
          const rotate     = particleAnims[i].interpolate({ inputRange: [0, 1], outputRange: [`${p.rotate}deg`, `${p.rotate + 360}deg`] });
          return (
            <Animated.View
              key={i}
              style={[
                styles.particle,
                {
                  left: `${p.x}%` as any,
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.color,
                  borderRadius: p.size / 4,
                  opacity,
                  transform: [{ translateY }, { rotate }],
                },
              ]}
            />
          );
        })}

        {/* Content */}
        <View style={styles.card}>
          {/* Trophy — spring-in on outer view, shimmer on inner text (can't stack two scales in one transform array with native driver) */}
          <Animated.View style={{ opacity: trophyOpacity, transform: [{ scale: trophyScale }] }}>
            <Animated.Text style={[styles.trophy, { transform: [{ scale: trophyGlow }] }]}>
              🏆
            </Animated.Text>
          </Animated.View>

          <Text style={styles.tournamentComplete}>Tournament Complete</Text>

          {/* Winner name */}
          <Animated.View style={{ opacity: nameOpacity, transform: [{ translateY: nameTranslate }] }}>
            <Text style={styles.winnerLabel}>CHAMPION</Text>
            <Text style={styles.winnerName}>{winnerName}</Text>
          </Animated.View>

          {/* Record + deck */}
          <Animated.View style={[styles.detailsBox, { opacity: detailsOpacity }]}>
            <Text style={styles.record}>{wins}W – {losses}L</Text>
            {(deckName || (deckColors && deckColors.length > 0)) && (
              <View style={styles.deckRow}>
                {deckColors && deckColors.length > 0 && (
                  <MTGColorPips colors={deckColors} size="md" />
                )}
                {deckName ? (
                  <Text style={styles.deckName}>{deckName}</Text>
                ) : null}
              </View>
            )}
          </Animated.View>

          <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.dismissText}>Tap to continue</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4,4,10,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
    top: 0,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1.5,
    borderColor: Colors.gold,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.xxxl,
    paddingVertical: Spacing.xxxl,
    alignItems: 'center',
    width: '82%',
    shadowColor: Colors.gold,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  trophy: {
    fontSize: 80,
    marginBottom: Spacing.md,
  },
  tournamentComplete: {
    ...Typography.bodySM,
    color: Colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.lg,
  },
  winnerLabel: {
    fontFamily: 'Georgia',
    fontSize: 11,
    color: Colors.gold,
    letterSpacing: 4,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 4,
  },
  winnerName: {
    fontFamily: 'Georgia',
    fontSize: 28,
    color: Colors.goldLight,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  detailsBox: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  record: {
    fontFamily: 'Georgia',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 1,
  },
  deckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  deckName: {
    ...Typography.bodyMD,
    color: Colors.textMuted,
  },
  dismissBtn: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderGold,
    paddingTop: Spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  dismissText: {
    ...Typography.bodySM,
    color: Colors.textFaint,
    letterSpacing: 1,
  },
});
