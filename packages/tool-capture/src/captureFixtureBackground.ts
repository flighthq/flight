// Reads the clear colour a functional scene fixture DECLARES, so a parity distance between two
// backends can be qualified by whether their fixtures asked for the same background in the first place.
//
// ★ THIS IS A NARROW DETECTOR AND ITS NARROWNESS IS LOAD-BEARING. It matches a literal
// `backgroundColor: 0x…` in the fixture text and nothing else. It does not evaluate the expression, it
// does not follow a constant, it does not see a colour supplied by a helper, and it says nothing at all
// about any other fixture difference. Anything built on it must be named for what it detects — a
// declared background mismatch — never for the general question "were these fixtures screened for
// confounds", which it cannot answer.
//
// It lives here rather than in `scripts/` because a package must not import from the script layer;
// scripts import from packages. `scripts/functional-parity-confounds.ts` consumes this function so the
// corpus scan and the per-run validation report read one implementation rather than two regexes that
// drift.

/**
 * Compares two fixtures' declared clear colours.
 *
 * Returns `null` when the comparison could not be made — either fixture declaring nothing is enough —
 * so a caller can tell "checked and they agree" from "not checked". Returning `false` for an
 * undeclared pair would convert an absent check into an apparent clean bill of health.
 */
export function compareCaptureFixtureBackgrounds(a: string, b: string): boolean | null {
  const first = findCaptureFixtureBackground(a);
  const second = findCaptureFixtureBackground(b);
  if (first === null || second === null) return null;
  return first !== second;
}

/**
 * The clear colour a functional scene fixture declares, lowercased, or `null` when it declares none.
 *
 * `null` means NOT DECLARED, which is a different fact from "declares the default" — an undeclared
 * fixture must never be read as agreeing with anything.
 */
export function findCaptureFixtureBackground(source: string): string | null {
  return /backgroundColor:\s*(0x[0-9a-fA-F]+)/.exec(source)?.[1]?.toLowerCase() ?? null;
}
