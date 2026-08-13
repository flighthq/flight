import { findWedgedBackendSegment, runBackendPrefixScan } from './backendPrefix';

// ★ EVERY NEGATIVE CONTROL FOR A PROOF PATH LIVES HERE, PERMANENTLY, AND THE STANDING RULE IS:
// A NEW PROOF PATH MUST LEAVE EVERY PRE-EXISTING NEGATIVE CONTROL STILL FAILING.
//
// The checker proves compliance two ways today — the segment names an exported type, or singularizing it
// names a same-package singular registrar. Each is sound, and each makes the next one easier to argue
// for. What degrades under repeated widening is not how MANY routes to compliance exist; it is HOW MUCH
// STILL FAILS. So these cases are asserted against the ASSEMBLED checker rather than against whichever
// path was newest, because a path tested in isolation proves nothing about the union it joined.
//
// If adding a third path makes any `toBe(...)` below start returning null, that path did not add a
// spelling — it dissolved an exclusion, and this file is where that becomes visible AT THE MOMENT IT
// HAPPENS rather than several widenings later when nobody can say when the rule stopped biting.

describe('findWedgedBackendSegment', () => {
  const types = new Set(['BlendMode', 'ToonMaterial', 'GlModifierSnippet']);
  const renderGl = new Set(['registerGlBlendMode']);
  const noRegistrars = new Set<string>();

  it('accepts a plural aggregate proved by its same-package singular registrar', () => {
    // The type path cannot prove this one: `GlBlendModes` is not a type, and deliberately so — the
    // un-widened rule would have forced a junk plural type into @flighthq/types purely to satisfy a
    // mechanical check, corrupting the layer it validates against. The proof is transitive instead:
    // proved by `registerGlBlendMode`, which was itself proved the hard way through `BlendMode`.
    expect(findWedgedBackendSegment('registerDefaultGlBlendModes', renderGl, types)).toBeNull();
  });

  it('rejects a split type name even when the leading word looks like an adjective', () => {
    // The defect the rule exists to catch: `Toon` belongs to the type and sits BEFORE the backend token,
    // so the name has been split around it. `registerGlToonMaterial` is the correct spelling.
    expect(findWedgedBackendSegment('registerDefaultToonGlMaterials', noRegistrars, types)).toBe('GlMaterials');
  });

  it('rejects the aggregate when the singular registrar is exported by a different package', () => {
    // Locality: the identical name is compliant in the package that exports `registerGlBlendMode` and a
    // violation one package over. A proof that has to travel is a proof that can drift, and a
    // coincidental cross-package name match proves nothing about the name under test.
    expect(findWedgedBackendSegment('registerDefaultGlBlendModes', noRegistrars, types)).toBe('GlBlendModes');
  });

  it('accepts an adjective in front of a type that already carries its backend', () => {
    expect(findWedgedBackendSegment('registerBuiltInGlModifierSnippets', noRegistrars, types)).toBeNull();
  });

  it('ignores a backend token that is initial, trailing, or merely a substring', () => {
    expect(findWedgedBackendSegment('registerGlToonMaterial', noRegistrars, types)).toBeNull();
    expect(findWedgedBackendSegment('registerSomethingGl', noRegistrars, types)).toBeNull();
    expect(findWedgedBackendSegment('registerSpecularGlossinessThing', noRegistrars, types)).toBeNull();
  });
});

// ★ THE CASE THAT COVERS THE GATE RATHER THAN THE RULE, AND IT IS NOT OPTIONAL FOR A GATE'S SUITE.
// Everything above exercises a pure predicate; CI runs an EXECUTABLE. A refactor that moves the body
// behind a main-guard and strands a module-scope reference breaks the second while leaving every case
// above green — which is exactly what happened here: a ReferenceError in `packageOf`, five tests
// passing, `npm run backend-prefix:check` dead. A suite without this case covers the RULE and silently
// claims to cover the GATE.
// Detection question for any gate suite: DOES ANY CASE EXECUTE THE THING CI EXECUTES, or do they all
// execute a function CI never calls directly?
describe('runBackendPrefixScan', () => {
  // ★ THE EXPLICIT TIMEOUT IS LOAD-BEARING, NOT DECORATION. This case reads every source file under
  // `packages/` — work that GROWS WITH THE REPOSITORY — while vitest's default deadline is a fixed
  // 5000ms. It takes ~2.8s on an idle machine, so it shipped with well under a 2x margin, and a
  // whole-repo run that was 2.6x slower than the previous one duly timed it out at 5000ms while every
  // assertion in it would have passed: measured 3387ms in one run and dead in the next, same tree.
  //
  // That is the repository's own documented flake shape (see agents/conventions/testing.md) —
  // UNBOUNDED WORK UNDER A FIXED DEADLINE, wrong on any machine slow enough — landing in a test body
  // rather than in a `beforeAll`. A timeout failure is indistinguishable from a real violation in the
  // summary line, so an under-budgeted deadline on a whole-tree walk manufactures red that teaches
  // nothing. The generous budget still fails a genuine hang; it just stops reporting contention as a
  // backend-prefix violation.
  it('runs end to end over the real tree and finds no violations', () => {
    const { allowed, scanned, violations } = runBackendPrefixScan();

    expect(violations).toEqual([]);
    expect(allowed).toBe(0);
    // Not pinned to an exact count: registrars are added routinely and a hard number would fail on
    // unrelated work, turning a wiring check into a maintenance tax. The floor still proves the walk
    // reached the packages tree rather than scanning nothing and reporting clean.
    expect(scanned).toBeGreaterThan(250);
  }, 60_000);
});
