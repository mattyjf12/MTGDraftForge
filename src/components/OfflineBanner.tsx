// OfflineBanner.tsx
// Displays a persistent red bar at the top of the screen when the device
// has no internet connection. Animates in/out smoothly.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Colors, Typography, Spacing } from '../theme';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = React.useState(false);
  const slideAnim = useRef(new Animated.Value(-48)).current; // starts hidden above screen

  useEffect(() => {
    // Guard: native module may not be linked yet (e.g. before pod install / Android rebuild)
    try {
      const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
        const offline = !state.isConnected || state.isInternetReachable === false;
        setIsOffline(offline);
      });

      NetInfo.fetch().then((state: NetInfoState) => {
        const offline = !state.isConnected || state.isInternetReachable === false;
        setIsOffline(offline);
      }).catch(() => {});

      return unsubscribe;
    } catch (e) {
      // Native module not available — banner stays hidden, app still works fine
      console.warn('[OfflineBanner] NetInfo native module not linked:', e);
    }
  }, []);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isOffline ? 0 : -48,
      useNativeDriver: true,
      damping: 18,
      stiffness: 200,
    }).start();
  }, [isOffline, slideAnim]);

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}
      pointerEvents="none"
    >
      <Text style={styles.icon}>📡</Text>
      <Text style={styles.text}>No internet connection — room sync paused</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: '#C0392B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    // Safe-area handled by the parent SafeAreaProvider; the banner slides
    // in from above so it naturally sits under the status bar notch.
  },
  icon: { fontSize: 14 },
  text: {
    ...Typography.bodySM,
    color: '#fff',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
