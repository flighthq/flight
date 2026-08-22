export interface LoopBackend {
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(handle: number): void;
  now(): number;
}
