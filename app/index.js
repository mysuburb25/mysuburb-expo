import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

export default function Index() {
  const { user, profile, loading } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready || loading) return;
    if (!user) {
      router.replace('/(auth)/login');
    } else if (!profile?.suburb) {
      router.replace('/(auth)/select-suburb');
    } else {
      router.replace('/(tabs)');
    }
  }, [user, profile, loading, ready]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.white} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.brandGreen,
    justifyContent: 'center',
    alignItems: 'center',
  },
});