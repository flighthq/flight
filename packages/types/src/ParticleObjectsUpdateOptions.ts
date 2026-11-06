export interface ParticleObjectsUpdateOptions {
  callbacks?: {
    onDeath?: (x: number, y: number, z: number) => void;
    onSpawn?: (x: number, y: number, z: number) => void;
  };
  emitterX?: number;
  emitterY?: number;
}
