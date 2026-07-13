import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

// Anyone whose heartbeat (lastActive) is more recent than this is
// considered online. Matches the 60s heartbeat interval in AuthContext,
// with enough slack for a missed beat before flipping to offline.
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export default function useOnlineStatus(userId) {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (!userId) { setIsOnline(false); return; }

    let lastActiveMs = null;

    const recompute = () => {
      setIsOnline(!!lastActiveMs && Date.now() - lastActiveMs < ONLINE_WINDOW_MS);
    };

    const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
      const la = snap.data()?.lastActive;
      lastActiveMs = la?.toDate ? la.toDate().getTime() : (la ? new Date(la).getTime() : null);
      recompute();
    }, () => setIsOnline(false));

    // lastActive might not change again before the window expires — this
    // re-checks every 30s so the dot correctly flips off even with no
    // new snapshot event.
    const interval = setInterval(recompute, 30000);

    return () => { unsub(); clearInterval(interval); };
  }, [userId]);

  return isOnline;
}