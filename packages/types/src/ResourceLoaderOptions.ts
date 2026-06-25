export interface ResourceLoaderOptions {
  dedupe?: boolean;
  errorPolicy?: 'continue' | 'fail-fast';
  maxBytesPerSecond?: number;
  maxConcurrent?: number;
  retries?: number;
  retryBackoff?: 'exponential' | 'linear' | 'none';
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  streaming?: boolean;
  timeoutMs?: number;
}
