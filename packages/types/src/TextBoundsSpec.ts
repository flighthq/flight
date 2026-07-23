import type { TextAutoSize } from './TextAutoSize';

// The sizing policy that turns a computed layout into a text object's bounds box — the subset of
// TextLabelData/RichTextData that affects box size. Decoupled from the entity data types so both
// TextLabel and RichText satisfy it structurally; wordWrap is optional because a single-run TextLabel
// never wraps.
export type TextBoundsSpec = Readonly<{ autoSize: TextAutoSize; height: number; width: number; wordWrap?: boolean }>;
