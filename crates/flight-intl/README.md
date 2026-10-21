# flight-intl

Locale-aware formatting seam: the `LocaleInput` union, ordered Intl option records, a bounded
caller-owned formatter cache, and the compare/sort/format/select wrappers. Every platform `Intl.*`
operation is supplied by an explicit host capability; the crate never reads an ambient locale, the
OS, a clock or the file system.

## Locale and options

- `LocaleInput` is the source's `string | readonly string[]` union: `Single(String)` or
  `List(Vec<String>)`. Locale strings are used verbatim; no validation or fallback is invented.
- `IntlOptions` is an ordered `Record<IntlOptionValue>` where a value is `Bool`, `Integer` or
  `String`. Insertion order is preserved exactly so cache keys and provider options match the source
  object literals; unknown keys are passed through rather than dropped.
- `get_cache_key` reproduces the source key `kind|locale|JSON.stringify(options)` without a generic
  reflection layer: the ordered record serializer emits the same JSON for the scalar option domains
  (strings escaped, booleans and integers literal). An omitted options object yields an empty
  segment; an explicitly empty record yields `{}`.

## Cache (D5)

The source's module-level `Map` becomes the caller-owned `FormatterCache`. Eviction is plain FIFO
(insertion order, 256 entries, evict before insert), never LRU. `get_cached` builds once per key and
returns the same stored instance as a shared `Arc`. Each formatter helper takes
`&mut FormatterCache`, so the cache lifetime and sharing are explicit.

## Host capability

`HostIntlCapability` (carrying the canonical `ProviderRef`) exposes one factory per formatter family
(collator, date/time, list, number, plural rules, relative time). Each factory receives the
`LocaleInput` and ordered options and returns an immutable handle; the cache decides when a factory
runs. Handles are plain records of callbacks (`compare`, `format`, `select`).

- Date inputs are `IntlDateInput::Date(epoch_ms)` or `EpochMillis(epoch_ms)`; `NaN` is the source's
  invalid sentinel and returns `"Invalid Date"` without building a formatter.
- Plural results are the closed `IntlPluralCategory` union; relative-time units are the closed
  `IntlRelativeTimeUnit` union, both with exact source string tables.
- Number wrappers overlay their source defaults with caller options in source spread order
  (`{ notation: 'compact', ...options }`, `{ style: 'currency', currency, ...options }`, etc.), so a
  caller key updates in place and keeps its source position.

## Backend status

The pinned tests assert concrete locale output (`'1/15/2020'`, `'1,234.56'`, `'a, b, and c'`,
aggregated-number compaction, plural categories). Producing that output requires a real CLDR/Intl
backend, which is a Principal decision (ICU4X versus another portable data source). Until that
ruling, this crate tests the seam contract — cache identity/FIFO, key serialization, option
overlays, default field sets, invalid sentinels, delegation and cache reuse — with an explicit mock
host. No English-only formatter is implemented to fake the source assertions.

## Precision

All Intl numbers (values, epochs, comparator results) are `f64` with per-item allow markers: the
source consumes JS numbers, and f32 would change exact decimal formatting and epoch instants. No
blanket waiver is introduced.
