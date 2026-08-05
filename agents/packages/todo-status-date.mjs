// Derives a status cell's effective date instead of trusting its front matter. CONTRACT.md defines
// `updated:` as "date of the newest entry", so the dated `##` headings in the log ARE that value and
// the field is only a cache of them — and a hand-maintained cache drifts. When this was added, 48 of
// 116 cells carried an `updated:` older than their own newest entry, and 12 of those were dropped
// from TODO.md's re-review list as a result (worst: scene2d-gl, reviewed 2026-06-25 with work landed
// through 2026-08-02). A list whose job is reporting staleness must not itself go stale.

// How many dated entries a status log has gained strictly after `since`. Pairs with the commit count
// in the liveness ranking: commits say how much landed, this says how much of it the log accounts for.
export function countStatusEntriesSince(text, since) {
  return getStatusEntryDates(text).filter((date) => date > since).length;
}

// Every dated entry heading in a status log, oldest first.
//
// Two heading shapes are in use and both are read: the bare `## YYYY-MM-DD` (191 entries) and the
// bracketed `## [YYYY-MM-DD · <author>]` (78) that mirrors the `Approved` provenance stamp. Matching
// only the bare form hid 29% of every entry in the tree, which surfaced as six cells reported as
// having no continuity prose while their logs carried it — the liveness list then sent agents to
// write what was already written.
//
// CONTRACT.md fixes the front matter and says nothing about the heading, so the heading is prose and
// agents are free in it by design. The parser widens to the prose rather than the contract narrowing
// to the parser: a derived signal that reads free-form text owns the variation it will meet, and the
// bracketed form is the better one anyway since it carries who wrote the entry.
export function getStatusEntryDates(text) {
  return [...text.matchAll(/^#{2,3}\s+\[?\s*(\d{4}-\d{2}-\d{2})/gm)].map((match) => match[1]).sort();
}

// The newest `## YYYY-MM-DD` entry heading in a status log, or null when it has no dated entry.
export function getNewestStatusEntryDate(text) {
  const dates = getStatusEntryDates(text);
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

// The later of the declared and observed dates. Taking the max — rather than always preferring the
// headings — keeps a correct front-matter date authoritative for a log whose entries are undated.
// Dates are YYYY-MM-DD strings, so lexical comparison is date comparison.
export function getStatusDate(text, declaredUpdated) {
  const declared = declaredUpdated && declaredUpdated !== 'null' ? declaredUpdated : null;
  const observed = getNewestStatusEntryDate(text);
  if (declared === null) return observed;
  if (observed === null) return declared;
  return observed > declared ? observed : declared;
}
