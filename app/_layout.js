import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as ScreenOrientation from 'expo-screen-orientation';
import { AuthProvider } from '../context/AuthContext';

// Without this, a push that arrives while the app is open and in the
// foreground gets silently swallowed instead of showing a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    // The "orientation": "portrait" setting in app.json is often not
    // reliably enforced inside Expo Go specifically (a known Expo Go
    // limitation, not something specific to this project) — actively
    // locking it here in code is the more dependable fix while testing
    // through Expo Go. This becomes redundant but harmless once running
    // on a real dev/production build, where app.json's setting works
    // properly on its own.
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="chat/[userId]" />
        <Stack.Screen name="user/[userId]" />
        <Stack.Screen name="create-post" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="privacy-policy" />
        <Stack.Screen name="terms-of-service" />
        <Stack.Screen name="community-guidelines" />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="delete-account" />
        <Stack.Screen name="notification-preferences" />
        <Stack.Screen name="blocked-users" />
        <Stack.Screen name="help-faq" />
        <Stack.Screen name="report-problem" />
        <Stack.Screen name="moderation" />
        <Stack.Screen name="share-picker" />
      </Stack>
    </AuthProvider>
  );
}