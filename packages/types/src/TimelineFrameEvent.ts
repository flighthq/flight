// Payload for a timeline's per-frame signals (onEnterFrame / onExitFrame / onFrameConstructed):
// the frame being entered and the frame the playhead is leaving (the sentinel -1 before the first
// frame is realized).
export interface TimelineFrameEvent {
  frame: number;
  previousFrame: number;
}
