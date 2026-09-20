# SynOdos HOS — Future Roadmap

Ideas worth building, ordered by theme and rough priority. Everything here builds on
what exists today: weekly log grid, roadside inspection view, audit trail with reason
codes, auto-locking, PDF exports, encrypted Google Drive sync, saved vehicles and
operator companies, presets.

_Last updated: 2026-09-20 (v0.21.0)_

---

## 🎯 Near-term (high value, small effort)

- **HOS violation coach** — live warnings while filling the grid: 13h driving / 14h
  window / 70h-in-7-days / 120h-in-14-days Ontario cycle counters, shown in the
  totals footer before "Finish Day". Partially exists as limit warnings; make it a
  proactive rules engine with plain-language explanations.
- **Cycle bank on the Dashboard** — "hours remaining this cycle" card that counts
  actual logged hours across saved logs, not just the current week.
- **Last-used everything** — new weeks already inherit the last CMV plate; extend to
  last operator company, cycle, and co-driver so a returning driver taps zero fields.
- **Recap hours calculator** — "if I take tomorrow off, how much comes back?"
  (70/8 rule projection drivers ask for constantly).
- **Keyboard support for the grid & dropdowns** — arrow-key duty status entry,
  Enter/Escape in autocompletes, Escape-to-close + focus trap on the side menu
  (focus can currently tab behind the open menu).
- **CHANGELOG.md generated from the in-app VERSIONS array** so repo docs, GitHub
  releases, and the Version tab never drift.

## 🚛 Compliance depth (the moat)

- **Deferral day (Ontario §78)** — mark one off-day per week as deferred, track the
  24h owed, warn when it must be repaid.
- **Split sleeper berth** — proper 8/2 split math for sleeper-berth pairs; currently
  the app tracks sleeper hours but doesn't compute split exemptions.
- **Simplified inspection handoff** — roadside PDF plus a QR code on screen that
  opens the 15-day report on a phone for the officer; "officer mode" with large
  type and no editing.
- **Document wallet** — per-vehicle insurance, registration, and annual inspection
  certificate photos (camera capture), shown in Inspection view next to the plate.
- **Odometer-driven maintenance nudges** — we already track sequential odometers and
  inspection month; warn "annual inspection due next month" or "oil change ~5,000 km".
- **DVIR (pre/post-trip)** — quick defect checklist per vehicle per day, exportable
  with the weekly PDF.
- **Full audit-grade export** — zip containing weekly PDFs + roadside PDF + CSV of
  the forensic audit trail, formatted for WSIB/MTO review.

## 📊 Driver value

- **Analytics dashboard** — hours-by-week trends, average daily driving, most-used
  vehicle, distance totals; answers "am I pacing toward my cycle limit?".
- **Search across all logs** — find the day you drove plate X, or the week with a
  specific remark.
- **CSV/Excel export** — for drivers who bill by the trip or hand data to an accountant.
- **Smart presets** — suggest a preset when a week's pattern repeats twice.
- **PDF bundles** — export a whole month as one paginated document.
- **Fuel/expense capture per trip** — optional; pairs naturally with odometer data.

## 🏢 Fleet & company (big bets)

- **Company accounts** — an Operator Company can have drivers; dispatcher sees all
  logs, compliance status, and missing days. This turns the saved-companies feature
  into the seed of a fleet product.
- **Compliance report per company** — flag days with edits after lock, missing
  remarks, odometer gaps. Exportable for safety officers.
- **Multi-device sync conflict resolution** — Google Drive sync currently overwrites;
  add per-log merge with a conflict picker when two devices edited the same week.
- **Team templates** — companies push default cycles, terminals, and vehicle lists
  to their drivers.

## 🧱 Technical foundation

- **Automated tests** — zero today. Priority targets: HOS math (pure functions),
  storage migrations, PDF generation smoke tests, and a11y checks (axe) wired into
  CI. The grid math is the scariest code to regress.
- **TypeScript strictness** — remove the two `as any` casts and legacy `any` props
  (Header props, installPrompt); enable `noUncheckedIndexedAccess` for storage code.
- **Extract `useScrollLock`** — the scroll-pin pattern in Header should become a
  shared hook before the next overlay copies it (previously caused the layout-shift
  and menu-jump bugs).
- **Storage migrations framework** — versioned preferences/log schema with purge of
  retired keys (default operator/plate fields still linger in storage).
- **PWA update flow** — detect new service worker and offer "Update to vX.Y.Z"
  instead of serving stale assets until tabs are closed.
- **Performance** — virtualize the 15-day inspection grid and lazy-load the PDF
  library (biggest bundles today).

---

## Prioritization rule of thumb

1. Anything that prevents a **fine or failed inspection** wins (compliance depth).
2. Anything that removes **daily taps** for the driver second (near-term UX).
3. Fleet features only after sync conflict-handling is solid — fleets multiply the
   blast radius of data loss.
