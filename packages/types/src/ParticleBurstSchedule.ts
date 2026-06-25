/** A single timed burst entry within a {@link ParticleBurstSchedule}. */
export interface ParticleBurstEntry {
  /** Emitter age (seconds) at which this burst first fires. */
  readonly time: number;
  /** Number of particles to spawn per cycle of this burst. */
  readonly count: number;
  /** How many times this burst repeats. 0 or negative = fire once only. */
  readonly cycles: number;
  /** Interval in seconds between repeat cycles. Ignored when cycles <= 0. */
  readonly interval: number;
}
/** A burst schedule: an ordered array of timed burst entries that fire as the emitter ages.
 *  Replaces / augments the single `burstCount`/`burstInterval` fields when present.
 *  Entries are matched by emitter age; each entry fires independently. */
export type ParticleBurstSchedule = ReadonlyArray<ParticleBurstEntry>;
