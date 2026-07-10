/**
 * A BCP-47 locale specifier accepted by every `@flighthq/intl` formatter.
 *
 * Either a single locale tag (`'en-US'`) or a priority-ordered fallback list
 * (`['fr-CA', 'fr', 'en']`), matching the `locales` argument every `Intl.*`
 * constructor accepts. Passing `undefined` to `Intl` selects the runtime
 * default locale; the intl wrappers require an explicit locale instead, so the
 * chosen locale is always visible at the call site rather than ambient.
 */
export type LocaleInput = string | readonly string[];
