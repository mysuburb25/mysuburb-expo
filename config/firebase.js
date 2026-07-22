import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
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

export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;