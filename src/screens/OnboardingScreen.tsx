// OnboardingScreen.tsx
// Multi-step paginated onboarding shown on first launch.
// Slides:  0 Welcome  →  1 Tournaments  →  2 Tools  →  3 Name entry

import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Animated, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { Button, haptic } from '../components/UI';
import { useApp } from '../services/AppContext';

const { width: W } = Dimensions.get('window');

// ─── Slide data ───────────────────────────────────────────────────────────────

const SLIDES = [
  {
    key: 'welcome',
    icon: '⚔️',
    title: 'MTG Draft Forge',
    subtitle: 'TOURNAMENT MANAGER',
    body: 'The all-in-one companion for Magic: The Gathering drafts and tournaments — built for players, by players.',
    accent: Colors.gold,
  },
  {
    key: 'tournaments',
    icon: '🏆',
    title: 'Run Any Format',
    subtitle: 'TOURNAMENTS',
    body: 'Single Elimination, Round Robin, Two-Phase seeded brackets and more. Create a room, share the invite code, and start drafting in seconds.',
    accent: Colors.blueLight,
    features: [
      { icon: '🏰', label: 'Draft Rooms',   desc: 'Create & join with a 6-digit code' },
      { icon: '🏆', label: 'Brackets',      desc: 'Auto-generated from standings' },
      { icon: '📊', label: 'Standings',     desc: 'Live win/loss/points tracking' },
    ],
  },
  {
    key: 'tools',
    icon: '🎲',
    title: 'Everything You Need',
    subtitle: 'BUILT-IN TOOLS',
    body: 'Stop juggling apps mid-game. Life Counter, Dice Roller, Seating Charts and Schedules are all here.',
    accent: Colors.greenLight,
    features: [
      { icon: '❤️', label: 'Life Counter', desc: 'Up to 6 players, compact or full' },
      { icon: '🎲', label: 'Dice Roller',  desc: 'd4 · d6 · d8 · d10 · d12 · d20 · d100' },
      { icon: '🪑', label: 'Seating',      desc: 'Randomised draft pod seating' },
    ],
  },
  {
    key: 'sync',
    icon: '🌐',
    title: 'Real-Time Sync',
    subtitle: 'CROSS-DEVICE',
    body: 'Rooms sync instantly across iOS and Android via Firebase. The host\'s changes appear on every player\'s screen as they happen.',
    accent: Colors.purpleLight,
    features: [
      { icon: '📱', label: 'iOS & Android', desc: 'Works on any device' },
      { icon: '⚡', label: 'Instant Sync',  desc: 'No refresh needed' },
      { icon: '🔒', label: 'Secure',        desc: 'Anonymous auth, no account required' },
    ],
  },
];

// ─── Slide component ──────────────────────────────────────────────────────────

