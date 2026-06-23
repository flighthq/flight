# New Package Spec: @flighthq/calendar

**Represents:** Calendar and events integration — enumerate calendars, read/query/create/update/delete events and reminders (alarms), over a swappable host backend (web ICS/CalDAV-less default, native EventKit/Android-Calendar/Electron host, Rust crate).

**Requested by:** application-platform

## Fits

- **Architecture slot:** a command-style platform capability with a `*Backend` seam, exactly like `geolocation`/`notification`/`dialog`/`clipboard`. A web default backend is always lazily available; native hosts swap it via `setCalendarBackend`. The application-platform breadth review names `@flighthq/calendar` directly (alongside `contacts`) as a "common mobile-app integration not yet represented … reasonable as future cells given the suite's ambitions."
- **Permission-gated, like `geolocation`/`notification`/`webcam`.** Calendar access requires an OS permission grant. The package exposes its own `getCalendarPermission`/`requestCalendarPermission` returning a plain `PermissionState`, mirroring how `notification` and `geolocation` handle permission today. (If the reviewed `@flighthq/permission` unification ships, calendar's permission funcs become thin re-exports over it — designed so that swap is non-breaking.)
- **Dependencies:** `@flighthq/types` (header layer — all shapes defined here first), `@flighthq/signals` (opt-in change-notification group via `enableCalendarSignals`). No dependency on `app`, `application`, `media`, or any renderer; the dependency arrow points the other way (an app consumes calendar, not vice versa). Calendar entities are plain data, so the value seam is a near-zero-copy mixable leaf for the Rust port (read/build event records as flat records).
- **Neighbor packages:** `@flighthq/calendar-formats` for the importers/parsers that are _not_ the live host bridge — iCalendar (RFC 5545 `.ics`) parse/serialize, RRULE expansion, VTIMEZONE handling, vCalendar — following the `-formats` convention. The web backend leans on `calendar-formats` for `.ics` import/export since browsers have no live calendar API; native backends do not need it (they talk to EventKit/ContentProvider directly).
- **Backend seam:** `CalendarBackend` in `@flighthq/types`; `getCalendarBackend()`, `setCalendarBackend(backend | null)`, `createWebCalendarBackend()`. The web backend is a deliberately thin, capability-guarded fill: live OS calendar access is unavailable in the browser, so it returns sentinels (`null`/`[]`/`false`/`''`) for live reads/writes and instead provides `.ics` import/export and a local in-memory/`storage`-backed event store as the only web-realizable surface.
- **Rust crate:** `flighthq-calendar` (native-first; EventKit/Android via host, `flighthq-calendar-formats` for the rustybuzz-style pure-parse sibling using an iCalendar parser). 1:1 conformance against the TS package on the value-typed event/record round-trips; the live backend is host-coupled and validated per host, not in the headless conformance instrument.

## Bronze

The minimum viable: list calendars, query events in a time window, create/delete a basic event, and permission. This is the 20% that delivers 80% — "show my events" and "add an event."

Types in `@flighthq/types` first (`Calendar.ts`):

- `CalendarPermissionState` — `'granted' | 'denied' | 'prompt' | 'restricted'` (open string union; bare names reserved, vendor-prefixed for custom).
- `CalendarEntityKind` string ids — `EventCalendarKind`, `ReminderCalendarKind` (a calendar holds either events or reminders; EventKit splits these).
- `CalendarAccount` — plain record: `id`, `title`, `kind` (`CalendarEntityKind`), `color` (packed RGBA int per Flight color convention), `isWritable`, `isPrimary`, `sourceName` (e.g. "iCloud", "Google").
- `CalendarEvent` — plain entity record: `id` (sentinel `''` for not-yet-saved), `calendarId`, `title`, `notes`, `location`, `startTimestamp`, `endTimestamp` (epoch ms, UTC), `isAllDay`, `timeZone` (IANA string, `''` = floating/local).
- `CalendarEventQuery` — plain record: `startTimestamp`, `endTimestamp`, `calendarIds` (`readonly string[]`, empty = all), `expandRecurring` (boolean — return occurrence instances vs master events).
- `CalendarBackend` — the live seam, all returning Promises with sentinel results:
  - `getPermission(): Promise<CalendarPermissionState>`, `requestPermission(): Promise<CalendarPermissionState>`
  - `getCalendars(kind): Promise<readonly CalendarAccount[]>` (`[]` when unavailable/denied)
  - `queryEvents(query): Promise<readonly CalendarEvent[]>`
  - `getEvent(id): Promise<CalendarEvent | null>`
  - `saveEvent(event): Promise<string>` (returns the assigned id, `''` on failure)
  - `deleteEvent(id): Promise<boolean>`

Functions in `@flighthq/calendar`:

- `createCalendarEvent(calendarId): CalendarEvent`, `createCalendarEventQuery(startTimestamp, endTimestamp): CalendarEventQuery` — explicit allocation, zeroed/defaulted.
- `getCalendarPermission(): Promise<CalendarPermissionState>`, `requestCalendarPermission(): Promise<CalendarPermissionState>`.
- `getCalendarAccounts(kind?): Promise<readonly CalendarAccount[]>` (defaults to `EventCalendarKind`).
- `queryCalendarEvents(query): Promise<readonly CalendarEvent[]>` — the core read.
- `getCalendarEvent(id): Promise<CalendarEvent | null>` — sentinel `null` on miss.
- `saveCalendarEvent(event): Promise<string>` — create when `id === ''`, update otherwise; returns id, `''` on failure.
- `deleteCalendarEvent(id): Promise<boolean>`.
- Backend seam: `getCalendarBackend()`, `setCalendarBackend(backend | null)`, `createWebCalendarBackend()` (guards every API; live reads/writes return sentinels; `.ics` import/export and a local store are the only real web surface — see Boundaries).
- `isCalendarAccountWritable(account): boolean` — cheap guard before a write attempt.

## Silver

Competitive and solid: matches a well-regarded calendar-integration library (EventKit / `expo-calendar` / `react-native-calendar-events` tier). Recurrence, reminders/alarms, attendees, availability, and update semantics.

Types (`@flighthq/types`):

- `CalendarRecurrenceFrequency` — `'daily' | 'weekly' | 'monthly' | 'yearly'`.
- `CalendarRecurrenceRule` — plain record mirroring RFC 5545 RRULE: `frequency`, `interval`, `count` (`-1` = unbounded), `untilTimestamp` (`-1` = none), `byWeekday` (`readonly CalendarWeekday[]`), `byMonthDay`, `byMonth`, `bySetPosition`, `weekStart`.
- `CalendarWeekday` — `'MO' | 'TU' | ... | 'SU'` plus optional ordinal (e.g. 2nd Tuesday) via `CalendarOrdinalWeekday` record.
- `CalendarAlarm` — plain record (the "reminder"): `relativeOffsetMs` (negative = before start; `-1` sentinel unused, offset is signed), `absoluteTimestamp` (`-1` = relative), `kind` (`CalendarAlarmKind`: `DisplayAlarmKind`, `AudioAlarmKind`, `EmailAlarmKind`).
- `CalendarAttendee` — plain record: `name`, `email`, `role` (`'required' | 'optional' | 'chair'`), `status` (`'accepted' | 'declined' | 'tentative' | 'pending'`), `isOrganizer`.
- `CalendarAvailability` — `'busy' | 'free' | 'tentative' | 'unavailable'`.
- `CalendarReminder` — plain entity record (distinct from `CalendarEvent`; the EventKit reminder/to-do): `id`, `calendarId`, `title`, `notes`, `dueTimestamp` (`-1` = none), `isCompleted`, `completedTimestamp`, `priority`, `alarms`.
- `CalendarSpan` — `'thisEvent' | 'futureEvents'` for recurring-edit/delete scope.
- Extend `CalendarEvent` with: `url`, `recurrence` (`CalendarRecurrenceRule | null`), `alarms` (`readonly CalendarAlarm[]`), `attendees` (`readonly CalendarAttendee[]`), `availability`, `status` (`'confirmed' | 'tentative' | 'cancelled'`), `isDetached` (a modified occurrence), `originalStartTimestamp` (for occurrences).
- Extend `CalendarBackend` with reminder CRUD, span-scoped save/delete, and account creation.

Functions:

- Recurrence: `createCalendarRecurrenceRule(frequency): CalendarRecurrenceRule`; `expandCalendarRecurrence(event, rangeStart, rangeEnd, out): number` (writes occurrence instances into a reusable `out` array, returns count — hot-path-safe, no per-call allocation). Delegates RRULE math to `calendar-formats`.
- Alarms: `createCalendarAlarm(relativeOffsetMs): CalendarAlarm`, `addCalendarEventAlarm(event, alarm)`, `removeCalendarEventAlarm(event, index)`.
- Attendees: `createCalendarAttendee(email): CalendarAttendee`, `addCalendarEventAttendee`, `removeCalendarEventAttendee`.
- Reminders: `createCalendarReminder(calendarId)`, `getCalendarReminders(query)`, `getCalendarReminder(id)`, `saveCalendarReminder`, `deleteCalendarReminder`, `setCalendarReminderCompleted(id, completed)`.
- Span-scoped recurring edits: `saveCalendarEventWithSpan(event, span)`, `deleteCalendarEventWithSpan(id, span)`.
- Account management: `createCalendarAccount(title, kind)` (where the host allows), `getCalendarAccount(id)`, `getDefaultCalendarAccount(kind)`.
- Availability/free-busy read: `getCalendarFreeBusy(query): Promise<readonly CalendarFreeBusySlot[]>`.
- Change notifications (opt-in, per the signal rule): `enableCalendarSignals()` enabling a `CalendarSignals` group — `onCalendarStoreChanged()` (the OS fired an external change), `onCalendarPermissionChanged(state)`. Inert until enabled; backend `subscribeChange` drives it.
- Cross-backend consistency contract: documented timestamp/timezone normalization (always epoch-ms UTC at the seam; `timeZone` carried separately), all-day-event boundary semantics, and id-stability rules identical across web-ics/native/Rust.

## Gold

Authoritative / AAA: the canonical calendar cell. Exhaustive recurrence, full iCalendar fidelity, batch ops, performance, error taxonomy, tests, docs, 1:1 Rust parity.

Types (`@flighthq/types`):

- Full RFC 5545 RRULE surface: `byHour`, `byMinute`, `bySecond`, `byYearDay`, `byWeekNo`, `EXDATE`/`RDATE` (`CalendarRecurrenceException` records: excluded and extra dates) on `CalendarEvent`.
- `CalendarTimeZone` descriptor + VTIMEZONE round-trip fidelity (DST transition rules), so floating, UTC, and zoned events serialize without drift.
- `CalendarStructuredLocation` — geo (lat/long packed as `GeoPosition`-compatible), radius, title (EventKit structured locations / geofenced alarms).
- `CalendarAlarm` geofence trigger (`proximity: 'enter' | 'leave'`, `StructuredLocation`) — location-based reminders.
- `CalendarBatch` — plain descriptor of queued create/update/delete ops for atomic commit; `CalendarError` plain-data result kind (`kind`: `'permission' | 'notFound' | 'readOnly' | 'conflict' | 'unsupported'`, `message`) — returned/attached, not thrown (sentinel rule; throw only on API misuse).
- `CalendarConflictPolicy` — `'overwrite' | 'skip' | 'fail'` for save races.
- `CalendarInvitationResponse` / iTIP method kinds (`RequestInvitationKind`, `ReplyInvitationKind`, `CancelInvitationKind`) for meeting-invite flows.

Functions:

- Batch ops: `createCalendarBatch()`, `addCalendarBatchSave(batch, event)`, `addCalendarBatchDelete(batch, id)`, `commitCalendarBatch(batch): Promise<CalendarBatchResult>` — fewer host round-trips, atomic where the backend supports it.
- Exhaustive recurrence engine in `calendar-formats`: `expandCalendarRecurrence` honoring all BY\* rules, `EXDATE`/`RDATE`, `WKST`, and `bySetPosition`; `getNextCalendarOccurrence(event, afterTimestamp, out): boolean`; `countCalendarOccurrences(event, rangeStart, rangeEnd)`.
- Full iCalendar I/O (in `calendar-formats`, re-exported convenience): `parseICalendar(text): readonly CalendarEvent[]`, `serializeICalendar(events): string`, `parseICalendarReminders`, VTIMEZONE/VALARM/VTODO support, line-folding and escaping per RFC 5545.
- Invitations: `applyCalendarInvitationResponse(event, response)`, `parseCalendarInvitation(icsText)` — accept/decline/tentative flows over iTIP.
- Free/busy + scheduling helpers: `findCalendarFreeSlots(query, durationMs, out): number`, `isCalendarTimeRangeBusy(query): Promise<boolean>`.
- Performance: `out`-parameter occurrence expansion throughout, paged/streamed `queryCalendarEvents` for large windows, and a documented query-window cap with cursor continuation.
- Full error taxonomy mapped 1:1 across backends; `isCalendarErrorRetryable(error)`; documented divergence map entries where web (`.ics` only) cannot realize live ops.
- Host backends realized and validated: native EventKit (`host-capacitor`/iOS), Android CalendarContract (`host-capacitor`), Electron (no native calendar — falls back to `.ics`/CalDAV add-on, documented), each registered via the seam.
- Exhaustive colocated tests (one `*.test.ts` per source, alias-safe `out` cases), recurrence-expansion fixtures against the RFC 5545 test corpus, functional/integration coverage for the public import path, and a `flighthq-calendar` + `flighthq-calendar-formats` Rust crate passing conformance cells for value-typed event/recurrence round-trips. Benchmarks for large-window recurrence expansion.

## Boundaries

- **Live OS calendar access in the browser stays out** — browsers expose no calendar API. The web backend's only real surface is `.ics` import/export (via `calendar-formats`) plus an optional local store over `@flighthq/storage`; live `queryEvents`/`saveEvent` return sentinels. This is documented, not silently degraded.
- **iCalendar parsing/serialization and RRULE expansion live in `@flighthq/calendar-formats`**, re-exported as convenience but importable in isolation, per the `-formats` neighbor pattern. The live host bridge does not pull the parser into bundles that only do native CRUD.
- **CalDAV / Google Calendar / Exchange network sync stays out of the core cell.** Those are transport+protocol concerns that belong on top of `@flighthq/net` (a separate maturation item) as a future `@flighthq/calendar-caldav` neighbor or a host backend — not baked into the platform seam.
- **Contacts/attendee directory lookup stays in a sibling `@flighthq/contacts`** (the review's paired request). Calendar carries attendees as plain records (name/email); resolving them to contact entities is a contacts concern.
- **General OS notifications stay in `@flighthq/notification`.** Calendar `CalendarAlarm`s are _event alarms_ owned by the calendar store (fired by the OS calendar), distinct from app-fired notifications. The two cells do not depend on each other.
- **Geolocation stays in `@flighthq/geolocation`.** Geofenced alarms reference a `GeoPosition`-compatible location record but do not import the geolocation runtime; the type alignment lives in `@flighthq/types`.
- **No global ambient store / no module-top-level state.** All access flows through the swappable backend; the package stays `"sideEffects": false` with a single root `.` export and lazy web-default creation (like `geolocation`).

## Open design questions

- **Web backend scope — `.ics` only, or also CalDAV-over-`net`?** Lean: web default is `.ics` import/export + optional `storage`-backed local store; CalDAV is a separate neighbor/backend to avoid pulling a sync protocol into every consumer. Confirm CalDAV is out of the core web fill.
- **Events vs reminders: one backend or split entities?** EventKit splits `EKEvent`/`EKReminder`; Android merges to a degree. This spec keeps `CalendarEvent` and `CalendarReminder` as distinct entity records sharing `CalendarAccount`/`CalendarAlarm`. Confirm the split rather than a unified `CalendarItem` with a kind discriminator.
- **Recurrence representation at the seam — master + RRULE, or pre-expanded occurrences?** `CalendarEventQuery.expandRecurring` lets the caller choose; the backend may not support expansion natively (then `calendar-formats` expands client-side). Confirm where expansion is guaranteed vs delegated, and the `isDetached`/`originalStartTimestamp` occurrence-identity contract.
- **Timezone model.** Spec uses epoch-ms UTC at the seam with a separate IANA `timeZone` string and `''` for floating/local. Confirm this over a wall-clock-string model, given DST and all-day-event boundary subtleties differ per host.
- **Permission funcs now vs deferring to `@flighthq/permission`.** Calendar ships its own `getCalendarPermission`/`requestCalendarPermission` (like `geolocation` today). If the reviewed unified `permission` cell lands, do these become re-exports, or does calendar drop them? Decide the migration shape before building.
- **Id stability across hosts.** EventKit ids, Android `_id` rows, and `.ics` `UID`s differ in stability and format. Confirm the contract: opaque host-string ids, never parsed by callers, with `''` sentinel for unsaved — and whether a stable cross-host `UID` field is also surfaced.
- **Write conflict semantics.** When an external change races a `saveCalendarEvent`, default to `'fail'` with a `CalendarError` conflict, or last-write-wins? Affects whether `CalendarConflictPolicy` is Silver or Gold.
