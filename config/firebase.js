import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyCeLm6XUSwA7_0xdAx6LPQQfmp36dPP9-M",
  authDomain: "mysuburb-82d3e.firebaseapp.com",
  projectId: "mysuburb-82d3e",
  storageBucket: "mysuburb-82d3e.firebasestorage.app",
  messagingSenderId: "281952718355",
  appId: "1:281952718355:web:d51407da4cf17bf4d239e6"
};

const app = initializeApp(firebaseConfig);

// getAuth(app) alone defaults to in-memory-only persistence on React
// Native — the auth session lives only as long as the JS engine does,
// so it's wiped every time the app is backgrounded or killed, forcing a
// fresh login each time. This is the single most common Expo+Firebase
// gotcha. initializeAuth with AsyncStorage-backed persistence keeps the
// session on-device properly, the same way every other app stays logged
// in.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// initializeFirestore with experimentalForceLongPolling, rather than a
// plain getFirestore(app) — the default WebSocket-style streaming
// connection has a well-documented, recurring compatibility issue on
// React Native (WebChannelConnection "Listen" stream transport errored,
// sometimes escalating to a native RangeError: String length exceeds
// limit crash) reported across many Expo/React Native Firebase projects.
// Forcing long-polling avoids that transport entirely in favour of one
// that's proven far more reliable in this specific environment.
// useFetchStreams: false pairs with this, since the fetch-based
// streaming path has the same underlying compatibility problem.
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});

export const storage = getStorage(app);
export default app;