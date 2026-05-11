// ErrorBoundary.tsx
// Catches unhandled JS errors anywhere in the component tree and shows a
// friendly recovery screen instead of a blank white crash.

import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { logCrashToFirestore } from '../services/firebase';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? 'Unknown error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console so Metro / Xcode / ADB can see it in dev
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);

    // Persist to Firestore → Firebase Console → crashReports collection
    logCrashToFirestore(error, 'ErrorBoundary');
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            MTG Draft Forge hit an unexpected error. Your rooms and tournament
            data are safe in the cloud.
          </Text>

          {__DEV__ && (
            <View style={styles.devBox}>
              <Text style={styles.devLabel}>Error (dev only)</Text>
              <Text style={styles.devError}>{this.state.errorMessage}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgDeep,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  icon: {
    fontSize: 56,
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: 'Georgia',
    fontSize: 22,
    color: Colors.gold,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  devBox: {
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.redLight,
    borderRadius: Radius.md,
    padding: Spacing.md,
    width: '100%',
    marginBottom: Spacing.xl,
  },
  devLabel: {
    ...Typography.label,
    color: Colors.redLight,
    marginBottom: 4,
  },
  devError: {
    ...Typography.bodySM,
    color: Colors.text,
    fontFamily: 'Courier',
  },
  button: {
    backgroundColor: Colors.goldGlow,
    borderWidth: 1,
    borderColor: Colors.gold,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
  },
  buttonText: {
    ...Typography.bodyMD,
    color: Colors.gold,
    fontWeight: '700',
  },
});
