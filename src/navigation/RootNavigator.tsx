// ─────────────────────────────────────────────
// MTG Draft Forge — Navigation
// ─────────────────────────────────────────────
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View, StyleSheet, Image } from 'react-native';
import { Colors, Spacing } from '../theme';

// Screen imports
import RoomsListScreen      from '../screens/RoomsListScreen';
import CreateRoomScreen     from '../screens/CreateRoomScreen';
import JoinRoomScreen       from '../screens/JoinRoomScreen';
import TournamentScreen     from '../screens/TournamentScreen';
import BracketScreen        from '../screens/BracketScreen';
import StandingsScreen      from '../screens/StandingsScreen';
import ScheduleScreen       from '../screens/ScheduleScreen';
import SeatingScreen        from '../screens/SeatingScreen';
import RoomSettingsScreen   from '../screens/RoomSettingsScreen';
import CommanderPodsScreen  from '../screens/CommanderPodsScreen';
import LifeCounterScreen    from '../screens/LifeCounterScreen';
import DiceRollerScreen     from '../screens/DiceRollerScreen';
import OnboardingScreen     from '../screens/OnboardingScreen';
import ProfileScreen        from '../screens/ProfileScreen';
import { useApp }           from '../services/AppContext';

// ── Stack param lists ─────────────────────────
export type RoomsStackParams = {
  RoomsList: undefined;
  CreateRoom: undefined;
  JoinRoom: undefined;
  Tournament: { roomId: string };
  Bracket: { roomId: string };
  Standings: { roomId: string };
  Schedule: { roomId: string };
  Seating: { roomId: string };
  RoomSettings: { roomId: string };
  CommanderPods: { roomId: string };
};

// ── Rooms stack ───────────────────────────────
const RoomsStack = createNativeStackNavigator<RoomsStackParams>();

function RoomsNavigator() {
  return (
    <RoomsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.bgCard },
        headerTintColor: Colors.gold,
        headerTitleStyle: { fontFamily: 'Georgia', fontSize: 17, color: Colors.text },
        headerBackTitleVisible: false,
        contentStyle: { backgroundColor: Colors.bgDeep },
      }}
    >
      <RoomsStack.Screen name="RoomsList"    component={RoomsListScreen}    options={{ title: 'Draft Rooms' }} />
      <RoomsStack.Screen name="CreateRoom"   component={CreateRoomScreen}   options={{ title: 'New Room' }} />
      <RoomsStack.Screen name="JoinRoom"     component={JoinRoomScreen}     options={{ title: 'Join Room' }} />
      <RoomsStack.Screen name="Tournament"   component={TournamentScreen}   options={{ title: 'Tournament' }} />
      <RoomsStack.Screen name="Bracket"      component={BracketScreen}      options={{ title: 'Bracket' }} />
      <RoomsStack.Screen name="Standings"    component={StandingsScreen}    options={{ title: 'Standings' }} />
      <RoomsStack.Screen name="Schedule"     component={ScheduleScreen}     options={{ title: 'Schedule' }} />
      <RoomsStack.Screen name="Seating"      component={SeatingScreen}      options={{ title: 'Seating Chart' }} />
      <RoomsStack.Screen name="RoomSettings"    component={RoomSettingsScreen}   options={{ title: 'Room Settings' }} />
      <RoomsStack.Screen name="CommanderPods"  component={CommanderPodsScreen}  options={{ title: 'Commander Pods' }} />
    </RoomsStack.Navigator>
  );
}

// ── Tab icon ──────────────────────────────────
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconActive]}>
      <Text style={[styles.tabEmoji, focused && styles.tabEmojiActive]}>{emoji}</Text>
    </View>
  );
}

function ProfileTabIcon({ focused }: { focused: boolean }) {
  const { state } = useApp();
  const { avatarUrl, profileEmoji } = state;
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconActive]}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={[styles.avatarTabIcon, focused && styles.avatarTabIconActive]}
        />
      ) : (
        <Text style={[styles.tabEmoji, focused && styles.tabEmojiActive]}>{profileEmoji}</Text>
      )}
    </View>
  );
}

// ── Bottom tabs ───────────────────────────────
const Tab = createBottomTabNavigator();

export default function RootNavigator() {
  const { state } = useApp();

  // Show onboarding if no username set yet
  if (!state.currentUserName && state.hasHydrated) {
    return <OnboardingScreen />;
  }

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Rooms"
        component={RoomsNavigator}
        options={{
          tabBarLabel: 'Rooms',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏰" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="LifeCounter"
        component={LifeCounterScreen}
        options={{
          tabBarLabel: 'Life',
          tabBarIcon: ({ focused }) => <TabIcon emoji="❤️" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="DiceRoller"
        component={DiceRollerScreen}
        options={{
          tabBarLabel: 'Dice',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎲" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.bgCard,
    borderTopColor: Colors.borderGold,
    borderTopWidth: 1,
    paddingBottom: 6,
  },
  tabLabel: {
    fontFamily: 'System',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '500',
  },
  tabIconWrap: {
    width: 36,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabIconActive: {
    backgroundColor: Colors.goldGlow,
  },
  tabEmoji: { fontSize: 18, opacity: 0.5 },
  tabEmojiActive: { opacity: 1 },
  avatarTabIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    opacity: 0.6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  avatarTabIconActive: {
    opacity: 1,
    borderColor: Colors.gold,
  },
});
