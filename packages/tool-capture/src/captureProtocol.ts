/** Version of the browser ↔ tool-capture verification contract. */
export const CAPTURE_PROTOCOL_VERSION = 1 as const;

export type CaptureVerificationState = 'pending' | 'passed' | 'failed';

// Which await the verifier is sitting in while `state` is 'pending'. A stalled verifier reports only
// "pending", which names the symptom and not the cause — and the two causes have nothing in common: a
// presented-frame callback that never fires is a page/scheduler problem, while a readback that never
// resolves is either a GPU-driver problem or a DOM runner bridge that never replied. Recorded as the
// verifier advances so a timeout can say which.
export type CaptureVerificationStage =
  | 'awaitingFrame'
  | 'readingBack'
  | 'measuring'
  | 'asserting'
  | 'encoding'
  | 'done';

// Whether the scene's own pixel oracle actually RAN. Existence and invocation are different claims: a
// scene can export `assertRender` and still have it silently skipped (a misspelled export is simply
// absent to the verifier), and no static scan of the source can tell the two apart. Recorded here so
// the answer is a durable fact rather than an inference from the absence of an error.
export type CaptureVerificationOracle = 'absent' | 'invoked';

/** Machine-facing page result published at `window.__ftVerification`. */
export interface CaptureVerification {
  protocolVersion: typeof CAPTURE_PROTOCOL_VERSION;
  render: string;
  coverage: number | null;
  fingerprint: string | null;
  state: CaptureVerificationState;
  // Meaningful only while `state` is 'pending'; a terminal state has already said what happened.
  stage: CaptureVerificationStage;
  error: string | null;
  /** Set once the verifier reaches the assert step: whether this target's oracle was called. */
  oracle?: CaptureVerificationOracle;
}

/** Repeatable page work exposed to the benchmark runner by the normal capture-target registration. */
export interface CaptureBenchmarkTarget {
  protocolVersion?: typeof CAPTURE_PROTOCOL_VERSION;
  /** False until the target has captured enough state to repeat its workload. */
  ready?: boolean;
  kind: string;
  run(): void | Promise<void>;
  /** Resolve only after work submitted by run() is observable by the backend. */
  synchronize(): void | Promise<void>;
}

export function isCaptureVerificationTerminal(
  verification: Readonly<Pick<CaptureVerification, 'state'>> | null | undefined,
): boolean {
  return verification?.state === 'passed' || verification?.state === 'failed';
}
