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
// a substring buried inside an unrelated word — a plain .includes('meth')
// check was matching the "meth" inside "something", silently hiding any
// post that used that completely ordinary word. \b is a word boundary,
// so 'meth' now matches "meth" and "meth?" but not "something" or
// "method". Terms with spaces (like 'ice pipe') still match as an exact
// phrase, since \b anchors both ends of the whole term either way.
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
