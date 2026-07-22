/** Version of the browser ↔ tool-capture verification contract. */
export const CAPTURE_PROTOCOL_VERSION = 1 as const;

export type CaptureVerificationState = 'pending' | 'passed' | 'failed';

/** Machine-facing page result published at `window.__ftVerification`. */
export interface CaptureVerification {
  protocolVersion: typeof CAPTURE_PROTOCOL_VERSION;
  render: string;
  coverage: number | null;
  fingerprint: string | null;
  state: CaptureVerificationState;
  error: string | null;
}

export function isCaptureVerificationTerminal(
  verification: Readonly<Pick<CaptureVerification, 'state'>> | null | undefined,
): boolean {
  return verification?.state === 'passed' || verification?.state === 'failed';
}
