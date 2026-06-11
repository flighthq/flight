export interface ParticleEmitterCallbacks {
  onDeath?: (x: number, y: number) => void;
  onSpawn?: (x: number, y: number) => void;
}

export interface WorldTransform2D {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}
