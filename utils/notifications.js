// utils/notifications.js
// Helper to send push notification + write Firestore notification doc

import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export async function sendNotification({ toUserId, fromUserName, type, message, postId }) {
  try {
    // 1. Write to Firestore notifications collection (for in-app bell)
    await addDoc(collection(db, 'notifications'), {
      userId: toUserId,
      type,
      message,
      postId,
      fromUserName,
      isRead: false,
      createdAt: serverTimestamp(),
    });

    // 2. Get recipient's push token
    const userSnap = await getDoc(doc(db, 'users', toUserId));
    if (!userSnap.exists()) return;
    const pushToken = userSnap.data()?.pushToken;
    if (!pushToken) return;

    // 3. Send via Expo Push API
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        title: 'My Suburb',
        body: message,
        data: { postId, type },
        sound: 'default',
        badge: 1,
      }),
    });
  } catch (e) {
    console.error('sendNotification error:', e);
  }
}