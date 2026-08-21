const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');
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

// Server-side backstop for prohibited-item screening. The client already
// blocks obvious cases in app/create-post.js before a post is ever
// submitted, but that check can be bypassed by anyone writing to
// Firestore directly (an old app version, a modified build, or a raw API
// call) — this trigger runs on EVERY new post regardless of how it was
// created, so it can't be skipped that way.
//
// On a match, this does NOT delete the post outright. It hides it from
// normal feeds (isRemoved: true) and files an auto-flagged entry in the
// same `reports` collection the Moderation dashboard already reads from
// (see app/moderation.js), so a human still makes the final call. This
// avoids permanently losing content or banning someone over a false
// positive (e.g. "I'm not a smoker, this stolen base looks amazing" for
// a rug's "stolen valuables" vibe — deliberately far-fetched, but the
// point is: keyword matches aren't proof of intent).
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

// Sends a one-time welcome message to every new user, appearing to come
// from the existing admin account (mysuburb.admin@gmail.com), shown as
// "MySuburb". This writes the exact same conversations/messages shape
// the client's own sendMessage function writes in app/chat/[userId].js
// (same field names, same conversationId convention), so the result is
// indistinguishable from a real message sent through the app — it shows
// up in the Messages tab, increments the unread counter, and triggers
// a push notification via the sendPushOnNotification trigger above,
// purely because it's also writing a matching `notifications` doc.
//
// Triggers on the user's OWN profile document being created (not a Auth
// trigger) — this fires at the same point the client finishes writing
// the signup profile, which is what the existing sendPushOnNotification
// and screenNewPost triggers both already do for their own collections,
// so this follows the same established pattern in this file.
const ADMIN_UID = 'ENNHw4XclOMcjiRkjH8eIXQdV223';
const ADMIN_NAME = 'MySuburb';

const WELCOME_MESSAGE = `Welcome to MySuburb!

Thanks for signing up and joining our community.

Please explore the app, choose the suburbs you care about, and stay connected with local updates, events, notices, Buy & Sell, Lost & Found and Services.

Please share it with your friends and help us grow our local community.

📱 iOS: https://apps.apple.com/au/app/mysuburb-community/id6791455586

🤖 Android: https://play.google.com/store/apps/details?id=com.mysuburb.app

Thanks,
MySuburb`;

exports.sendWelcomeMessage = onDocumentCreated('users/{userId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const newUserId = event.params.userId;

  // Guards against ever messaging the admin account itself, in case this
  // trigger somehow runs for the admin's own profile document.
  if (newUserId === ADMIN_UID) return;

  const userData = snap.data();
  const newUserName = userData.displayName || 'Neighbour';
  const newUserPhoto = userData.photoURL || null;

  // Same sorted-pair convention the client uses for conversation IDs, so
  // this lands in the exact same thread the person would see if they
  // opened a chat with this account through the app themselves — not a
  // separate, duplicate conversation.
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

    // Piggybacks on the existing sendPushOnNotification trigger above —
    // writing this doc is what actually fires the push notification,
    // exactly the same way a real chat message already does.
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

// ---------------------------------------------------------------------
// ONE-TIME BACKFILL — sendWelcomeMessage above only fires for NEW
// signups going forward (onDocumentCreated never fires for documents
// that already existed before the function was deployed). This sends
// the same welcome message to every EXISTING user.
//
// Meant to be triggered once, manually, by visiting its URL after
// deploying — then safe to delete this function afterward (or just
// leave it; the completion guard below means re-visiting the URL by
// accident does nothing harmful, since anyone already messaged gets
// skipped rather than messaged twice).
//
// HTTPS functions are publicly reachable by default, so BACKFILL_KEY
// is a basic safeguard against a random visitor triggering it — not
// real security, just enough friction for a short-lived admin task.
// Change this value before deploying, and don't share the URL.
const { onRequest } = require('firebase-functions/v2/https');
const BACKFILL_KEY = 'change-this-before-deploying';

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

      // Skips anyone who already has this conversation — covers both a
      // second accidental run of this same backfill, AND anyone who
      // signed up after sendWelcomeMessage went live and already got
      // the message that way.
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