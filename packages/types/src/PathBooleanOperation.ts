// The four constructive-solid-geometry boolean operations over two 2D regions (subject and clip):
// `union` = points in either; `intersection` = points in both; `difference` = points in subject but
// not clip; `xor` = points in exactly one. `difference` is the only non-symmetric operation — subject
// and clip are not interchangeable.
export type PathBooleanOperation = 'difference' | 'intersection' | 'union' | 'xor';
