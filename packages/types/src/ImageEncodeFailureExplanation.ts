export interface ImageEncodeFailureExplanation {
  readonly mimeType: string;
  readonly reason: 'encoder-not-registered';
}
