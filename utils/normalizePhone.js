// Turns any reasonable way someone might type an Australian mobile number
// into one canonical digit string, so the same real phone number always
// produces the exact same "fake email" account identifier — regardless of
// whether they typed "0412 345 678", "+61412345678", "61412345678", or
// "412345678". Without this, signup and login could each independently
// strip non-digits and land on a DIFFERENT string for the same phone
// number, silently creating a second account or making an existing one
// unreachable — the root cause of testers being asked to sign up again.
//
// Returns null if the result isn't a plausible 9-digit Australian mobile
// number (after removing a leading 0 or country code), so callers can
// show a clear validation error instead of silently accepting garbage.
export function normalizeAuPhone(input) {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');

  // Strip a leading country code, however it was entered — "+61...",
  // "61...", or "0061...".
  if (digits.startsWith('0061')) digits = digits.slice(4);
  else if (digits.startsWith('61') && digits.length > 9) digits = digits.slice(2);

  // Strip a single leading trunk '0' (the "0412 345 678" style).
  if (digits.startsWith('0') && digits.length === 10) digits = digits.slice(1);

  // A valid Australian mobile, in canonical form, is exactly 9 digits
  // starting with 4 (e.g. "412345678").
  if (digits.length !== 9 || !digits.startsWith('4')) return null;

  return digits;
}

// The fake-email identifier used for phone-based accounts — built from
// the canonical digit string so it's always identical for the same real
// phone number, no matter how it was typed at signup vs. later at login.
export function phoneToFakeEmail(input) {
  const normalized = normalizeAuPhone(input);
  if (!normalized) return null;
  return `${normalized}@mysuburb.app`;
}
