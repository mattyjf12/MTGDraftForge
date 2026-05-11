import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, LogBox } from 'react-native';
import RootNavigator from './src/navigation/RootNavigator';
import { AppProvider } from './src/services/AppContext';
import OfflineBanner from './src/components/OfflineBanner';
import ErrorBoundary from './src/components/ErrorBoundary';
import { logCrashToFirestore } from './src/services/firebase';

// Suppress known harmless Metro warnings
LogBox.ignoreLogs(['Non-serializable values were found']);

// Capture unhandled promise rejections on Hermes and ship them to Firestore
if (typeof (global as any).HermesInternal !== 'undefined') {
  (global as any).HermesInternal?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id: number, rejection: unknown) => {
      console.error('[UnhandledPromise]', rejection);
      logCrashToFirestore(rejection, 'UnhandledPromise');
    },
  });
}

function AppShell() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppProvider>
          <NavigationContainer>
            <View style={styles.root}>
              <RootNavigator />
              <OfflineBanner />
            </View>
          </NavigationContainer>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
