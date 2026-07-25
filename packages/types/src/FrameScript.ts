import type { Node2D } from './Node2D';

// A per-frame callback attached to a timeline frame. Invoked on frame entry with the timeline's
// construct target and the 1-based frame number.
export type FrameScript = (target: Node2D, frame: number) => void;
