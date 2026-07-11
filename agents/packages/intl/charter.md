---
package: '@flighthq/intl'
crate: flighthq-intl
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# intl — Charter

## What it is

`@flighthq/intl` is the **locale-aware formatting cell** — number, currency, percent, unit, date/time, list, and relative-time formatting plus plural/ordinal category selection and locale-aware string comparison, as small typed functions over the universal ECMAScript `Intl` API with an internal formatter cache. It gives a Flight app one tidy, cached, typed surface for "show this value the way this locale expects," instead of hand-constructing `Intl.*` formatters (which are expensive to build per call).

## North star

Complete coverage of the standard `Intl` surface — `NumberFormat` (decimal / currency / percent / unit / compact), `DateTimeFormat` (date / time / combined, with style and field options), `ListFormat`, `RelativeTimeFormat`, `PluralRules` (cardinal + ordinal), and `Collator` compare/sort — behind cached, allocation-conscious wrappers keyed by `(locale, options)`, returning plain strings/categories. Heavier ICU message formatting (`{count, plural, ...}` templates) is a deliberate later layer, not the core.

## Boundaries

- **Utility, not a platform-device capability — no `*Backend` seam.** `Intl` is a language-level API present in every JS engine Flight targets (browser + Node), so formatting is pure and universal; a swappable backend would be speculative. (A C/C++ port reimplements the package against its own ICU, exactly as it would `@flighthq/math`.) This is why intl looks like `math`/`easing`, not like `net`/`permission`.
- **Depends on `@flighthq/types`** (+ the ambient `Intl` global). No display, no DOM, no device.
- **Formatting + comparison, not parsing or i18n resource management.** It renders values to locale strings and compares/sorts; it does not parse localized input back to values, load translation catalogs, or resolve message bundles — those are separate concerns (a future `intl-message` / catalog layer).

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Pure cached wrappers over `Intl`, no backend.** Each formatter family is a function `format*(value, locale, options?)` that fetches-or-builds a cached `Intl.*` instance keyed by `(locale, serialized-options)` and applies it. The cache is a module-level `Map` (this is a legitimate memoization cache, not shared *mutable app state* — it holds only immutable formatter instances), bounded by a simple cap/eviction to avoid unbounded growth. Building `Intl.*` per call is the performance trap this package exists to remove.
- **[2026-07-10] Coverage set + return types.** `formatNumber`, `formatCurrency`, `formatPercent`, `formatUnit`, `formatCompactNumber`, `formatDate`/`formatTime`/`formatDateTime`, `formatList`, `formatRelativeTime` → `string`; `selectPluralCategory`/`selectOrdinalCategory` → `Intl.LDMLPluralRule` (`'one'|'other'|…`); `compareStrings(a, b, locale, options?)` → `number` and a `sortStrings` convenience. `locale` is a `string | readonly string[]` (BCP-47); options mirror the native `Intl.*Options`, re-exported from `@flighthq/types` where a shared shape helps.
- **[2026-07-10] Invalid input degrades, does not throw for expected cases.** An unsupported unit/currency code or malformed locale that `Intl` itself throws on is a programmer error (surfaces as the native throw). `formatNumber(NaN)` passes through `Intl`'s own `"NaN"`. Invalid `Date` is normalized: `Intl.DateTimeFormat.format()` actually *throws* `RangeError` on an invalid date (unlike `Date.prototype.toLocale*`), so the date formatters guard `Number.isNaN(time)` and return `"Invalid Date"` — the one deliberate normalization so invalid dates degrade like `NaN` rather than throwing.

## Open directions

1. **ICU message formatting.** `formatMessage('{count, plural, one {# item} other {# items}}', args, locale)` — a parser over `PluralRules`/`NumberFormat`; a meatier separate module (`intl-message`) so the core stays thin.
2. **Segmentation.** `Intl.Segmenter` (grapheme/word/sentence) wrappers — coordinates with `@flighthq/textsegment` if that lands; decide the home.
3. **`Intl.DurationFormat` + `DisplayNames`.** Newer `Intl` families (duration, language/region/currency display names) as they stabilize across engines.
