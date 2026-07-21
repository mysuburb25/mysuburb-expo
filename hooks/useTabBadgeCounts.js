import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../config/firebase';

// Mirrors the exact category filter each tab's own feed query uses (see
// app/(tabs)/index.js, buy-sell.js, services.js, lost-found.js,
// events.js) — kept in sync manually since count queries need the same
// filters as the real feed to give an accurate number.
const CATEGORY_FILTERS = {
  home: ['updates', 'notices', 'safety'],
  events: 'events',
  marketplace: 'marketplace',
  services: 'services',
  lostfound: 'lostfound',
};

/**
 * Returns { home, events, marketplace, services, lostfound } — the count
 * of new posts in each category since the user's last visit to that tab
 * (profile.lastVisited.<key>, already tracked by each tab for the
 * per-post "NEW" badge — this reuses the same data rather than adding a
 * new field). Summed across every active suburb, matching how the feeds
 * themselves combine multiple suburbs.
 *
 * A tab never visited yet shows 0, not "everything that ever existed" —
 * there's no meaningful "since last visit" baseline for a first visit.
 */
export default function useTabBadgeCounts(user, profile) {
  const [counts, setCounts] = useState({});

  const refresh = useCallback(async () => {
    if (!user || !profile?.suburb) return;
    const activeSuburbs = profile?.suburbs
      ? profile.suburbs.filter(s => s.active).map(s => ({ suburb: s.suburb, state: s.state }))
      : [{ suburb: profile.suburb, state: profile.state }];
    if (activeSuburbs.length === 0) return;

    const results = {};
    await Promise.all(Object.entries(CATEGORY_FILTERS).map(async ([key, catFilter]) => {
      const lastVisited = profile?.lastVisited?.[key];
      if (!lastVisited) { results[key] = 0; return; }
      const cutoff = lastVisited.toDate ? lastVisited.toDate() : new Date(lastVisited);

      const perSuburbCounts = await Promise.all(activeSuburbs.map(async ({ suburb, state }) => {
        try {
          const catConstraint = Array.isArray(catFilter)
            ? where('category', 'in', catFilter)
            : where('category', '==', catFilter);
          const q = query(
            collection(db, 'posts'),
            where('suburb', '==', suburb),
            where('state', '==', state),
            catConstraint,
            where('isRemoved', '==', false),
            where('createdAt', '>', cutoff),
          );
          const snap = await getCountFromServer(q);
          return snap.data().count;
        } catch (e) {
          console.error(`Tab badge count failed for ${key} in ${suburb}:`, e);
          return 0;
        }
      }));
      results[key] = perSuburbCounts.reduce((a, b) => a + b, 0);
    }));
    setCounts(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile?.suburb, profile?.state, JSON.stringify(profile?.suburbs), JSON.stringify(profile?.lastVisited)]);

  useEffect(() => { refresh(); }, [refresh]);

  return counts;
}
