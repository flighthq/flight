export interface WebcamConstraints {
  readonly exposureCompensation?: number;
  readonly exposureMode?: string;
  readonly focusDistance?: number;
  readonly focusMode?: string;
  readonly torch?: boolean;
  readonly whiteBalanceMode?: string;
  readonly zoom?: number;
}
