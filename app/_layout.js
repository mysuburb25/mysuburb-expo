import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import * as Updates from 'expo-updates';
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
    // Proactively checks for a newer OTA update the moment the app
    // starts, rather than passively waiting for it to be noticed on some
    // future launch. If one's found, it downloads and immediately
    // reloads the app with it — right here, in this same session — so a
    // fresh install (or anyone who hasn't relaunched in a while) gets
    // the latest code on effectively their first real launch, instead of
    // needing to manually close and reopen the app twice to pick it up.
    // Wrapped defensively: any failure here (offline, dev mode, etc.)
    // just means the app continues running on whatever code it already
    // has — never blocks or crashes the app itself.
    async function checkForUpdate() {
      if (__DEV__) return; // updates don't apply in local dev anyway
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        console.error('Update check failed:', e);
      }
    }
    checkForUpdate();
  }, []);

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

  useEffect(() => {
    // Gives the on-screen Android navigation bar a solid background
    // instead of the system default transparent/see-through bar, which
    // was letting content underneath (e.g. the Create Account button)
    // show through it. Only relevant on Android — iOS and web have no
    // equivalent API, and calling this there would throw.
    //
    // Note: on Android 15+ (API 35+), Google enforces edge-to-edge
    // display and may ignore this setting entirely — that's a deliberate
    // OS-level design change, not something an app can override. On
    // those versions, correct insets.bottom padding on each screen (already
    // in place) is what actually keeps content clear of that area, since
    // the transparency itself is expected system behavior there, not a bug.
    if (Platform.OS === 'android') {
      NavigationBar.setBackgroundColorAsync('#FFFFFF').catch(() => {});
      NavigationBar.setButtonStyleAsync('dark').catch(() => {});
    }
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