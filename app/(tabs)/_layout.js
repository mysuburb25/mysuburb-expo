import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import { router } from 'expo-router';
import { useEffect } from 'react';

export default function TabLayout() {
  const { user, loading, unreadCount } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace('/(auth)/login');
  }, [user, loading]);

  if (loading || !user) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FFD700',
        tabBarInactiveTintColor: '#fff',
        tabBarStyle: {
          backgroundColor: Colors.brandGreen,
          borderTopWidth: 0,
          height: 60,
          paddingBottom: 8,
          paddingHorizontal: 25,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarItemStyle: { marginHorizontal: -8 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Ionicons name="home" size={22} color={color} /> }} />
      <Tabs.Screen name="events" options={{ title: 'Events', tabBarIcon: ({ color }) => <Ionicons name="calendar" size={22} color={color} /> }} />
      <Tabs.Screen name="buy-sell" options={{ title: 'Buy & Sell', tabBarIcon: ({ color }) => <Ionicons name="pricetag" size={22} color={color} /> }} />
      <Tabs.Screen name="services" options={{ title: 'Services', tabBarIcon: ({ color }) => <Ionicons name="briefcase" size={22} color={color} /> }} />
      <Tabs.Screen name="lost-found" options={{ title: 'Lost & Found', tabBarIcon: ({ color }) => <Ionicons name="search" size={22} color={color} /> }} />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
          tabBarIcon: ({ color }) => (
            <View>
              <Ionicons name="notifications" size={22} color={color} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: -4, right: -8, backgroundColor: '#E53935', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});