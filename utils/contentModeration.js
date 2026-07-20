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
// than a missed listing does. Err toward whole-word matches over
// aggressive substring matches.

const PROHIBITED_TERMS = [
  // Drugs / controlled substances
  'cocaine', 'heroin', 'meth', 'methamphetamine', 'mdma', 'ecstasy',
  'cannabis', 'marijuana', 'weed', 'ice pipe', 'bong',
  // Prescription / pharmaceuticals
  'prescription', 'xanax', 'valium', 'oxycontin', 'oxycodone', 'codeine',
  // Weapons
  'firearm', 'handgun', 'pistol', 'rifle', 'shotgun', 'ammunition', 'ammo',
  'switchblade', 'flick knife', 'taser',
  // Alcohol / tobacco
  'cigarette', 'vape juice', 'nicotine', 'e-liquid',
  // Regulated infant products
  'baby formula', 'infant formula', 'formula milk',
  // Other
  'stolen', 'counterfeit', 'replica designer', 'fake designer',
];

/**
 * Checks marketplace listing text against the prohibited-items list.
 * @param {string} text - combined title + description to screen.
 * @returns {string|null} the matched term if found, otherwise null.
 */
export function findProhibitedTerm(text) {
  if (!text) return null;
  const normalised = text.toLowerCase();
  for (const term of PROHIBITED_TERMS) {
    if (normalised.includes(term)) {
      return term;
    }
  }
  return null;
}

export const PROHIBITED_ITEMS_MESSAGE =
  "This listing can't be posted because it appears to reference an item that's not allowed on My Suburb " +
  '(such as drugs, weapons, alcohol, tobacco, prescription medicine, or infant formula). ' +
  'See our Community Guidelines for the full list of prohibited items. ' +
  "If you believe this is a mistake, please contact us at community@mysuburb.com.au.";