export interface ParticleEmitterCallbacks {
  // Position payload is world-space x/y/z; 2D emitters pass z = 0.
  onDeath?: (x: number, y: number, z: number) => void;
  onSpawn?: (x: number, y: number, z: number) => void;
}
