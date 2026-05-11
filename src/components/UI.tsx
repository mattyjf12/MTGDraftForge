// ─────────────────────────────────────────────
// MTG Draft Forge — Shared UI Components
// ─────────────────────────────────────────────
import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  ViewStyle, TextStyle, Animated, Pressable, Image, Share, Platform,
} from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { MTGColor } from '../utils/types';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

/** Fire a haptic pulse. Type guide:
 *  'impactLight'  – small taps (list items, toggles)
 *  'impactMedium' – primary buttons
 *  'impactHeavy'  – destructive / dice roll
 *  'notificationSuccess' – tournament start, join success
 *  'notificationError'   – validation errors
 */
export function haptic(type: 'impactLight' | 'impactMedium' | 'impactHeavy' | 'notificationSuccess' | 'notificationError' | 'selection' = 'impactMedium') {
  ReactNativeHapticFeedback.trigger(type, { enableVibrateFallback: true, ignoreAndroidSystemSettings: false });
}

// ── Button ────────────────────────────────────
interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'gold' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Button({
  label, onPress, variant = 'gold', size = 'md',
  fullWidth, disabled, loading, icon, style,
  accessibilityLabel, accessibilityHint,
}: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 30, bounciness: 4 }).start();
    if (!disabled && !loading) haptic(variant === 'danger' ? 'impactHeavy' : 'impactMedium');
  }
  function handlePressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  }

  const variantStyle = {
    gold:    { bg: Colors.goldDark, border: Colors.gold, text: Colors.text },
    outline: { bg: 'transparent', border: Colors.borderLight, text: Colors.text },
    danger:  { bg: 'transparent', border: Colors.redLight, text: Colors.redLight },
    ghost:   { bg: 'transparent', border: 'transparent', text: Colors.textMuted },
  }[variant];

  const sizeStyle = {
    sm: { py: 6, px: 12, fontSize: 11 },
    md: { py: 10, px: 18, fontSize: 13 },
    lg: { py: 14, px: 24, fontSize: 14 },
  }[size];

  return (
    <Animated.View style={[{ transform: [{ scale }] }, fullWidth && { width: '100%' }, style]}>
      <Pressable
        onPress={disabled || loading ? undefined : onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!(disabled || loading) }}
        style={[
          styles.btnBase,
          {
            backgroundColor: variantStyle.bg,
            borderColor: variantStyle.border,
            paddingVertical: sizeStyle.py,
            paddingHorizontal: sizeStyle.px,
            opacity: disabled || loading ? 0.45 : 1,
          },
          fullWidth && styles.btnFull,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={variantStyle.text} />
        ) : (
          <Text style={[styles.btnText, { color: variantStyle.text, fontSize: sizeStyle.fontSize }]}>
            {icon ? `${icon}  ` : ''}{label.toUpperCase()}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ── Card ──────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  gold?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
}

export function Card({ children, gold, style, onPress }: CardProps) {
  const content = (
    <View style={[styles.card, gold && styles.cardGold, style]}>
      {children}
    </View>
  );
  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.8}>{content}</TouchableOpacity>;
  return content;
}

// ── Section header ────────────────────────────
export function SectionHeader({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.sectionHeader, style]}>{children}</Text>;
}

// ── Badge ─────────────────────────────────────
type BadgeVariant = 'gold' | 'green' | 'red' | 'blue' | 'purple' | 'muted';
interface BadgeProps { label: string; variant?: BadgeVariant; style?: ViewStyle }

export function Badge({ label, variant = 'muted', style }: BadgeProps) {
  const colors: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
    gold:   { bg: Colors.goldGlow, text: Colors.gold, border: Colors.borderGold },
    green:  { bg: Colors.greenGlow, text: Colors.greenLight, border: 'rgba(39,174,96,0.3)' },
    red:    { bg: Colors.redGlow, text: Colors.redLight, border: 'rgba(192,57,43,0.3)' },
    blue:   { bg: Colors.blueGlow, text: Colors.blueLight, border: 'rgba(41,128,185,0.3)' },
    purple: { bg: 'rgba(108,52,131,0.2)', text: Colors.purpleLight, border: 'rgba(108,52,131,0.4)' },
    muted:  { bg: 'rgba(122,115,144,0.15)', text: Colors.textMuted, border: Colors.border },
  };
  const c = colors[variant];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }, style]}>
      <Text style={[styles.badgeText, { color: c.text }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

// ── Divider ───────────────────────────────────
export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.divider, style]} />;
}

// ── Label ─────────────────────────────────────
export function Label({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

// ── Empty state ───────────────────────────────
interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle?: string;
  /** Optional call-to-action rendered below the subtitle */
  cta?: React.ReactNode;
}
export function EmptyState({ icon, title, subtitle, cta }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
      {cta && <View style={styles.emptyCta}>{cta}</View>}
    </View>
  );
}

// ── Row ───────────────────────────────────────
interface RowProps { children: React.ReactNode; style?: ViewStyle; between?: boolean; center?: boolean }
export function Row({ children, style, between, center }: RowProps) {
  return (
    <View style={[
      styles.row,
      between && styles.rowBetween,
      center && styles.rowCenter,
      style,
    ]}>
      {children}
    </View>
  );
}

