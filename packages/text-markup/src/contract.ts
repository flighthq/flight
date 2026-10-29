// Generated from crates/flight-text-markup/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export { disableTextMarkupGuards, enableTextMarkupGuards } from './enableTextMarkupGuards.ts';
export { registerMarkupClassStyles } from './markupClassStyles.ts';
export { registerMarkupNamedColors } from './markupNamedColors.ts';
export {
  MARKUP_HEX_COLOR_RESOLVER,
  createMarkupTagRegistry,
  registerMarkupTag,
  registerStandardMarkupTags,
  resolveMarkupHexColor,
} from './markupTagRegistry.ts';
export { normalizeMarkupTagResult } from './normalizeMarkupTagResult.ts';
export { explainTextMarkup, formatTextMarkup, parseTextMarkup } from './textMarkup.ts';
export { reportTextMarkupIssue, setTextMarkupGuard } from './textMarkupGuards.ts';
export {
  TextMarkupIssueKind,
  createTextMarkupGuardState,
  getTextMarkupIssueKindString,
  parseTextMarkupIssueKind,
} from './types.ts';
export type {
  MarkupClassResolver,
  MarkupColorResolver,
  MarkupResolverSeams,
  MarkupTagEffect,
  MarkupTagHandler,
  MarkupTagRegistry,
  MarkupTagResult,
  TextMarkupClock,
  TextMarkupExplanation,
  TextMarkupGuard,
  TextMarkupGuardState,
  TextMarkupIssue,
} from './types.ts';
