// Server-side mirror of utils/contentModeration.js (client-side, ES module).
// Cloud Functions run on Node/CommonJS, so this list is duplicated rather
// than shared directly. If you update one, update the other — keep them
// in sync manually.
//
// This is the real backstop: unlike the client-side check, this runs on
// every post regardless of what app version, code path, or direct
// Firestore write created it, so it can't be bypassed by tampering with
// the app itself.

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

function findProhibitedTerm(text) {
  if (!text) return null;
  const normalised = text.toLowerCase();
  for (const term of PROHIBITED_TERMS) {
    if (normalised.includes(term)) {
      return term;
    }
  }
  return null;
}

module.exports = { findProhibitedTerm, PROHIBITED_TERMS };