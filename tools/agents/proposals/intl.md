---
id: intl
title: '@flighthq/intl'
type: new-package
target: intl
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/intl.md
  - tools/agents/docs/reviews/breadth/missing-domains.md
  - tools/agents/docs/reviews/breadth/text-typography.md
depends_on: []
updated: 2026-06-23
---

## Summary

Internationalization — ICU MessageFormat message catalogs, number/date/currency/relative-time/plural formatting, locale resolution, and locale-aware line/grapheme breaking — over a swappable host-backed seam (web `Intl`/`Intl.Segmenter` default).

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The 20% delivering 80%: resolve a locale, format numbers/dates/currency, pluralize, and format the most common ICU messages.

**Types (`@flighthq/types`):**

- `Locale` — plain data: `{ language: string; region: string; script: string; variants: readonly string[] }` (parsed BCP-47 components). Constructed via `createLocale`/`parseLocale`, not a literal.
- `LocaleTag` — the canonical BCP-47 string alias (`'en-US'`).
- `MessageCatalog` — `Readonly<Record<string, string>>`: message id → ICU MessageFormat source string.
- `MessageArguments` — `Readonly<Record<string, string | number | Date>>`.
- `NumberFormatOptions`, `DateFormatOptions`, `CurrencyFormatOptions` — plain option records mirroring the `Intl.*Format` option shape (no constructor objects exposed to users).
- `PluralCategory` — string kind: `'zero' | 'one' | 'two' | 'few' | 'many' | 'other'`.
- `IntlBackend` — the seam interface: `{ formatNumber, formatDate, formatCurrency, selectPluralCategory, resolveLocale, getCanonicalLocale }`.

**Functions (`@flighthq/intl`):**

- `createLocale(language, region?, script?): Locale`, `parseLocale(tag: LocaleTag): Locale | null` (sentinel on malformed tag), `getLocaleTag(locale): LocaleTag`.
- `resolveLocale(requested: readonly LocaleTag[], available: readonly LocaleTag[]): LocaleTag | null` — BCP-47 lookup/best-fit matching; `null` when nothing matches.
- `formatNumber(value: number, locale: LocaleTag, options?: Readonly<NumberFormatOptions>): string`
- `formatCurrency(value: number, currency: string, locale: LocaleTag, options?: Readonly<CurrencyFormatOptions>): string`
- `formatDate(value: Date, locale: LocaleTag, options?: Readonly<DateFormatOptions>): string`
- `selectPluralCategory(value: number, locale: LocaleTag): PluralCategory`
- `formatMessage(catalog: Readonly<MessageCatalog>, id: string, locale: LocaleTag, args?: Readonly<MessageArguments>): string` — ICU MessageFormat with `{name}` interpolation, `{n, number}`/`{d, date}` argument formatting, and `{n, plural, ...}` selection. Returns the raw id as sentinel when the message id is missing.
- Backend triple: `getIntlBackend()`, `setIntlBackend(backend: IntlBackend | null)`, `createWebIntlBackend(): IntlBackend`.

### Silver

Competitive/solid: the rest of the ICU MessageFormat surface, the remaining `Intl` formatters, ambient-locale convenience, and the locale-aware breaking seam the text stack needs.

**Added types (`@flighthq/types`):**

