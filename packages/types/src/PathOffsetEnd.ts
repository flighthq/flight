// How the two terminal ends of an OPEN path are capped when it is offset into a closed outline. `butt`
// ends the outline flat at the terminal vertex (no extension); `square` extends the flat cap out by
// `|delta|` past the terminal; `round` caps with a half-circle of radius `|delta|` about the terminal.
// Closed contours have no ends and ignore this. This is the Clipper2 `EndType` open-path vocabulary.
export type PathOffsetEnd = 'butt' | 'round' | 'square';