function Slide({ slide, isLast }: { slide: typeof SLIDES[0]; isLast: boolean }) {
  return (
    <View style={[styles.slide, { width: W }]}>
      <View style={styles.slideInner}>
        {/* Icon */}
        <View style={[styles.iconRing, { borderColor: slide.accent + '60' }]}>
          <Text style={styles.slideIcon}>{slide.icon}</Text>
        </View>

        {/* Text */}
        <Text style={[styles.slideSubtitle, { color: slide.accent }]}>{slide.subtitle}</Text>
        <Text style={styles.slideTitle}>{slide.title}</Text>
        <Text style={styles.slideBody}>{slide.body}</Text>

        {/* Feature rows */}
        {'features' in slide && slide.features && (
          <View style={styles.featureList}>
            {slide.features.map(f => (
              <View key={f.label} style={[styles.featureRow, { borderColor: slide.accent + '30' }]}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.featureLabel, { color: slide.accent }]}>{f.label}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Name entry (last step) ───────────────────────────────────────────────────

function NameSlide({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Enter your name to continue.'); return; }
    if (trimmed.length < 2) { setError('Name must be at least 2 characters.'); return; }
    haptic('notificationSuccess');
    onDone(trimmed);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.slide, { width: W }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.slideInner}>
          <View style={[styles.iconRing, { borderColor: Colors.gold + '60' }]}>
            <Text style={styles.slideIcon}>🧙</Text>
          </View>

          <Text style={[styles.slideSubtitle, { color: Colors.gold }]}>ALMOST READY</Text>
          <Text style={styles.slideTitle}>What's your name?</Text>
          <Text style={styles.slideBody}>
            Your name appears in brackets, standings and the life counter so other players know who they're facing.
          </Text>

          <TextInput
            style={[styles.nameInput, error ? styles.nameInputError : null]}
            placeholder="Your player name"
            placeholderTextColor={Colors.textFaint}
            value={name}
            onChangeText={v => { setName(v); setError(''); }}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={handleContinue}
            maxLength={24}
            accessibilityLabel="Player name input"
          />
          {error
            ? <Text style={styles.nameError}>{error}</Text>
            : <Text style={styles.nameHint}>{name.length > 0 ? `${name.length}/24` : ' '}</Text>
          }

          <Button
            label="Enter the Arena"
            onPress={handleContinue}
            size="lg"
            fullWidth
            icon="⚔️"
            disabled={name.trim().length < 2}
            accessibilityLabel="Continue to the app"
          />

          <Text style={styles.footer}>You can change your name anytime in Profile</Text>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const ALL_STEPS = SLIDES.length + 1; // slides + name entry

export default function OnboardingScreen() {
  const { setUserName } = useApp();
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const dotAnim = useRef(
    Array.from({ length: ALL_STEPS }, (_, i) => new Animated.Value(i === 0 ? 1 : 0))
  ).current;

  function goTo(page: number) {
    scrollRef.current?.scrollTo({ x: page * W, animated: true });
    // Animate dot widths
    dotAnim.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: i === page ? 1 : 0,
        useNativeDriver: false,
        speed: 20,
        bounciness: 4,
      }).start();
    });
    setCurrentPage(page);
    haptic('impactLight');
  }

  function handleScroll(e: any) {
    const page = Math.round(e.nativeEvent.contentOffset.x / W);
    if (page !== currentPage) {
      dotAnim.forEach((anim, i) => {
        Animated.spring(anim, {
          toValue: i === page ? 1 : 0,
          useNativeDriver: false,
          speed: 20,
          bounciness: 4,
        }).start();
      });
      setCurrentPage(page);
    }
  }

  const isLastSlide = currentPage === ALL_STEPS - 1;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Skip button (only on feature slides) */}
      {currentPage < SLIDES.length && (
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => goTo(ALL_STEPS - 1)}
          accessibilityLabel="Skip to name entry"
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Paged scroll */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => (
          <Slide key={slide.key} slide={slide} isLast={i === SLIDES.length - 1} />
        ))}
        <NameSlide onDone={setUserName} />
      </ScrollView>

      {/* Dot indicators + nav */}
      <View style={styles.footer2}>
        {/* Dots */}
        <View style={styles.dots}>
          {Array.from({ length: ALL_STEPS }).map((_, i) => {
            const dotWidth = dotAnim[i]?.interpolate({
              inputRange: [0, 1],
              outputRange: [8, 24],
            }) ?? 8;
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  {
                    width: dotWidth,
                    backgroundColor: currentPage === i ? Colors.gold : Colors.border,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Next / last-step CTA */}
        {!isLastSlide && (
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={() => goTo(currentPage + 1)}
            accessibilityLabel="Next slide"
            accessibilityRole="button"
          >
            <Text style={styles.nextText}>Next →</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgDeep },

  skipBtn: {
    position: 'absolute',
    top: Spacing.lg,
    right: Spacing.lg,
    zIndex: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  skipText: { ...Typography.bodySM, color: Colors.textMuted },

  // ── Slide ──
  slide: {
    flex: 1,
    justifyContent: 'center',
  },
  slideInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.lg,
  },
  iconRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    backgroundColor: Colors.bgSurface,
  },
  slideIcon: { fontSize: 52 },
  slideSubtitle: {
    ...Typography.labelGold,
    marginBottom: Spacing.sm,
    letterSpacing: 3,
  },
  slideTitle: {
    fontFamily: 'Georgia',
    fontSize: 26,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  slideBody: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },

  // ── Feature rows ──
  featureList: { width: '100%', gap: Spacing.sm },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  featureIcon: { fontSize: 24, width: 32, textAlign: 'center' },
  featureLabel: { ...Typography.bodyMD, fontWeight: '600' },
  featureDesc: { ...Typography.bodySM, color: Colors.textMuted, marginTop: 2 },

  // ── Name slide ──
  nameInput: {
    width: '100%',
    backgroundColor: Colors.bgSurface,
    borderWidth: 1.5,
    borderColor: Colors.borderGold,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: Colors.text,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  nameInputError: { borderColor: Colors.redLight },
  nameError: { ...Typography.bodySM, color: Colors.redLight, textAlign: 'center', marginBottom: Spacing.md },
  nameHint: { ...Typography.bodySM, color: Colors.textFaint, textAlign: 'center', marginBottom: Spacing.md },
  footer: { ...Typography.bodySM, color: Colors.textFaint, textAlign: 'center', marginTop: Spacing.lg },

  // ── Bottom nav ──
  footer2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.md,
  },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextBtn: {
    backgroundColor: Colors.goldGlow,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  nextText: { ...Typography.bodyMD, color: Colors.gold, fontWeight: '600' },
});
