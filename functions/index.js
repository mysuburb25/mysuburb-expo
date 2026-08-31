const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');
// Wrapped defensively — this is the only genuinely new import in this
// file. If it fails for any reason (e.g. an older firebase-admin
// version that doesn't support this modular path), it must NOT be
// allowed to throw at the top level, since that would prevent the
// entire file from loading and take down every function below,
// including the four already running in production. Storage support
// simply degrades to "unavailable" in that case instead.
let getStorage = null;
try {
  ({ getStorage } = require('firebase-admin/storage'));
} catch (e) {
  logger.error('firebase-admin/storage unavailable — healthcheck will skip the Storage check:', e.message);
}
const { findProhibitedTerm } = require('./contentModeration');

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
    const tokenSnap = await db.doc(`users/${userId}/private/push`).get();
    if (!tokenSnap.exists) return;

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

exports.screenNewPost = onDocumentCreated('posts/{postId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const post = snap.data();
  const postId = event.params.postId;

  const textToScreen = [post.content, post.description]
    .filter(Boolean)
    .join(' ');

  const flaggedTerm = findProhibitedTerm(textToScreen);
  if (!flaggedTerm) return;

  try {
    await snap.ref.update({ isRemoved: true });

    await db.collection('reports').add({
      status: 'open',
      category: 'Post content',
      reason: `Auto-flagged: possible prohibited item ("${flaggedTerm}")`,
      description: 'This post was automatically hidden by the system and needs manual review before it can be restored.',
      postId,
      postContent: post.content || null,
      postAuthorName: post.authorName || 'Unknown',
      suburb: post.suburb || null,
      state: post.state || null,
      userDisplayName: 'System (auto-flag)',
      userEmail: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    logger.warn(`Post ${postId} auto-flagged and hidden for term: "${flaggedTerm}"`);
  } catch (e) {
    logger.error('screenNewPost error:', e);
  }
});

const ADMIN_UID = 'ENNHw4XclOMcjiRkjH8eIXQdV223';
const ADMIN_NAME = 'MySuburb';

const WELCOME_MESSAGE = `Welcome to MySuburb!

Thanks for signing up and joining our community.

Please explore the app, choose the suburbs you care about, and stay connected with local updates, events, notices, Buy & Sell, Lost & Found and Services.

Please share it with your friends and help us grow our local community.

🔗 https://mysuburb.app

Thanks,
MySuburb`;

exports.sendWelcomeMessage = onDocumentCreated('users/{userId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const newUserId = event.params.userId;

  if (newUserId === ADMIN_UID) return;

  const userData = snap.data();
  const newUserName = userData.displayName || 'Neighbour';
  const newUserPhoto = userData.photoURL || null;

  const conversationId = [ADMIN_UID, newUserId].sort().join('_');

  try {
    await db.doc(`conversations/${conversationId}`).set({
      participants: [ADMIN_UID, newUserId],
      participantNames: { [ADMIN_UID]: ADMIN_NAME, [newUserId]: newUserName },
      participantPhotos: { [ADMIN_UID]: null, [newUserId]: newUserPhoto },
      lastMessage: 'Welcome to MySuburb!',
      lastMessageSenderId: ADMIN_UID,
      lastMessageAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      unreadCount: { [newUserId]: FieldValue.increment(1) },
      deletedBy: FieldValue.arrayRemove(ADMIN_UID, newUserId),
    }, { merge: true });

    await db.collection(`conversations/${conversationId}/messages`).add({
      senderId: ADMIN_UID,
      senderName: ADMIN_NAME,
      text: WELCOME_MESSAGE,
      createdAt: FieldValue.serverTimestamp(),
      read: false,
    });

    await db.collection('notifications').add({
      userId: newUserId,
      type: 'message',
      message: `${ADMIN_NAME} sent you a message`,
      fromUserId: ADMIN_UID,
      fromUserName: ADMIN_NAME,
      conversationId,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Welcome message sent to new user ${newUserId}`);
  } catch (e) {
    logger.error('sendWelcomeMessage error:', e);
  }
});

const BACKFILL_KEY = 'nxPYEU4LNkxtPohN5rL3hl6RYyCbp8uP';

exports.backfillWelcomeMessages = onRequest({ timeoutSeconds: 540 }, async (req, res) => {
  if (req.query.key !== BACKFILL_KEY) {
    res.status(403).send('Forbidden');
    return;
  }

  try {
    const usersSnap = await db.collection('users').get();
    let sent = 0, skipped = 0;

    for (const userDoc of usersSnap.docs) {
      const newUserId = userDoc.id;
      if (newUserId === ADMIN_UID) { skipped++; continue; }

      const conversationId = [ADMIN_UID, newUserId].sort().join('_');

      const existingConvo = await db.doc(`conversations/${conversationId}`).get();
      if (existingConvo.exists) { skipped++; continue; }

      const userData = userDoc.data();
      const newUserName = userData.displayName || 'Neighbour';
      const newUserPhoto = userData.photoURL || null;

      await db.doc(`conversations/${conversationId}`).set({
        participants: [ADMIN_UID, newUserId],
        participantNames: { [ADMIN_UID]: ADMIN_NAME, [newUserId]: newUserName },
        participantPhotos: { [ADMIN_UID]: null, [newUserId]: newUserPhoto },
        lastMessage: 'Welcome to MySuburb!',
        lastMessageSenderId: ADMIN_UID,
        lastMessageAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        unreadCount: { [newUserId]: FieldValue.increment(1) },
        deletedBy: FieldValue.arrayRemove(ADMIN_UID, newUserId),
      }, { merge: true });

      await db.collection(`conversations/${conversationId}/messages`).add({
        senderId: ADMIN_UID,
        senderName: ADMIN_NAME,
        text: WELCOME_MESSAGE,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
      });

      await db.collection('notifications').add({
        userId: newUserId,
        type: 'message',
        message: `${ADMIN_NAME} sent you a message`,
        fromUserId: ADMIN_UID,
        fromUserName: ADMIN_NAME,
        conversationId,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      sent++;
    }

    logger.info(`Backfill complete: sent ${sent}, skipped ${skipped}`);
    res.status(200).send(`Backfill complete. Sent: ${sent}, Skipped: ${skipped}`);
  } catch (e) {
    logger.error('backfillWelcomeMessages error:', e);
    res.status(500).send('Backfill failed: ' + e.message);
  }
});

// ---------------------------------------------------------------------
// HEALTHCHECK — added for automated uptime monitoring (e.g. Instatus).
// A real write-then-read against Firestore, plus a bucket-existence
// check against Storage, so this actually reflects whether the two
// backend pieces the app depends on most are working — not just
// whether this function itself is reachable. Returns HTTP 200 when
// everything's healthy, 503 when something's degraded, so a monitoring
// service can alert correctly without needing to parse the JSON body.
exports.healthcheck = onRequest(async (req, res) => {
  const checks = { firestore: false, storage: false };
  const errors = [];

  try {
    const ref = db.collection('_healthchecks').doc('latest');
    await ref.set({ checkedAt: FieldValue.serverTimestamp() });
    const snap = await ref.get();
    checks.firestore = snap.exists;
  } catch (e) {
    errors.push(`Firestore: ${e.message}`);
  }

  try {
    if (!getStorage) throw new Error('Storage module not available');
    const bucket = getStorage().bucket();
    const [exists] = await bucket.exists();
    checks.storage = exists;
  } catch (e) {
    errors.push(`Storage: ${e.message}`);
  }

  const allHealthy = checks.firestore && checks.storage;

  if (!allHealthy) {
    logger.warn('Healthcheck failed:', errors);
  }

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ok' : 'degraded',
    checks,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
  });
});