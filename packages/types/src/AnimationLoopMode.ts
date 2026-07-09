// How an AnimationPlayer repeats when `loop` is true. 'Repeat' wraps modulo the clip duration (the
// playhead jumps from the end back to the start); 'PingPong' reflects at each end, reversing the
// travel direction (the sign of `speed`) so the playhead bounces back and forth. Ignored when `loop`
// is false. Undefined on a player is treated as 'Repeat', keeping the plain boolean `loop` behavior.
export type AnimationLoopMode = 'PingPong' | 'Repeat';

export const AnimationLoopModePingPong = 'PingPong';
export const AnimationLoopModeRepeat = 'Repeat';
