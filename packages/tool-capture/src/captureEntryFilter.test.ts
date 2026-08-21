import { assertCaptureSelectionNotEmpty, selectCaptureEntriesByName } from './captureEntryFilter';

const entries = [
  { name: 'material-depth' },
  { name: 'material-depth-orthographic' },
  { name: 'material-vertex-color' },
  { name: 'material-vertex-color-interpolated' },
];

const entriesWithRenderers = [
  { name: 'effect-bevel', renderers: ['canvas', 'webgl', 'webgpu'] },
  { name: 'effect-bloom', renderers: ['webgl', 'webgpu'] },
  { name: 'sprite-basic', renderers: ['dom', 'canvas', 'webgl', 'webgpu'] },
];

describe('assertCaptureSelectionNotEmpty', () => {
  it('accepts when entries and renderers match', () => {
    expect(() =>
      assertCaptureSelectionNotEmpty(entriesWithRenderers, undefined, undefined, ['webgl'], 'capture'),
    ).not.toThrow();
  });

  it('accepts when no renderer filter is given', () => {
    expect(() =>
      assertCaptureSelectionNotEmpty(entriesWithRenderers, undefined, undefined, [], 'capture'),
    ).not.toThrow();
  });

  it('refuses --filter-exact that matched no entries', () => {
    expect(() => assertCaptureSelectionNotEmpty([], undefined, 'nonexistent', [], 'capture')).toThrow(
      /capture: --filter-exact 'nonexistent' matched no entries/,
    );
  });

  it('refuses --filter that matched no entries', () => {
    expect(() => assertCaptureSelectionNotEmpty([], 'zzz', undefined, [], 'validate')).toThrow(
      /validate: --filter 'zzz' matched no entries/,
    );
  });

  it('refuses when no entries exist and no filter was given', () => {
    expect(() => assertCaptureSelectionNotEmpty([], undefined, undefined, [], 'capture')).toThrow(
      /capture: no entries found/,
    );
  });

  it('refuses --renderer that matched no renderers across all entries', () => {
    expect(() =>
      assertCaptureSelectionNotEmpty(entriesWithRenderers.slice(0, 2), undefined, undefined, ['dom'], 'capture'),
    ).toThrow(/capture: --renderer 'dom' matched no renderers in 2 selected entries/);
  });

  it('accepts --renderer that matches at least one entry', () => {
    expect(() =>
      assertCaptureSelectionNotEmpty(entriesWithRenderers, undefined, undefined, ['dom'], 'capture'),
    ).not.toThrow();
  });
});

describe('selectCaptureEntriesByName', () => {
  it('returns every entry when neither selector is given', () => {
    expect(selectCaptureEntriesByName(entries, undefined, undefined)).toHaveLength(4);
  });

  // The defect this exists to fix: a name contained in a longer name cannot be selected alone by
  // substring, so a WRITING run under `--filter` rewrites ground truth for an entry nobody named.
  it('substring selection silently takes the longer neighbours too', () => {
    expect(selectCaptureEntriesByName(entries, 'material-depth', undefined).map((e) => e.name)).toEqual([
      'material-depth',
      'material-depth-orthographic',
    ]);
  });

  it('exact selection takes ONLY the name given', () => {
    expect(selectCaptureEntriesByName(entries, undefined, 'material-depth').map((e) => e.name)).toEqual([
      'material-depth',
    ]);
  });

  it('exact selection of a name that is a prefix of another still takes only that one', () => {
    expect(selectCaptureEntriesByName(entries, undefined, 'material-vertex-color').map((e) => e.name)).toEqual([
      'material-vertex-color',
    ]);
  });

  it('selects nothing for an exact name no entry carries, rather than falling back to substring', () => {
    expect(selectCaptureEntriesByName(entries, undefined, 'material-dep')).toEqual([]);
  });

  // Two different selections cannot both be meant; silently preferring one would be the same class of
  // quiet widening this module exists to remove.
  it('refuses both selectors at once', () => {
    expect(() => selectCaptureEntriesByName(entries, 'material', 'material-depth')).toThrow(/not both/);
  });
});
