// Lightweight keyword screen for marketplace listings.
//
// This is a first line of defence, not a security boundary — someone
// determined to bypass client-side checks could still get a listing
// through (e.g. by intentionally misspelling a word), which is exactly
// why the in-app Report + admin Moderation dashboard (app/moderation.js)
// still matters as the real backstop. This check exists to catch the
// common, non-adversarial case: someone posting an item that's flatly
// not allowed, before it ever goes live.
//
// Keep this list conservative — false positives (blocking legitimate
// posts) create support headaches and erode trust in the app faster
// than a missed listing does. Whole-word matching (not substring
// matching) is what actually delivers on that — a plain .includes()
// check previously matched "meth" inside the completely ordinary word
// "something", silently blocking any post that used it.

const PROHIBITED_TERMS = [
  // Drugs / controlled substances — includes both singular and plural
  // forms of the generic terms, since word-boundary matching treats
  // "drug" and "drugs" as two entirely different words — having only
  // "drugs" in the list let "I am selling drug" through untouched.
  // "weed" deliberately stays singular-only: adding "weeds" would flag
  // completely ordinary gardening posts ("pulling weeds in my garden").
  'drug', 'drugs', 'illegal drugs', 'narcotic', 'narcotics',
  'cocaine', 'crack cocaine', 'heroin', 'meth', 'methamphetamine', 'mdma', 'ecstasy',
  'cannabis', 'marijuana', 'weed', 'ice pipe', 'bong', 'bongs',
  // Prescription / pharmaceuticals — singular forms added for the same
  // reason as "drug" above (e.g. "prescription drug" was previously
  // unmatched even though "prescription drugs" was already listed).
  'prescription drug', 'prescription drugs', 'prescription medication', 'prescription medicine',
  'prescription pill', 'prescription pills', 'xanax', 'valium', 'oxycontin', 'oxycodone', 'codeine',
  // Weapons — "weapon" and "explosive" added as broader generic terms.
  // Deliberately NOT adding bare "gun" or "knife": both match a huge
  // number of completely legitimate marketplace items (nail gun, glue
  // gun, staple gun, kitchen knife, pocket knife, craft knife), and the
  // more specific dangerous variants (handgun, shotgun, switchblade,
  // flick knife) already cover the genuinely prohibited cases without
  // that false-positive risk.
  'firearm', 'firearms', 'handgun', 'handguns', 'pistol', 'pistols', 'rifle', 'rifles',
  'shotgun', 'shotguns', 'ammunition', 'ammo',
  'switchblade', 'switchblades', 'flick knife', 'taser', 'tasers', 'weapon', 'weapons',
  'explosive', 'explosives',
  // Alcohol / tobacco — plural "cigarettes" added since word-boundary
  // matching on "cigarette" alone does not also match its plural form.
  'cigarette', 'cigarettes', 'tobacco', 'vape', 'vapes', 'vaping', 'vape juice', 'nicotine',
  'e-liquid', 'e-liquids',
  // Regulated infant products
  'baby formula', 'infant formula', 'formula milk',
  // Other — "knockoff" added as a safer alternative to bare "fake",
  // which is used in far too many ordinary, non-counterfeit contexts to
  // flag on its own.
  'stolen', 'counterfeit', 'counterfeits', 'replica designer', 'fake designer', 'knockoff', 'knockoffs', 'knock off',
];

// Matches each term as a whole word (or exact multi-word phrase), not as
// a substring buried inside an unrelated word. \b is a word boundary, so
// 'meth' now matches "meth" and "meth?" but not "something" or "method".
// Sorted longest-first so a more specific phrase (e.g. "prescription
// drug") is checked, and reported, before a shorter term it happens to
// contain (e.g. "drug") — doesn't change whether a post gets blocked
// either way, but gives a more accurate/specific reason when an admin
// reviews what got flagged.
const TERM_PATTERNS = [...PROHIBITED_TERMS]
  .sort((a, b) => b.length - a.length)
  .map(term => ({
    term,
    regex: new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  }));

/**
 * Checks marketplace listing text against the prohibited-items list.
 * @param {string} text - combined title + description to screen.
 * @returns {string|null} the matched term if found, otherwise null.
 */
export function findProhibitedTerm(text) {
  if (!text) return null;
  for (const { term, regex } of TERM_PATTERNS) {
    if (regex.test(text)) {
      return term;
    }
  }
  return null;
}

export const PROHIBITED_ITEMS_MESSAGE =
  "This listing can't be posted because it appears to reference an item that's not allowed on My Suburb " +
  '(such as drugs, weapons, alcohol, tobacco, prescription medicine, or infant formula). ' +
  'See our Community Guidelines for the full list of prohibited items. ' +
  "If you believe this is a mistake, please contact us at support@mysuburb.app.";
