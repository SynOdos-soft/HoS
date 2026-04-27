# Changelog

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
