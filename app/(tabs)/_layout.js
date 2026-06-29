import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/theme';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

export default function TabsLayout() {
  const { profile, unreadCount } = useAuth();

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
        headerStyle: { backgroundColor: Colors.brandGreen },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: '800', color: Colors.white, fontSize: 20 },
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile')}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFD700', justifyContent: 'center', alignItems: 'center', marginLeft: 16 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.brandGreen }}>
              {profile?.displayName?.[0]?.toUpperCase() || '?'}
            </Text>
          </TouchableOpacity>
        ),
        headerRight: () => (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/notifications')}
            style={{ marginRight: 16, position: 'relative' }}
          >
            <Ionicons name="notifications" size={26} color={unreadCount > 0 ? '#FFD700' : '#fff'} />
            {unreadCount > 0 && (
              <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#FFD700', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 }}>
                <Text style={{ color: Colors.brandGreen, fontSize: 10, fontWeight: '800' }}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="home" size={26} color={color} />,
          tabBarLabel: 'Home',
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="calendar" size={26} color={color} />,
          tabBarLabel: 'Events',
        }}
      />
      <Tabs.Screen
        name="marketplace"
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="pricetag" size={26} color={color} />,
          tabBarLabel: 'Buy&Sell',
        }}
      />
      <Tabs.Screen
        name="lost-found"
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="search" size={26} color={color} />,
          tabBarLabel: 'Lost+Found',
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null }}
      />
    </Tabs>
  );
}