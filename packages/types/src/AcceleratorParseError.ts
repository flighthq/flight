// The reason an accelerator string failed to parse, returned by parseAcceleratorDetailed for
// diagnostics and validation UIs. The common parse path returns null instead.
export interface AcceleratorParseError {
  // The offending token, or '' when the failure is not tied to a specific token (e.g. 'empty').
  token: string;
  reason: AcceleratorParseErrorReason;
}

export type AcceleratorParseErrorReason =
  | 'duplicate-modifier'
  | 'empty'
  | 'missing-key'
  | 'unknown-key'
  | 'unknown-modifier';
