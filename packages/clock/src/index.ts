export {
  addClockChild,
  advanceClock,
  createChildClock,
  createClock,
  disposeClock,
  enableClockSignals,
  getClockEffectiveScale,
  getClockParent,
  isClockEffectivelyPaused,
  pauseClock,
  removeClockChild,
  resetClock,
  resumeClock,
  setClockScale,
} from './contract.ts';
export type { Clock, ClockOptions } from './clock.ts';
