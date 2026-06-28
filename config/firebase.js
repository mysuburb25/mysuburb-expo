import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCeLm6XUSwA7_0xdAx6LPQQfmp36dPP9-M",
  authDomain: "mysuburb-82d3e.firebaseapp.com",
  projectId: "mysuburb-82d3e",
  storageBucket: "mysuburb-82d3e.firebasestorage.app",
  messagingSenderId: "281952718355",
  appId: "1:281952718355:web:d51407da4cf17bf4d239e6"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;