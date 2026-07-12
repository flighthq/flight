// The vertical placement of a text block within its container height — a block-level property of the
// whole field, distinct from TextFormat.align (per-paragraph horizontal alignment). 'top' leaves the
// text at the container top (the default), 'middle' centers the block in the leftover height, and
// 'bottom' pins it to the container bottom. Only meaningful when the container height exceeds the laid-
// out content height (a fixed-height field); an auto-sizing field has no slack, so it is inert.
//
// 'baseline' and 'justify' are reserved future values (first-baseline snapping and inter-line
// stretch). The type is left open for them deliberately — do not treat these three as the closed set.
export type TextVerticalAlign = 'bottom' | 'middle' | 'top';
