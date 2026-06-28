import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.brandGreen,
        tabBarInactiveTintColor: Colors.midGrey,
        tabBarStyle: { backgroundColor: Colors.white, borderTopColor: Colors.lightGrey, height: 60, paddingBottom: 8 },
        headerStyle: { backgroundColor: Colors.white },
        headerTintColor: Colors.charcoal,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="marketplace" options={{ title: 'Market', tabBarIcon: ({ color, size }) => <Ionicons name="storefront" size={size} color={color} /> }} />
      <Tabs.Screen name="events" options={{ title: 'Events', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }} />
      <Tabs.Screen name="lost-found" options={{ title: 'Lost & Found', tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }} />
    </Tabs>
  );
}