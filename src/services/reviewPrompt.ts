// reviewPrompt.ts
// Shows a "Enjoying the app?" prompt after a player completes a tournament.
// If they say Yes → opens the App Store / Play Store review page.
// Uses AsyncStorage to only prompt once every 30 days and never more than 3 times total.

import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_COUNT     = '@review_prompt_count';
const STORAGE_KEY_LAST_DATE = '@review_prompt_last_date';

const MAX_PROMPTS   = 3;          // never ask more than 3 times total
const MIN_DAYS_GAP  = 30;         // at least 30 days between prompts

// Replace with your real App Store ID once the app is live on the App Store.
// Find it in App Store Connect → App Information → Apple ID.
const IOS_APP_ID = 'YOUR_APP_STORE_ID';

// Android uses the package name from AndroidManifest
const ANDROID_PACKAGE = 'com.mtgdraftforge';

function storeUrl(): string {
  if (Platform.OS === 'ios') {
    return `itms-apps://itunes.apple.com/app/id${IOS_APP_ID}?action=write-review`;
  }
  return `market://details?id=${ANDROID_PACKAGE}`;
}

async function shouldPrompt(): Promise<boolean> {
  try {
    const [countStr, lastDateStr] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_COUNT),
      AsyncStorage.getItem(STORAGE_KEY_LAST_DATE),
    ]);

    const count = parseInt(countStr ?? '0', 10);
    if (count >= MAX_PROMPTS) return false;

    if (lastDateStr) {
      const daysSinceLast = (Date.now() - parseInt(lastDateStr, 10)) / 86_400_000;
      if (daysSinceLast < MIN_DAYS_GAP) return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function recordPrompt(): Promise<void> {
  try {
    const countStr = await AsyncStorage.getItem(STORAGE_KEY_COUNT);
    const count = parseInt(countStr ?? '0', 10);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY_COUNT, String(count + 1)),
      AsyncStorage.setItem(STORAGE_KEY_LAST_DATE, String(Date.now())),
    ]);
  } catch { /* ignore */ }
}

/**
 * Call this after a tournament completes. It checks eligibility,
 * shows a polite Alert, and opens the store if the user says Yes.
 */
export async function maybeProposeReview(): Promise<void> {
  if (!(await shouldPrompt())) return;

  await recordPrompt(); // record before showing so a crash doesn't re-show it

  Alert.alert(
    '⚔️ Enjoying MTG Draft Forge?',
    'Help other MTG players find the app by leaving a quick review — it only takes a moment!',
    [
      { text: 'Not Now', style: 'cancel' },
      {
        text: '⭐ Rate the App',
        onPress: async () => {
          const url = storeUrl();
          const supported = await Linking.canOpenURL(url);
          if (supported) {
            await Linking.openURL(url);
          }
        },
      },
    ],
  );
}
