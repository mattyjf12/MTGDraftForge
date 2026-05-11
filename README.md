# MTG Draft Forge 🏰⚔️

A full-featured Magic: The Gathering tournament and draft manager for iOS and Android, built with React Native.

---

## Features

### 🏰 Draft Rooms
- Create personalized rooms with a shareable 6-character invite code
- Join rooms from any device using the invite code
- Owner controls: format, max players, settings
- Real-time player list

### 🏆 Tournament Formats
| Format | Description |
|--------|-------------|
| **Single Elimination** | Classic bracket. One loss = eliminated |
| **Double Elimination** | Winners + Losers brackets. Two losses = out |
| **Round Robin** | Everyone plays everyone. Most wins wins |
| **Seeded Single Elim** | Players ranked before bracket draw |
| **MTGA Style** | First to 7 wins (3 losses = eliminated) |
| **Suggested** | Auto-selects best format for player count |

### 📊 Bracket & Standings
- Visual bracket with match logging
- Live standings with W/L/Life Points/Match Points
- Life total tiebreaker system
- Round-by-round schedule view

### 🪑 Seating Chart
- Randomized circular draft pod seating
- Visual table layout with numbered seats
- Pack-passing direction indicator

### ❤️ Life Counter
- Multi-player life tracking (up to 6 players)
- Compact 2-column grid mode for tablets
- Poison counters + Energy counters
- Low-life danger alerts (≤5 life)
- Haptic feedback on life loss

### 🎲 Dice Roller
- Full dice set: d4, d6, d8, d10, d12, d20, d100
- Roll multiple dice at once (up to 10)
- Natural 20 / Critical Fail detection
- Roll history (last 20 rolls)
- Haptic feedback on roll

---

## Setup

### Prerequisites
- Node.js 18+
- React Native CLI
- Xcode (for iOS)
- Android Studio (for Android)

### Install

```bash
git clone https://github.com/yourrepo/MTGDraftForge
cd MTGDraftForge
npm install

# iOS
cd ios && pod install && cd ..
npx react-native run-ios

# Android
npx react-native run-android
```

### Firebase Setup (for multi-device real-time sync)

1. Create a project at [Firebase Console](https://console.firebase.google.com)
2. Enable **Firestore Database** and **Realtime Database**
3. Copy your config values into `src/services/firebase.ts`
4. Download `GoogleService-Info.plist` → `ios/`
5. Download `google-services.json` → `android/app/`
6. For iOS, add to `ios/MTGDraftForge/AppDelegate.mm`:
   ```objc
   #import <Firebase/Firebase.h>
   // in didFinishLaunchingWithOptions:
   [FIRApp configure];
   ```

**Without Firebase:** The app works fully offline using AsyncStorage persistence on each device. Firebase is only needed for cross-device real-time sync (players joining from different phones).

---

## Project Structure

```
src/
├── theme/           # Colors, typography, spacing, format constants
├── utils/
│   ├── types.ts     # All TypeScript interfaces
│   └── tournament.ts # Bracket generation, standings, seating logic
├── services/
│   ├── AppContext.tsx  # Global state (reducer + AsyncStorage)
│   └── firebase.ts    # Firebase Firestore/RTDB sync
├── navigation/
│   └── RootNavigator.tsx
├── components/
│   └── UI.tsx       # Button, Card, Badge, etc.
└── screens/
    ├── OnboardingScreen.tsx
    ├── RoomsListScreen.tsx
    ├── CreateRoomScreen.tsx
    ├── JoinRoomScreen.tsx
    ├── TournamentScreen.tsx   # Room hub
    ├── BracketScreen.tsx      # All bracket formats
    ├── StandingsScreen.tsx
    ├── ScheduleScreen.tsx
    ├── SeatingScreen.tsx
    ├── RoomSettingsScreen.tsx
    ├── LifeCounterScreen.tsx
    └── DiceRollerScreen.tsx
```

---

## Roadmap / Future Features

- [ ] Firebase Auth (anonymous + Google Sign-In)
- [ ] Push notifications when your match is ready
- [ ] Commander damage tracking in life counter
- [ ] Photo avatars for players
- [ ] Swiss pairing format
- [ ] Export bracket as image
- [ ] Dark/light theme toggle
- [ ] iPad optimized layout

---

## Tech Stack

| Library | Purpose |
|---------|---------|
| React Native 0.73 | Cross-platform mobile |
| React Navigation 6 | Navigation (stack + bottom tabs) |
| AsyncStorage | Local persistence |
| Firebase (optional) | Real-time multi-device sync |
| react-native-svg | Seating chart diagram |
| react-native-reanimated | Smooth animations |

---

## License

MIT
