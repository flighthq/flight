/** @deprecated Import accessibility contracts from `@flighthq/accessibility/contract`. */
export type {
  AccessibilityRole,
  AccessibilityState,
  AccessibilityNode,
  AccessibilityOperationBlockReason,
  AccessibilityOperationOutcome,
  HostAccessibilityCapability,
} from '@flighthq/accessibility/contract';

// AccessibilityLiveness stays declared here, identical to the owner's string-literal union, because the
// frozen generator reads a union's literal values from its declaring file in @flighthq/types.
/** @deprecated Import `AccessibilityLiveness` from `@flighthq/accessibility/contract`. */
export type AccessibilityLiveness = 'polite' | 'assertive';
