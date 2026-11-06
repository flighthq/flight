/** A capture test's committed baseline, keyed by backend or renderer column. */
export type CaptureBaseline = Record<string, CaptureColumnBaseline>;

/** String-valued baseline fields supported by the generic field accessors. */
export type CaptureBaselineField = 'fingerprint' | 'sha256';

/** Which independently-written baseline value a provenance record describes. */
export type CaptureBaselineProvenanceField = 'fingerprint' | 'sha256';

/** The conditions under which one committed baseline value was produced. */
export interface CaptureBaselineProvenance {
  /** Identity of the fingerprint computation, or null for records predating computation tracking. */
  computationId: string | null;
  /** Deterministic capture frame, or zero when unset. */
  frames: number;
  /** SHA-256 of the scene source bytes, or null when the subject has no resolvable source. */
  sourceHash: string | null;
  /** In-page verification target kind, or null when the page registered none. */
  targetKind: string | null;
  /** Whether the page published a render image rather than falling back to a browser screenshot. */
  verifyPublished: boolean;
  /** Extra animation frames rendered after the deterministic capture frame. */
  warmupFrames: number;
}

/** Result of a capture regression or parity tolerance check. */
export interface CaptureCheckResult {
  readonly pass: boolean;
  readonly difference: number;
  readonly tolerance: number;
}

/** The three render-verification tiers. */
export type CaptureCheckTier = 'regression' | 'parity' | 'smoke';

/** Independently-written committed values for one backend or renderer column. */
export interface CaptureColumnBaseline {
  /** Coarse render fingerprint in `<gridSize>:<hex>` form. */
  fingerprint?: string;
  /**
   * @deprecated Partial provenance for legacy fingerprints. New writers record
   * `fingerprintProvenance` instead.
   */
  sourceHash?: string;
  /** SHA-256 of the encoded screenshot bytes. */
  sha256?: string;
  /** Provenance for `fingerprint`; absence means unknown, never agreement. */
  fingerprintProvenance?: CaptureBaselineProvenance;
  /** Provenance for `sha256`; absence means unknown, never agreement. */
  sha256Provenance?: CaptureBaselineProvenance;
}
