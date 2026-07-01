import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import { router } from 'expo-router';

export default function TabsLayout() {
  const { profile, unreadCount, user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/(auth)/login');
    }
  }, [user, loading]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#FFD700',
        tabBarInactiveTintColor: '#c8e6c9',
        tabBarStyle: {
          backgroundColor: Colors.brandGreen,
          borderTopColor: Colors.brandGreen,
          height: 60,
          paddingBottom: 4,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: -2 },
        tabBarItemStyle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarIcon: ({ color }) => <Ionicons name="home" size={26} color={color} />, tabBarLabel: 'Home' }} />
      <Tabs.Screen name="events" options={{ tabBarIcon: ({ color }) => <Ionicons name="calendar" size={26} color={color} />, tabBarLabel: 'Events' }} />
      <Tabs.Screen name="marketplace" options={{ tabBarIcon: ({ color }) => <Ionicons name="pricetag" size={26} color={color} />, tabBarLabel: 'Buy&Sell' }} />
      <Tabs.Screen name="lost-found" options={{ tabBarIcon: ({ color }) => <Ionicons name="search" size={26} color={color} />, tabBarLabel: 'Lost & Found' }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}