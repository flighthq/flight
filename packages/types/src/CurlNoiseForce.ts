export interface CurlNoiseForce {
  kind: 'CurlNoiseForce';
  /** Frequency of the underlying noise field. Higher values produce tighter curl patterns. */
  scale: number;
  /** Magnitude of the curl-noise acceleration applied per second. */
  strength: number;
  /** Optional time offset in seconds — advance the noise field each frame to make it evolve
   *  over time. Pass the accumulated simulation time for a dynamic, shifting curl field. */
  time?: number;
}
export const CurlNoiseForceKind = 'CurlNoiseForce';
