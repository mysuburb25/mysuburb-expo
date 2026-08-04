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
  'prescription drugs', 'prescription medication', 'prescription medicine', 'prescription pills', 'xanax', 'valium', 'oxycontin', 'oxycodone', 'codeine',
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

// Matches each term as a whole word (or exact multi-word phrase), not as
// a substring buried inside an unrelated word — a plain .includes('meth')
// check was matching the "meth" inside "something", silently hiding any
// post that used that completely ordinary word. \b is a word boundary,
// so 'meth' now matches "meth" and "meth?" but not "something" or
// "method". Terms with spaces (like 'ice pipe') still match as an exact
// phrase, since \b anchors both ends of the whole term either way.
const TERM_PATTERNS = PROHIBITED_TERMS.map(term => ({
  term,
  regex: new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
}));

function findProhibitedTerm(text) {
  if (!text) return null;
  for (const { term, regex } of TERM_PATTERNS) {
    if (regex.test(text)) {
      return term;
    }
  }
  return null;
}

module.exports = { findProhibitedTerm, PROHIBITED_TERMS };