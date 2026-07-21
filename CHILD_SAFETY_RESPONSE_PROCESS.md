# MySuburb — Child Safety Incident Response Process
**Internal document — not for public distribution. Keep for your own records.**

This document exists so that if CSAM/CSAE content or behaviour is ever
reported on MySuburb, there's a clear, pre-decided process to follow
immediately — rather than figuring it out for the first time under
pressure. This is what backs up the "complies with child safety laws and
reports to authorities" declaration in Google Play's Data Safety /
Child Safety Standards form.

**This is not legal advice.** It's a good-faith operational starting
point based on publicly available guidance from the eSafety Commissioner,
ACCCE, and Google Play. If a real incident occurs, especially anything
beyond a single clear-cut case, it's worth getting an actual lawyer
involved — particularly given mandatory reporting obligations can carry
real legal weight.

---

## If you receive a report or become aware of CSAM/CSAE content

### Step 1 — Do NOT further view, download, screenshot, forward, or share the content
Beyond what's strictly necessary to confirm it needs action. Unnecessary
viewing or distribution — even internally, even "to document it" — can
itself carry legal risk. If a report already tells you clearly what it
is, you often don't need to open it yourself at all.

### Step 2 — Immediately hide it from the platform
Use the existing admin **Moderation** dashboard (`/moderation` in the
app) to mark the reported post as removed. This uses `isRemoved: true`,
which pulls it out of every feed immediately — this is already built
and working.

Do **not** permanently delete the underlying file/document from
Firebase yet (see Step 4) — hiding it from users is different from
destroying the evidence.

### Step 3 — Suspend the account that posted it
Use the admin dashboard's suspend/ban capability (`isSuspended`) on the
user's account immediately, to prevent further activity while you
report and while authorities investigate.

### Step 4 — Preserve what's needed for a report, don't destroy evidence prematurely
Before deleting anything, note down (for your own report, not to share
publicly):
- The post ID / content ID
- The uploader's account ID, display name, and suburb
- Timestamp of the post
- Any account/device metadata Firebase has recorded (IP, sign-up date, etc.)

Authorities may specifically ask you not to delete the underlying file
until they've had a chance to review it — follow their guidance once
you're in contact with them, rather than deleting immediately by default.

### Step 5 — Report it
For an Australia-based app, the two primary channels are:

- **eSafety Commissioner** — for getting the specific content itself
  taken down (works with international takedown networks too, not just
  Australian-hosted content): https://www.esafety.gov.au/report

- **ACCCE (Australian Centre to Counter Child Exploitation)** — for
  reporting exploitation behaviour, grooming, or content where either
  the offender or victim may be in Australia. Run by the Australian
  Federal Police: https://www.accce.gov.au/report

- **NCMEC CyberTipline** (US-based, but accepts and forwards
  international reports, and is the channel most tech platforms use as
  the global clearinghouse): https://report.cybertip.org

If a child appears to be in immediate danger, the guidance from these
agencies is clear: call **000** first, before doing anything else.

### Step 6 — Document what you did
Keep a private record (date, what was reported, what action you took,
which authority you reported to, and any reference/case number they
give you). This is what actually demonstrates compliance if it's ever
asked about — not just the self-certification checkbox itself.

---

## Who this applies to (designated contact)
**Prakash Boyapalli**, via mysuburb25@gmail.com — this is the contact
registered against the Child Safety Standards declaration in Play
Console, and should be monitored regularly while the app has any active
users.

## Review
Revisit this document if: the app grows significantly, you bring on a
co-founder or moderator, or Google/eSafety/ACCCE guidance changes.
