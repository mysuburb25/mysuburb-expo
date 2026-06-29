import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="create-post" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="privacy-policy" />
        <Stack.Screen name="terms-of-service" />
        <Stack.Screen name="community-guidelines" />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="notification-preferences" />
        <Stack.Screen name="help-faq" />
        <Stack.Screen name="report-problem" />
      </Stack>
    </AuthProvider>
  );
}