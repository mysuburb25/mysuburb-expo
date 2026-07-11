const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');

initializeApp();
const db = getFirestore();

// Fires automatically whenever ANY code in the app writes a new document to
// the `notifications` collection — likes, comments, new posts, messages,
// everything already goes through this same collection, so nothing in the
// client app needs to change for this to work.
exports.sendPushOnNotification = onDocumentCreated('notifications/{notificationId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const notification = snap.data();
  const { userId, message, type, postId, conversationId } = notification;

  if (!userId || !message) return;

  try {
    // Read the recipient's push token using the Admin SDK, which bypasses
    // Firestore security rules entirely — this is exactly why the token is
    // stored in a private subcollection only the owner can read via the
    // client SDK, but the server can always read regardless.
    const tokenSnap = await db.doc(`users/${userId}/private/push`).get();
    if (!tokenSnap.exists) return; // user has never registered a device

    const { token } = tokenSnap.data();
    if (!token) return;

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title: 'My Suburb',
        body: message,
        sound: 'default',
        data: { type: type || null, postId: postId || null, conversationId: conversationId || null },
      }),
    });

    const result = await response.json();
    if (result?.data?.status === 'error') {
      logger.error('Expo push send error:', result.data);
    }
  } catch (e) {
    logger.error('sendPushOnNotification error:', e);
  }
});