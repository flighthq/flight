// Generated from crates/flight-motionpath/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  createMotionPath,
  getMotionPathHeading,
  getMotionPathPosition,
  getMotionPathProgress,
  initializeMotionPath,
  isMotionPathAtEnd,
  setMotionPathDirection,
  setMotionPathDistance,
  setMotionPathProgress,
  updateMotionPath,
} from './motionPath.ts';
export { getMotionPathLoopModeString, parseMotionPathLoopMode } from './types.ts';
export type { MotionPathDirection, MotionPathLoopMode, MotionPathRaw } from './types.ts';
