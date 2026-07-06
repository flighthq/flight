// shadow-directional — proves the directional shadow recipe on the Gl backend: a sphere hovering over a
// ground plane, lit by one straight-down white sun, casts a dark shadow onto the plane beneath it. The
// recipe is two passes (render.webgl.ts): drawGlSceneShadowMap renders scene depth from the light into a
// shadow map, then drawGlScene's lit shaders PCF-sample it so the plane under the sphere is darkened.
//
// The oracle samples the ground in the foreground (lit) and the ground directly under the sphere
// (shadowed) and asserts the under-sphere ground is clearly darker — the signature of a real shadow (an
// unshadowed scene would light the whole plane uniformly). webgl-only: shadows are a Gl recipe today.
//
// createScene exists on both @flighthq/node and @flighthq/scene, so it collides in the @flighthq/sdk
// barrel — import the 3D scene one directly.
import { createScene } from '@flighthq/scene';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  configureDirectionalShadowCamera,
  createAabb,
  createAmbientLight,
  createCamera,
  createDirectionalLight,
  createMesh,
  createOrthographicProjection,
  createPerspectiveProjection,
  createPlaneMeshGeometry,
  createSphereMeshGeometry,
  createStandardPbrMaterial,
  createVector3,
  getSceneNodeWorldBounds,
  getSurfacePixelLuminance,
  setCameraViewMatrix4FromLookAt,
  setSceneNodePosition,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A light-gray diffuse material shared by the ground and the sphere; high roughness so the lit ground is
// a broad even bright that the shadow clearly darkens.
const material = createStandardPbrMaterial({ baseColor: 0xb8b8b8ff, metallic: 0, roughness: 0.8 });

const scene = createScene();

// Horizontal ground plane (createPlaneMeshGeometry is XZ, normal +Y).
const ground = createMesh(createPlaneMeshGeometry(8, 8), [material]);
addNodeChild(scene, ground);

// A sphere hovering above the plane centre — the shadow caster.
const sphere = createMesh(createSphereMeshGeometry(0.7, 32, 24), [material]);
setSceneNodePosition(sphere, 0, 1.3, 0);
addNodeChild(scene, sphere);

const camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCameraViewMatrix4FromLookAt(camera, createVector3(0, 3, 5), createVector3(0, 0.4, 0), createVector3(0, 1, 0));

// One white sun straight down + a dim ambient fill so the shadowed ground reads clearly dark.
const direction = createVector3(0, -1, 0);
const lights = {
  ambient: createAmbientLight({ color: 0x404040ff, intensity: 0.12 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction, intensity: 3 }),
};

// Shadow camera fitted to the scene's world bounds along the light direction.
const sceneBounds = createAabb();
getSceneNodeWorldBounds(sceneBounds, scene);
const shadowCamera = createCamera({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 1, halfWidth: 1 }),
});
configureDirectionalShadowCamera(shadowCamera, direction, sceneBounds);

render(scene, camera, lights, shadowCamera);

export function assertRender(surface: Readonly<Surface>): void {
  const cx = Math.floor(surface.width / 2);
  // The ground recedes to a horizon near mid-screen; the sphere projects to the upper-centre and its
  // shadow lands as an ellipse on the ground just below it, centred around 56% of the frame height.
  // The lit ground in the near foreground is sampled at 90%. (Coordinates verified against the capture.)
  const litLuminance = getSurfacePixelLuminance(surface, cx, Math.floor(surface.height * 0.9)); // lit foreground ground
  const shadowLuminance = getSurfacePixelLuminance(surface, cx, Math.floor(surface.height * 0.56)); // ground under sphere

  if (litLuminance <= 24) {
    throw new Error(`[shadow-directional] ground is blank (luminance ${litLuminance}) — scene did not render`);
  }
  if (shadowLuminance + 32 >= litLuminance) {
    throw new Error(
      `[shadow-directional] no shadow: ground under the sphere (${shadowLuminance}) is not clearly darker than the lit ground (${litLuminance})`,
    );
  }
}
