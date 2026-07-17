import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Alert } from 'react-native';
import { Colors } from '../../constants/theme';
import { router } from 'expo-router';
import { useEffect } from 'react';

function TabIcon({ name, focused }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={name} size={22} color={focused ? Colors.brandGreen : '#fff'} />
    </View>
  );
}

export default function TabLayout() {
  const { user, profile, loading, unreadCount, logout } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace('/(auth)/login');
  }, [user, loading]);

  // Suspension takes effect the moment the app next checks the profile —
  // an admin setting isSuspended: true doesn't forcibly disconnect an
  // already-open session, but the next screen focus / app reopen catches
  // it here and signs them out before any tab content renders.
  useEffect(() => {
    if (!loading && user && profile?.isSuspended) {
      Alert.alert(
        'Account Suspended',
        'Your account has been suspended. Contact support if you believe this is a mistake.',
        [{ text: 'OK', onPress: async () => { await logout(); router.replace('/(auth)/login'); } }]
      );
    }
  }, [loading, user, profile?.isSuspended]);

  // Also gate on !profile, not just loading/user — belt-and-suspenders
  // against the profile-loading race condition: even if something upstream
  // still lets loading flip to false before the profile is actually set,
  // the tabs simply never render with a broken/empty profile underneath
  // them. Renders a blank screen for that brief moment instead, rather
  // than a visibly broken one.
  if (loading || !user || !profile) return null;
  if (profile?.isSuspended) return null;

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
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} /> }} />
      <Tabs.Screen name="events" options={{ title: 'Events', tabBarIcon: ({ focused }) => <TabIcon name="calendar" focused={focused} /> }} />
      <Tabs.Screen name="buy-sell" options={{ title: 'Buy & Sell', tabBarIcon: ({ focused }) => <TabIcon name="pricetag" focused={focused} /> }} />
      <Tabs.Screen name="services" options={{ title: 'Services', tabBarIcon: ({ focused }) => <TabIcon name="briefcase" focused={focused} /> }} />
      <Tabs.Screen name="lost-found" options={{ title: 'Lost & Found', tabBarIcon: ({ focused }) => <TabIcon name="flag" focused={focused} /> }} />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
          tabBarIcon: ({ focused }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons name="notifications" size={22} color={focused ? Colors.brandGreen : '#fff'} />
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
  iconWrap: { width: 44, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  iconWrapActive: { backgroundColor: '#FFD700' },
  badge: { position: 'absolute', top: -4, right: -2, backgroundColor: '#E53935', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});