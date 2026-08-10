import { explainEmptyCheckSelection, isCheckSelectionEmpty } from './select';

// The fourth instance of the repo's evidence invariant — a gate must fail when its required evidence is
// zero. The parity tier, the regression tier, and test selection each carry a test asserting the gate
// FIRES on zero; this file is that proof for check selection, which had none.

describe('explainEmptyCheckSelection', () => {
  it('names the selectors, so the typo that caused it is visible in the failure', () => {
    // Without the offending text the reader learns only that something matched nothing, which sends
    // them to the repo rather than to the word they mistyped.
    const message = explainEmptyCheckSelection(['scene2dd']);

    expect(message).toContain('"scene2dd"');
    expect(message).toContain('unconfigured, not clean');
  });

  it('names every selector when several were given', () => {
    expect(explainEmptyCheckSelection(['aa', 'bb'])).toContain('"aa", "bb"');
  });
});

describe('isCheckSelectionEmpty', () => {
  it('FIRES on a scoped run that resolved to no package and no path, the inert-run defect', () => {
    // The whole point: without this, every scoped gate runs over nothing, passes vacuously, and the
    // command reports the same "all check gates passed" a real sweep does.
    expect(isCheckSelectionEmpty(['scene2dd'], [], [])).toBe(true);
  });

  it('stays quiet as soon as one package resolved', () => {
    expect(isCheckSelectionEmpty(['scene2d'], ['packages/scene2d'], [])).toBe(false);
  });

  it('stays quiet as soon as one path resolved, even with no package', () => {
    // A path-only selector is a legitimate scoping, not an empty one.
    expect(isCheckSelectionEmpty(['functional/scenes'], [], ['functional/scenes'])).toBe(false);
  });

  it('does not fire on an UNSCOPED run, which means the whole repo rather than nothing', () => {
    // Zero selectors resolving to zero projects is the full sweep, and reading it as empty would fail
    // the bare `npm run check` — the opposite of the intent.
    expect(isCheckSelectionEmpty([], [], [])).toBe(false);
  });
});
