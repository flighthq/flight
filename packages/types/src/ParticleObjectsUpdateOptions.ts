export interface ParticleObjectsUpdateOptions {
  callbacks?: {
    onDeath?: () => void;
    onSpawn?: (x: number, y: number) => void;
  };
  emitterX?: number;
  emitterY?: number;
}
