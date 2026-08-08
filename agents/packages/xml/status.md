---
package: "@flighthq/xml"
updated: 2026-08-08
by: principal
---

# xml — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/xml/src/` on 2026-08-08. A file:line here is a claim
about this tree, not about a session.

- **The package is read-only: parse and query, no serializer.** The whole surface is
  `parseXmlAttributes` / `parseXmlDocument` (`xmlParse.ts:12`, `:28`) plus four query helpers
  (`xmlQuery.ts:8`, `:15`, `:23`, `:31`), exported identically through `contract.ts` and `index.ts`.
  Nothing writes XML back out. A caller needing round-trip has no path here.
- **Namespaces are lexical, not resolved.** A prefixed name is kept verbatim in the element/attribute
  name (`xmlParse.ts:14`); there is no prefix→URI binding, so `svg:rect` and `rect` are distinct keys
  and `xmlns` is an ordinary attribute. Stated as a non-goal at `xmlParse.ts:27`, alongside DTD
  validation and processing instructions.
- **External and parameter entities are deliberately unsupported**, not unimplemented: an external
  entity resolves a URL or path at parse time, which the parser has no business honoring. The
  declaration regex excludes both forms structurally rather than by testing for them
  (`xmlParse.ts:273`), with the reasoning at `:225`.
- **Entity expansion is budget-capped and degrades silently.** Expansion repeats to a fixed point under
  a `src.length * GROWTH + 65536` budget (`xmlParse.ts:49`, `:73`); exhausting it stops expansion and
  keeps whatever resolved, with no sentinel and no `explain*` query for the caller to notice.
- **Out-of-range numeric references pass through as literal text** rather than throwing — codepoints
  above `0x10ffff` and the surrogate range are returned unexpanded (`xmlParse.ts:93`).

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Re-verified every Open item against source; all still hold, and the 2026-07-30
  parser-hardening claims (quote-aware DOCTYPE scanner `xmlParse.ts:229-263`, CDATA-as-literal-text
  `:163`, out-of-range codepoint passthrough `:93`, `XmlElement` in `@flighthq/types`) are all present.
  Converted the file from an append-only narration log to the Open + Log contract; no code changed.
- **2026-07-30** — DOCTYPE scanning became quote- and subset-depth-aware, CDATA stays literal ordered
  text, and out-of-range numeric references no longer throw from `String.fromCodePoint`.
- **2026-07-30** — Audited the stale partial-45 record: quoted-attribute fix, internal-subset
  stripping, the four query helpers, and the `XmlElement` move to `@flighthq/types` had all landed.
