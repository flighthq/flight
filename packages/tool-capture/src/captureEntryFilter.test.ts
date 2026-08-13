import { selectCaptureEntriesByName } from './captureEntryFilter';

const entries = [
  { name: 'material-depth' },
  { name: 'material-depth-orthographic' },
  { name: 'material-vertex-color' },
  { name: 'material-vertex-color-interpolated' },
];

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
