const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
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

// ---------------------------------------------------------------------
// CLEANUP ON ACCOUNT DELETION — fires automatically when a user's
// profile document is deleted (which delete-account.js already does as
// part of the existing account-deletion flow — no change needed there).
//
// Deliberately scoped to PRIVATE content only: conversations, their
// messages, and chat media. Posts and comments are intentionally left
// alone — they're public, other people may have replied to them, and
// the existing deletion flow already handles that case correctly by
// leaving the content in place but no longer linked to a real account.
// A private 1:1 conversation has no equivalent "other people are
// relying on this" reason to keep it once one participant is gone, so
// it gets removed outright instead.
//
// Runs with the Admin SDK, which bypasses Firestore security rules
// entirely. That's deliberate here, not incidental: a conversation
// contains messages from BOTH participants, and typical security rules
// only let someone delete their own messages, not the other person's —
// running this client-side (from delete-account.js itself) would very
// plausibly fail partway through on exactly that permission boundary.
// Server-side cleanup with admin privileges is what makes it possible
// to reliably remove the whole conversation, not just the leaving
// user's half of it.
exports.cleanupUserDataOnDelete = onDocumentDeleted('users/{userId}', async (event) => {
  const deletedUserId = event.params.userId;
  // The snapshot of the document as it existed the instant before
  // deletion — still readable here even though the document itself is
  // already gone from Firestore by the time this trigger fires.
  const deletedData = event.data?.data() || {};

  try {
    const conversationsSnap = await db.collection('conversations')
      .where('participants', 'array-contains', deletedUserId)
      .get();

    for (const convoDoc of conversationsSnap.docs) {
      const conversationId = convoDoc.id;

      // Delete every message in this conversation — both participants',
      // not just the deleted user's own — since a private 1:1
      // conversation with one participant now gone has no remaining
      // legitimate reason to exist at all.
      try {
        const messagesSnap = await db.collection('conversations').doc(conversationId).collection('messages').get();
        if (!messagesSnap.empty) {
          const batch = db.batch();
          messagesSnap.docs.forEach(msgDoc => batch.delete(msgDoc.ref));
          await batch.commit();
        }
      } catch (e) {
        logger.error(`Failed to delete messages for conversation ${conversationId}:`, e);
      }

      // Delete any chat media (photos/videos + their thumbnails) stored
      // for this conversation. Uses the same defensively-imported
      // getStorage as the healthcheck function above — if Storage is
      // unavailable for any reason, this is logged and skipped rather
      // than blocking the rest of the cleanup (the conversation and
      // message documents still get removed either way).
      if (getStorage) {
        try {
          const bucket = getStorage().bucket();
          await bucket.deleteFiles({ prefix: `chatMedia/${conversationId}/` });
        } catch (e) {
          logger.error(`Failed to delete chat media for conversation ${conversationId}:`, e);
        }
      }

      // Delete the conversation document itself last, once its
      // messages and media are already gone.
      try {
        await convoDoc.ref.delete();
      } catch (e) {
        logger.error(`Failed to delete conversation doc ${conversationId}:`, e);
      }
    }

    logger.info(`Cleaned up ${conversationsSnap.size} conversation(s) for deleted user ${deletedUserId}`);
  } catch (e) {
    logger.error(`cleanupUserDataOnDelete error for user ${deletedUserId}:`, e);
  }

  // Records this deletion for the admin dashboard's Deleted tab —
  // reads the pendingDeletionBy/pendingDeletionByName/pendingDeletionEmail
  // marker fields that whichever deletion path (self-service in
  // delete-account.js, or admin via adminDeleteUser below) wrote onto
  // this same document just before deleting it. Falls back to
  // 'unknown' rather than failing outright if an older client version
  // deletes an account without setting the marker — this audit trail
  // being incomplete for one entry is better than the whole cleanup
  // function throwing over it.
  try {
    await db.collection('deletedUsers').add({
      uid: deletedUserId,
      displayName: deletedData.displayName || 'Unknown',
      email: deletedData.pendingDeletionEmail || null,
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: deletedData.pendingDeletionBy || 'unknown',
      deletedByName: deletedData.pendingDeletionByName || null,
    });
  } catch (e) {
    logger.error(`Failed to write deletedUsers record for ${deletedUserId}:`, e);
  }
});

