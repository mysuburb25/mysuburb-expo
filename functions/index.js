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