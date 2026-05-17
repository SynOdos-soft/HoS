# Changelog

## [0.9.9] - 2026-05-17
### Added
- **Inspection UI Enhancements**: Added a collapsible "Show Details" area in the Inspection View to house remarks, odometer, and vehicle metadata.
- **Cycle Indicator**: Added a tappable "Cycle" pill (C1/C2) right-aligned to the date in the Inspection View that opens a popover explaining cycle constraints.
- **Integrated UX**: Consolidated the mini-totals directly into the "Verbose Log Details" expansion button to save vertical space.
- **Visual Clarity**: Highlighted the current day's card with a distinct blue border instead of a static pill.

### Fixed
- **Popover Positioning**: Prevented the Cycle popover from bleeding off the edge of the screen by anchoring it to the right.
- **Menu Clutter**: Streamlined the global navigation menu by removing obsolete options (Create New Week) and standardizing button styling.

## [0.9.8] - 2026-05-16
### Added
- **Calendar Configuration**: Introduced a global setting to toggle the start of the week between Sunday and Monday.
- **Localized Date Logic**: Updated all calculation paths to respect the user-defined week boundaries for dashboard filtering and log indexing.

## [0.9.7] - 2026-05-16
### Added
- **Dashboard Optimization**: Overhauled week cards with improved action hierarchy and moved Delete to header.
- **Safety Deletion**: Implemented 2-step deletion with 1s loading delay and 5s auto-reset timeout.
- **Unified Compliance Modal**: Combined justification for edits and navigation-safety alerts into one high-fidelity modal.
- **Custom Unlock Modal**: Replaced browser alerts with custom regulatory warning modals for historical logs.
- **UI Refinement**: Switched all compliance modals to a professional neutral palette.

## [0.9.6] - 2026-05-14
### Added
- **Roadside Inspection Mode**: A dedicated 15-day compliance view for rapid regulatory review.
- **Graphical LogGrid**: High-fidelity, PDF-style duty status graph with continuous lines, hour labels, and minute ticks (:15, :30, :45).
- **Forensic Audit Trail**: Comprehensive modification log capturing field-level diffs and justifications for all historical edits.
- **Live Time Marker**: Red vertical indicator on the graphical log showing the exact current time.

### Improved
- **Mobile UI**: Overhauled the inspection cards and grid for a perfect fit on small screens with no horizontal overflow.
- **Sticky Labels**: Implemented a persistent sidebar for duty status labels during horizontal grid scrolling.
- **Visual Polish**: Added premium "TODAY" pill badges, status-specific icons for totals, and structured metadata boxes.
- **Distance Tracking**: Automatically calculates and displays total KM (odometer difference) in the daily totals row.

### Fixed
- Fixed horizontal scrolling physics for the graphical log and audit table on mobile devices.
- Resolved layout bleeding issues on narrow viewports by enforcing strict container constraints.

## [0.4.0] - 2026-04-26
### Added
- Vertical layout for the logging grid on mobile devices to save space.
- Start and End Odometer readings for each individual day.
- Language selection in Preferences (English and French).
- Copyright footer.
### Changed
- Full month name and year are now displayed in the date headers (e.g., April instead of Apr).
- When the Sleeper option is disabled, it is now correctly removed from the toolbar and time counters.
### Fixed
- Fixed an issue where "Finish Day" (lock) didn't consistently prevent all interactions.
## [0.3.0] - 2026-04-26
### Added
- Preferences menu to customize the application.
- 12AM/PM and 24H mode toggle for the timeline grid.
- Dark and Light mode themes.
- Toggles to hide/show specific fields: Co-Drivers, Trailer Plate, Exempt Hrs, and Sleeper row.
- "Stacked" weekly view option to show all days below each other instead of tabs.
- Option to enable/disable auto-save.
- "Finish the day" option to lock a day and prevent further edits.
- "Preset" feature allowing users to save a day's grid as a template and copy it to other days.
- Better calendar week selection logic (pick any date and it automatically snaps to that week's Monday).

## [0.2.0] - 2026-04-25
### Changed
- Refactored core system to use `WeeklyLog` instead of `DayLog`.
- Updated metadata schema to match the official Ontario HOS weekly log export precisely.
- Overhauled PDF export to render all 7 days of the week sequentially on an A4 layout.

## [0.1.0] - 2026-04-25
### Added
- Initial standalone offline-first PWA for Ontario Hours of Service.
- Interactive drag-and-paint timeline grid with 15-minute granularity.
- Base Daily metadata form.
- Initial PDF generation capability.
