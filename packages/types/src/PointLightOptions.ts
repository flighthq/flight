import type { Vector3Like } from './Vector3';

// Shadow options are retained as future point-shadow intent only. Current scene3d-gl/scene3d-wgpu
// point lights do not consume castsShadow, normalBias, pcfRadius, or shadowBias.
export interface PointLightOptions {
  castsShadow?: boolean;
  color?: number;
  intensity?: number;
  normalBias?: number;
  pcfRadius?: number;
  position?: Readonly<Vector3Like>;
  range?: number;
  shadowBias?: number;
}
