import { setTransformMatrix, translateMatrixByVectorXY } from '@flighthq/geometry';
import type { Camera2D, MatrixLike } from '@flighthq/types';

// Writes the camera's world->screen affine into `out`.
//
// Composition order (outermost transform applied last to a world point):
//
//   screen = translate(viewportCenter) * rotate(-rotation) * scale(zoom) * translate(-x, -y) * world
//
// The camera position `(x, y)` is subtracted first so the camera center lands at the origin, then
// zoom scales, then the view rotates by `-rotation` (the world rotates opposite the camera), and
// finally the result is shifted to the viewport center. `setTransformMatrix` builds the
// `T(center) * R(-rotation) * S(zoom)` head; `translateMatrixByVectorXY` post-multiplies the inner
// `T(-x, -y)` in world space, leaving the linear part (a, b, c, d) untouched. Alias-safe: `out` may
// be any matrix, including one aliased with a scratch used elsewhere.
export function getCamera2DViewMatrix(camera: Readonly<Camera2D>, out: MatrixLike): void {
  const zoom = camera.zoom;
  setTransformMatrix(out, zoom, zoom, -camera.rotation, camera.viewportWidth * 0.5, camera.viewportHeight * 0.5);
  translateMatrixByVectorXY(out, out, -camera.x, -camera.y);
}