- `RelativeTimeUnit` — string kind (`'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'`).
- `MessageNode` / `MessagePattern` — the parsed ICU AST (plain data): literal, argument, `plural`, `select`, `selectordinal` nodes — so a catalog can be parsed once and reused (explicit allocation: `parseMessagePattern` allocates, `formatMessagePattern` does not).
- `ListFormatOptions`, `RelativeTimeFormatOptions`, `DisplayNameOptions`.
- `LineBreakOpportunity` — `{ index: number; mandatory: boolean }` (UAX #14 result row).
- `GraphemeSegment`, `WordSegment` — `{ index: number; length: number }` segmentation rows (UAX #29).
- `IntlBackend` grows: `formatRelativeTime`, `formatList`, `getDisplayName`, `compareStrings` (collation), `getLineBreakOpportunities`, `segmentGraphemes`, `segmentWords`.

**Added functions (`@flighthq/intl`):**

- `formatRelativeTime(value: number, unit: RelativeTimeUnit, locale: LocaleTag, options?): string`
- `formatList(items: readonly string[], locale: LocaleTag, options?): string`
- `getDisplayName(code: string, locale: LocaleTag, options: Readonly<DisplayNameOptions>): string` — region/language/currency/script display names.
- `compareLocaleStrings(a: string, b: string, locale: LocaleTag): number` — collator-backed compare for locale-correct sorting.
- `selectOrdinalCategory(value: number, locale: LocaleTag): PluralCategory`
- `parseMessagePattern(source: string): MessagePattern | null`, `formatMessagePattern(pattern, locale, args?): string` — the precompiled MessageFormat path; supports `select`, `selectordinal`, nested plural, `#` plural-value substitution, and escaping. Full ICU surface beyond Bronze's subset.
- `getLocaleLineBreakOpportunities(text: string, locale: LocaleTag, out: LineBreakOpportunity[]): readonly LineBreakOpportunity[]` — UAX #14 with locale tailoring (CJK strictness, etc.). `out`-parameter, allocation-free in the hot path; the seam `@flighthq/textlayout` consumes.
- `segmentLocaleGraphemes(text, locale, out): readonly GraphemeSegment[]`, `segmentLocaleWords(text, locale, out): readonly WordSegment[]` — UAX #29 grapheme/word segmentation for caret movement and word selection.
- Ambient locale convenience: `getAmbientLocale(): LocaleTag`, `setAmbientLocale(locale: LocaleTag)`, and locale-defaulting overloads are _not_ added (every formatter keeps the explicit `locale` parameter — verbosity over hidden state); instead `getAmbientLocale` is provided for callers to pass in. `enableIntlSignals()` opens an `IntlSignals` group emitting `onAmbientLocaleChange` for loose multi-listener notification.

### Gold

Authoritative/AAA/production: exhaustive ICU coverage, performance, tested, documented, and Rust-port parity.

**Coverage & correctness:**

- Full ICU MessageFormat 1.0/2.0-compatible feature set: `plural` with explicit `=N` exact matches and offset, `selectordinal`, nested arguments, `date`/`time`/`number` skeletons (e.g. `{d, date, ::yMMMd}`), `duration`/`spellout` where the backend supports them, and gender/`select`.
- Number formatting depth: compact notation, scientific/engineering, unit formatting (`{n, number, ::unit/kilometer}`), sign display, rounding modes, significant-digit control — surfaced through `NumberFormatOptions` and message skeletons.
- Date/time depth: skeleton-driven formatting, calendar systems (`gregory`, `islamic`, `japanese`, `buddhist`), time-zone-aware formatting, era/day-period control.
- Complete `getDisplayName` coverage (language/region/script/currency/calendar/dateTimeField), `formatList` styles (conjunction/disjunction/unit, long/short/narrow), collation strengths and case-first options.
- Locale resolution exhaustive: BCP-47 lookup _and_ best-fit algorithms, likely-subtags expansion, Unicode extension keywords (`-u-ca-`, `-u-nu-`, `-u-co-`), fallback chains, and `resolveLocaleChain(requested, available)` returning the ordered fallback list.

**Catalog/runtime:**

- `MessageBundle` entity (+ runtime quartet): `createMessageBundle`, `addMessageCatalog(bundle, locale, catalog)`, `getMessage(bundle, id, locale, args?)` with per-locale fallback through the resolved chain, plus a compiled-pattern cache on the runtime object (Flight entity/runtime split — the cache is a nullable runtime slot, lazily ensured, never a public field). `disposeMessageBundle` clears caches/signals.
- A loader bridge: catalogs are plain data, so loading is delegated to `@flighthq/loader`/`@flighthq/resources` (a `MessageCatalog` is JSON); `intl` ships a `parseMessageCatalog(json): MessageCatalog | null` only.

**Performance:**

- Backend-formatter instance caching keyed by `(locale, options)` inside `createWebIntlBackend` (constructing `Intl.*Format` is expensive); precompiled `MessagePattern` reuse; `out`-parameter segmentation/breaking with no per-call allocation; documented allocation boundaries (`create*`/`parse*` allocate, `format*`/`select*`/`segment*`-into-`out` do not).

**Testing & docs:**

- One colocated `*.test.ts` per source file, `describe` blocks alphabetized to exports; `out`-aliasing tests for every `out`-parameter function; a CLDR-derived plural-category fixture suite across a broad locale set; MessageFormat conformance tests against the ICU MessageFormat test corpus; web-backend-unavailable sentinel tests (mock missing `Intl.*`). `npm run exports:check` / `order` / `api` clean.

**Rust parity (`flighthq-intl`):**

- 1:1 function/name mapping (`format_number`, `select_plural_category`, `get_locale_line_break_opportunities`, …), `&mut`/`out` for segmentation, `Option`/sentinel for missing messages/locales, `&T` borrows for `Readonly<>` inputs. Native `IntlBackend` over ICU4X gated behind `native`; MessageFormat parser/formatter is a shared pure-data port. The breaking/segmentation seam mirrors what `flighthq-textlayout` consumes, matching the TS coupling. Any TS↔Rust divergence (e.g. `Intl.Segmenter` vs `icu_segmenter` tailoring differences) recorded in the conformance divergence map.

## Boundaries

- **Not bidi/shaping.** UAX #9 bidi reordering, bracket mirroring, and script itemization belong to the text stack (`textbidi`/`textlayout`), and glyph shaping to `textshaper`. `intl` owns _locale identity, formatting, and locale-aware breaking/segmentation_ only — it provides the line-break and grapheme seams those packages consume, not the rendering.
- **Not the ambient locale source.** `@flighthq/platform`/`@flighthq/device` own the OS locale string; `intl` reads it. No duplication of platform identification.
- **Not networking/loading.** Catalog files are plain JSON loaded by `@flighthq/loader`/`@flighthq/resources`; `intl` only parses/formats, it never fetches.
- **Not a platform capability.** Despite using the platform-suite _seam shape_, `intl` is a content/text package; it is re-exported from `@flighthq/sdk` like other content packages (the platform suite's host adapters are not the model here — there is no `host-electron` `intl` cell unless a native host wants to override the seam).
- **Not currency conversion.** `formatCurrency` formats a value in a currency's locale conventions; exchange-rate math is out of scope.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

1. **Ambient locale vs explicit-everywhere.** Flight's rule strongly favors explicit inputs over hidden state, which argues for a mandatory `locale` parameter on every formatter (the Silver choice). But i18n ergonomics usually assume an ambient locale. Is `getAmbientLocale()` + explicit pass-through the right compromise, or should there be a thin `createLocaleFormatter(locale)` factory returning bound free-function variants?
2. **Should locale-aware breaking live here or in `textlayout`?** The text-typography review lists "locale-aware line breaking" as a text gap. Placing the UAX #14/#29 _seam_ in `intl` (locale owns the tailoring) but the _consumption_ in `textlayout` keeps the dependency direction clean — confirm this split rather than folding breaking into `textlayout` directly.
3. **MessageFormat 1.0 vs 2.0.** ICU MessageFormat 2.0 (MF2) is the emerging standard with a different syntax. Target classic MF1 (matches `intl-messageformat`/web ecosystem today) for Bronze/Silver and add MF2 as a parallel parser at Gold, or commit to MF2 from the start?
4. **Backend granularity.** One fat `IntlBackend` (matches `PlatformBackend`) vs splitting formatting from segmentation/breaking into two seams so a consumer can register only what it needs. The single seam matches house style; the split improves tree-shaking for text-only consumers.
5. **`Intl.Segmenter` availability.** `Intl.Segmenter` is newer than the other `Intl.*` APIs; when absent, does the web backend return sentinels (degrading caret/breaking to naive char/whitespace splitting) or pull a small JS fallback? Sentinel matches the rule, but text correctness suffers.
6. **Rust segmentation parity.** `Intl.Segmenter` and `icu_segmenter` use different dictionary/tailoring data; grapheme/word/line results may diverge on edge scripts. Decide whether this is an accepted, mapped divergence or whether the wasm build must bridge to JS `Intl` for exact conformance.

## Agent brief

> Create `@flighthq/intl` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