// ── Invite code display ───────────────────────
export function InviteCodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    haptic('impactLight');
    try {
      await Share.share({
        message: `Join my MTG Draft Forge room with code: ${code}\n\nDownload the app and tap "Join Room"`,
        title: 'Join my draft room',
      });
    } catch { /* user cancelled */ }
  }

  return (
    <TouchableOpacity
      style={styles.inviteBox}
      onPress={handleShare}
      activeOpacity={0.8}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Invite code ${code.split('').join(' ')}`}
      accessibilityHint="Tap to share this invite code with other players"
    >
      <Text style={styles.inviteLabel}>INVITE CODE  •  TAP TO SHARE</Text>
      <Text style={styles.inviteCode}>{code}</Text>
      <View style={styles.inviteActions}>
        <Text style={styles.inviteHint}>📤 Share with players to join</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Screen header ─────────────────────────────
interface ScreenHeaderProps { title: string; subtitle?: string; right?: React.ReactNode }
export function ScreenHeader({ title, subtitle, right }: ScreenHeaderProps) {
  return (
    <View style={styles.screenHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.screenHeaderTitle}>{title}</Text>
        {subtitle && <Text style={styles.screenHeaderSub}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

// ── MTG Color Pips ────────────────────────────
interface MTGColorPipsProps { colors: MTGColor[]; size?: 'sm' | 'md' }

const COLOR_MAP: Record<MTGColor, { bg: string; text: string; border?: string }> = {
  W: { bg: '#f0ede0', text: '#3a3520' },
  U: { bg: '#1a5fa8', text: '#fff' },
  B: { bg: '#1a1a1a', text: '#ccc', border: '#555' },
  R: { bg: '#c0281c', text: '#fff' },
  G: { bg: '#1a6b2a', text: '#fff' },
};

export function MTGColorPips({ colors, size = 'sm' }: MTGColorPipsProps) {
  if (!colors || colors.length === 0) return null;
  const dim = size === 'md' ? 24 : 18;
  const fontSize = size === 'md' ? 12 : 9;
  return (
    <View style={pipStyles.row}>
      {colors.map(c => {
        const cm = COLOR_MAP[c];
        return (
          <View
            key={c}
            style={[
              pipStyles.circle,
              {
                width: dim,
                height: dim,
                borderRadius: dim / 2,
                backgroundColor: cm.bg,
                borderColor: cm.border ?? 'transparent',
                borderWidth: cm.border ? 1 : 0,
              },
            ]}
          >
            <Text style={[pipStyles.label, { color: cm.text, fontSize }]}>{c}</Text>
          </View>
        );
      })}
    </View>
  );
}

const pipStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: 'System', fontWeight: '700' },
});

// ── Pip (MTGA win/loss indicator) ─────────────
// ── PlayerAvatar ──────────────────────────────
const AVATAR_SIZE = { xs: 24, sm: 32, md: 48, lg: 80 } as const;
type AvatarSize = keyof typeof AVATAR_SIZE;

interface PlayerAvatarProps {
  avatarUrl?: string;
  emoji?: string;
  size?: AvatarSize;
  style?: ViewStyle;
}

export function PlayerAvatar({ avatarUrl, emoji = '🧙', size = 'md', style }: PlayerAvatarProps) {
  const [failed, setFailed] = useState(false);
  const px = AVATAR_SIZE[size];
  const radius = px / 2;

  if (avatarUrl && !failed) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[{ width: px, height: px, borderRadius: radius, backgroundColor: Colors.bgSurface }, style]}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[{
      width: px, height: px, borderRadius: radius,
      backgroundColor: Colors.bgSurface,
      alignItems: 'center', justifyContent: 'center',
    }, style]}>
      <Text style={{ fontSize: px * 0.55 }}>{emoji}</Text>
    </View>
  );
}

export function Pip({ filled, type }: { filled: boolean; type: 'win' | 'loss' | 'empty' }) {
  const color = type === 'win' ? Colors.greenLight : type === 'loss' ? Colors.redLight : Colors.border;
  const bg = filled
    ? type === 'win' ? 'rgba(78,202,127,0.25)' : type === 'loss' ? 'rgba(224,108,90,0.25)' : 'transparent'
    : 'transparent';
  return (
    <View style={[styles.pip, { borderColor: color, backgroundColor: bg }]} />
  );
}

// ── Styles ────────────────────────────────────
const styles = StyleSheet.create({
  btnBase: {
    borderWidth: 1,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnFull: { width: '100%' },
  btnText: {
    fontFamily: 'System',
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardGold: { borderColor: Colors.borderGold },
  sectionHeader: {
    ...Typography.label,
    paddingVertical: Spacing.sm,
    color: Colors.textMuted,
  },
  badge: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'System',
    fontWeight: '600',
    letterSpacing: 1.0,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  label: {
    ...Typography.label,
    marginBottom: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
  },
  emptyIcon: { fontSize: 52, marginBottom: Spacing.md },
  emptyTitle: { ...Typography.h3, color: Colors.textMuted, textAlign: 'center' },
  emptySubtitle: { ...Typography.bodySM, color: Colors.textFaint, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyCta: { marginTop: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowBetween: { justifyContent: 'space-between' },
  rowCenter: { justifyContent: 'center' },
  inviteBox: {
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderGold,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  inviteLabel: {
    ...Typography.labelGold,
    marginBottom: 8,
  },
  inviteCode: {
    fontFamily: 'Courier',
    fontSize: 32,
    color: Colors.gold,
    letterSpacing: 10,
  },
  inviteHint: {
    ...Typography.bodySM,
    color: Colors.textFaint,
    marginTop: 6,
  },
  inviteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 6,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  screenHeaderTitle: {
    ...Typography.h2,
    color: Colors.gold,
  },
  screenHeaderSub: {
    ...Typography.bodySM,
    color: Colors.textMuted,
    marginTop: 2,
  },
  pip: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
});
