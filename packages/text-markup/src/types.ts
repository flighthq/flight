import type {
  MarkupClassResolver as SharedMarkupClassResolver,
  MarkupColorResolver as SharedMarkupColorResolver,
  MarkupTagEffect as SharedMarkupTagEffect,
  MarkupTagHandler as SharedMarkupTagHandler,
  MarkupTagRegistry as SharedMarkupTagRegistry,
  MarkupTagResult as SharedMarkupTagResult,
  TextMarkupExplanation as SharedTextMarkupExplanation,
  TextMarkupGuard as SharedTextMarkupGuard,
  TextMarkupIssue as SharedTextMarkupIssue,
  TextMarkupIssueKind as SharedTextMarkupIssueKind,
} from '@flighthq/types/contract';

// The canonical public declarations remain owned by @flighthq/types. These aliases let generated
// sibling modules consume the Rust declarations without creating a second TypeScript model.
export type MarkupClassResolver = SharedMarkupClassResolver;
export type MarkupColorResolver = SharedMarkupColorResolver;
export type MarkupTagEffect = SharedMarkupTagEffect;
export type MarkupTagHandler = SharedMarkupTagHandler;
export type MarkupTagRegistry = SharedMarkupTagRegistry;
export type MarkupTagResult = SharedMarkupTagResult;
export type TextMarkupExplanation = SharedTextMarkupExplanation;
export type TextMarkupGuard = SharedTextMarkupGuard;
export type TextMarkupIssue = SharedTextMarkupIssue;
export type TextMarkupIssueKind = SharedTextMarkupIssueKind;

export const TextMarkupIssueKind = {
  UnknownTag: 'unknown-tag',
  UnresolvedFontColor: 'unresolved-font-color',
  UnsafeHref: 'unsafe-href',
} as const;

// Rust carries these seams as explicit caller-owned state. They are package-internal TypeScript
// generation facts; the public target-native modules keep the established hidden-state signatures.
export interface MarkupResolverSeams {
  classResolver?: MarkupClassResolver;
  colorResolver?: MarkupColorResolver;
}

export type TextMarkupClock = () => number;

export interface TextMarkupGuardState {
  guard?: TextMarkupGuard;
}

export function createTextMarkupGuardState(): TextMarkupGuardState {
  return {};
}

export function getTextMarkupIssueKindString(value: TextMarkupIssueKind): string {
  return value;
}

export function parseTextMarkupIssueKind(value: string): TextMarkupIssueKind | undefined {
  switch (value) {
    case 'unknown-tag':
    case 'unresolved-font-color':
    case 'unsafe-href':
      return value;
    default:
      return undefined;
  }
}
