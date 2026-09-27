/**
 * Which of STL's two encodings a file uses.
 *
 * The distinction is not cosmetic: the two are told apart by structure rather than by extension, because both
 * are written as `.stl` and a binary file's 80-byte header is free to begin with the word `solid` — the exact
 * text an ASCII file opens with.
 */
export type StlVariant = 'Ascii' | 'Binary';

/**
 * What a census of one STL file found: which encoding it is, and how many triangles it carries.
 *
 * STL has exactly one feature — triangles — so there is nothing else a census could report. The triangle count
 * is here because it is the number the binary bounds check already had to compute, and a caller deciding whether
 * to load a file wants it.
 */
export interface StlFeatures {
  triangleCount: number;
  variant: StlVariant;
}
