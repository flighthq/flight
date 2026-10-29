import type { PathMorphRaw, PathRaw } from './path.ts';

// Dependent packages generated from Rust name the Rust types (`flight_path::Path`); these are the
// same records the generated modules call `PathRaw` and `PathMorphRaw`.
export type Path = PathRaw;
export type PathMorph = PathMorphRaw;
