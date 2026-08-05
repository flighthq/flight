// Reading one `## ` section out of a markdown document. Its own module because two gates now depend on
// answering "where does the Decisions section start and stop" IDENTICALLY: the docs gate validates the
// section's contents, and the append-only ledger check guards its lines. Two copies of the boundary
// rule would let the ledger check guard a different region than the gate validates, and that drift is
// invisible from either side — each one looks correct on its own.

// Terminates at the next `## ` heading, a `---` horizontal rule, or true end-of-string. The
// end-of-string form must be `$(?![\s\S])` — under the `m` flag a bare `$` matches every line end, so
// the lazy quantifier stops at the first newline and the capture comes back empty. That exact bug
// silently zeroed the Open-directions term of every bless-queue attention score.
export function readSection(text: string, heading: string): string | null {
  const pattern = new RegExp(`^## ${heading}[^\\n]*\\n([\\s\\S]*?)(?=^## |^---\\s*$|$(?![\\s\\S]))`, 'm');
  const match = text.match(pattern);
  return match === null ? null : match[1];
}