// ---------------------------------------------------------------------
// ADMIN DELETE USER — lets an admin remove someone else's account
// proactively (not just via the existing Reports-tab suspend flow).
//
// This has to be a Cloud Function, not client-side code, because the
// Firebase client SDK can only ever delete the CURRENTLY SIGNED-IN
// person's own account (as delete-account.js already does for
// self-service deletion) — there's no client-side API for one account
// to delete a different account. Only the Admin SDK can do that, which
// only runs server-side.
//
// onCall (rather than onRequest, used elsewhere in this file) is
// deliberately used here — it automatically verifies the caller's
// Firebase Auth ID token and exposes their verified uid as
// request.auth.uid, without needing to manually parse and verify a
// token from raw HTTP headers the way an onRequest function would.
// That verified uid is what makes the isAdmin check below trustworthy:
// it's confirmed by Firebase itself, not just a value the client claims.
//
// Deleting the target's Firestore profile doc here also automatically
// fires the cleanupUserDataOnDelete trigger above — an admin-initiated
// deletion gets the exact same conversation/message/media cleanup a
// self-service deletion does, since that trigger fires on the
// users/{userId} deletion event regardless of what caused it.
exports.adminDeleteUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to do this.');
  }

  const callerUid = request.auth.uid;
  const targetUid = request.data?.targetUid;

  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'No target user specified.');
  }
  if (targetUid === callerUid) {
    throw new HttpsError('invalid-argument', "You can't delete your own account this way — use Delete Account in Settings instead.");
  }

  // Verifies admin status directly from Firestore rather than trusting
  // anything the client sent — matches the same profile.isAdmin field
  // already used throughout the app (see post-detail.js and elsewhere)
  // for consistency, rather than introducing a different admin-check
  // mechanism (like Auth custom claims) that nothing else here uses.
  const callerDoc = await db.collection('users').doc(callerUid).get();
  if (!callerDoc.exists || callerDoc.data().isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Only admins can do this.');
  }

  // Email isn't stored on the Firestore profile itself (kept private
  // in its own subcollection elsewhere in this app) — the Auth record
  // is the reliable source for it. Captured here, before anything is
  // deleted, and written onto the profile doc as a marker field below
  // so cleanupUserDataOnDelete can still read it from the document's
  // final snapshot after everything else is gone.
  let targetEmail = null;
  try {
    const targetAuthRecord = await getAuth().getUser(targetUid);
    targetEmail = targetAuthRecord.email || null;
  } catch (e) {
    // Auth record may already be missing in an edge case — not fatal,
    // the deletedUsers record just won't have an email in that case.
  }

  try {
    await db.collection('users').doc(targetUid).update({
      pendingDeletionBy: 'admin',
      pendingDeletionByName: callerDoc.data().displayName || 'Admin',
      pendingDeletionEmail: targetEmail,
    });
  } catch (e) {
    logger.error(`adminDeleteUser: failed to set deletion marker for ${targetUid}:`, e);
    // Not fatal — proceeds with the deletion regardless. Worst case,
    // the deletedUsers record this produces is missing the "by admin"
    // detail, which cleanupUserDataOnDelete already falls back to
    // 'unknown' for rather than failing outright.
  }

  try {
    // Auth record deleted first — if this fails (e.g. the account was
    // already removed), the Firestore profile is left untouched rather
    // than deleting the profile for a still-existing login.
    await getAuth().deleteUser(targetUid);
  } catch (e) {
    // auth/user-not-found means the Auth record is already gone (or
    // never existed) — safe to continue on and still clean up whatever
    // Firestore data remains, rather than getting stuck unable to
    // finish removing a partially-deleted account.
    if (e.code !== 'auth/user-not-found') {
      logger.error(`adminDeleteUser: failed to delete Auth record for ${targetUid}:`, e);
      throw new HttpsError('internal', 'Could not delete this user\'s login. Please try again.');
    }
  }

  try {
    await db.collection('users').doc(targetUid).delete();
  } catch (e) {
    logger.error(`adminDeleteUser: failed to delete profile doc for ${targetUid}:`, e);
    throw new HttpsError('internal', 'The login was removed, but their profile could not be deleted. Please try again.');
  }

  logger.info(`Admin ${callerUid} deleted user ${targetUid}`);
  return { success: true };
});