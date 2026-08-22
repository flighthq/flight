export interface LoopBackend {
  requestFrame(callback: (time: number) => void): unknown;
  cancelFrame(handle: unknown): void;
  now(): number;
}
