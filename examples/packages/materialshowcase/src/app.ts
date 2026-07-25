import {
  createOrbitCameraController,
  dollyOrbitCameraController,
  rotateOrbitCameraController,
  updateOrbitCameraController,
} from '@flighthq/camera-controls';
import { createNode3D } from '@flighthq/scene3d';
import type { Mesh, Scene3DLightsLike, SurfaceMaterial } from '@flighthq/sdk';
import {
  addNodeChild,
  convertMeshGeometryLayout,
  createAmbientLight,
  createAnisotropyPbrMaterial,
  createBlinnPhongMaterial,
  createCamera3D,
  createClearcoatPbrMaterial,
  createDepthMaterial,
  createDirectionalLight,
  createEmissiveMaterial,
  createIridescencePbrMaterial,
  createLambertMaterial,
  createMatcapMaterial,
  createMesh,
  createNormalMaterial,
  createPerspectiveProjection,
  createPhongMaterial,
  createPointLight,
  createSheenPbrMaterial,
  createSpecularGlossinessPbrMaterial,
  createSpecularPbrMaterial,
  createSphereMeshGeometry,
  createStandardPbrMaterial,
  createStandardPbrMaterialProperties,
  createSubsurfacePbrMaterial,
  createSurface,
  createTexture,
  createToonMaterial,
  createTransmissionVolumePbrMaterial,
  createUnlitMaterial,
  createVector3,
  createVertexColorMaterial,
  createWireframeMaterial,
  invalidateNodeLocalTransform,
  normalizeVector3,
  Node3DKind,
  setMeshGeometryVertexColor0,
} from '@flighthq/sdk';

import { canvas, render, scale, supportsVertexColor0 } from './render';

interface MaterialControl {
  getValue: () => number;
  label: string;
  max: number;
  min: number;
  setValue: (value: number) => void;
  step: number;
}

interface MaterialEntry {
  color: string | null;
  controls: readonly MaterialControl[];
  material: SurfaceMaterial;
  name: string;
  setColor: ((color: number) => void) | null;
}

const logicalWidth = 800 / scale;
const logicalHeight = 600 / scale;
const geometry = createSphereMeshGeometry(0.68, 36, 24);
const vertexColorGeometry = convertMeshGeometryLayout(geometry, {
  attributes: [...geometry.layout.attributes, { byteOffset: 48, format: 'float32x4', semantic: 'color0' }],
  stride: 64,
});

for (let vertex = 0; vertex < vertexColorGeometry.vertices.length / 16; vertex++) {
  const offset = vertex * 16;
  const x = vertexColorGeometry.vertices[offset] / 0.68;
  const y = vertexColorGeometry.vertices[offset + 1] / 0.68;
  const z = vertexColorGeometry.vertices[offset + 2] / 0.68;
  setMeshGeometryVertexColor0(vertexColorGeometry, vertex, 0.5 + x * 0.5, 0.5 + y * 0.5, 0.5 + z * 0.5, 1);
}

function createControl(
  label: string,
  min: number,
  max: number,
  step: number,
  getValue: () => number,
  setValue: (value: number) => void,
): MaterialControl {
  return { getValue, label, max, min, setValue, step };
}

function createMatcapTexture() {
  const size = 128;
  const surface = createSurface(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size - 0.5;
      const v = (y + 0.5) / size - 0.5;
      const radius = Math.min(1, Math.hypot(u, v) * 2);
      const highlight = Math.exp(-((u + 0.2) ** 2 + (v + 0.24) ** 2) * 46);
      const rim = Math.max(0, (radius - 0.58) / 0.42);
      const offset = (y * size + x) * 4;
      surface.data[offset] = Math.round(38 + highlight * 208 + rim * 68);
      surface.data[offset + 1] = Math.round(52 + highlight * 188 + rim * 24);
      surface.data[offset + 2] = Math.round(96 + highlight * 150 + rim * 132);
      surface.data[offset + 3] = 255;
    }
  }
  return createTexture({ image: surface });
}

function createNormalTexture() {
  const size = 64;
  const surface = createSurface(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1;
      const v = ((y + 0.5) / size) * 2 - 1;
      const nx = Math.sin(u * Math.PI * 4) * 0.36;
      const ny = Math.cos(v * Math.PI * 4) * 0.36;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const offset = (y * size + x) * 4;
      surface.data[offset] = Math.round((nx * 0.5 + 0.5) * 255);
      surface.data[offset + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      surface.data[offset + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      surface.data[offset + 3] = 255;
    }
  }
  return createTexture({ colorSpace: 'linear', image: surface });
}

const standard = createStandardPbrMaterial({
  baseColor: 0x4bbce8ff,
  metallic: 0.25,
  roughness: 0.28,
});
const specularGlossiness = createSpecularGlossinessPbrMaterial({
  diffuse: 0xc05cffff,
  glossiness: 0.72,
  specular: 0xd8e7ffff,
});
const anisotropy = createAnisotropyPbrMaterial({
  anisotropyRotation: 0.7,
  anisotropyStrength: 0.9,
  standard: createStandardPbrMaterialProperties({
    baseColor: 0xd58d3aff,
    metallic: 0.78,
    roughness: 0.24,
  }),
});
const clearcoat = createClearcoatPbrMaterial({
  clearcoat: 1,
  clearcoatRoughness: 0.1,
  standard: createStandardPbrMaterialProperties({
    baseColor: 0x2b5bd7ff,
    metallic: 0.05,
    roughness: 0.5,
  }),
});
const iridescence = createIridescencePbrMaterial({
  iridescence: 1,
  iridescenceIor: 1.5,
  iridescenceThicknessMax: 520,
  iridescenceThicknessMin: 180,
  standard: createStandardPbrMaterialProperties({
    baseColor: 0x28263dff,
    metallic: 0.2,
    roughness: 0.22,
  }),
});
const sheen = createSheenPbrMaterial({
  sheenColor: 0xff73c8ff,
  sheenRoughness: 0.36,
  standard: createStandardPbrMaterialProperties({
    baseColor: 0x45205fff,
    metallic: 0,
    roughness: 0.72,
  }),
});
const specular = createSpecularPbrMaterial({
  specular: 0.85,
  specularColor: 0xb8efffff,
  standard: createStandardPbrMaterialProperties({
    baseColor: 0x159c8bff,
    metallic: 0,
    roughness: 0.32,
  }),
});
const subsurface = createSubsurfacePbrMaterial({
  standard: createStandardPbrMaterialProperties({
    baseColor: 0xe98275ff,
    metallic: 0,
    roughness: 0.55,
  }),
  subsurface: 0.82,
  subsurfaceColor: 0xffb28fff,
  thickness: 0.65,
});
const transmission = createTransmissionVolumePbrMaterial({
  attenuationColor: 0x78d9ffff,
  attenuationDistance: 2,
  ior: 1.45,
  standard: createStandardPbrMaterialProperties({
    baseColor: 0xd7f6ffff,
    metallic: 0,
    roughness: 0.08,
  }),
  thickness: 0.8,
  transmission: 0.88,
});
const blinnPhong = createBlinnPhongMaterial({
  diffuse: 0xea4f68ff,
  shininess: 72,
  specular: 0xffd8deff,
});
const lambert = createLambertMaterial({
  diffuse: 0xeab44fff,
  emissive: 0x160d00ff,
});
const phong = createPhongMaterial({
  diffuse: 0x7ed259ff,
  shininess: 64,
  specular: 0xd8ffd0ff,
});
const toon = createToonMaterial({ baseColor: 0x7d66ffff, steps: 4 });
const unlit = createUnlitMaterial({ baseColor: 0xff794dff });
const emissive = createEmissiveMaterial({ emissive: 0x35d7ffff, emissiveStrength: 1.8 });
const matcap = createMatcapMaterial({ matcap: createMatcapTexture(), tint: 0xd8b8ffff });
const normal = createNormalMaterial({ normalMap: createNormalTexture(), normalScale: 1 });
const depth = createDepthMaterial({ far: 24, near: 0.1 });
const vertexColor = createVertexColorMaterial({ tint: 0x65e6aaff });
const wireframe = createWireframeMaterial({ color: 0xf0f5ffff, thickness: 1.5 });

const entries: readonly MaterialEntry[] = [
  {
    color: '#4bbce8',
    controls: [
      createControl(
        'Metallic',
        0,
        1,
        0.01,
        () => standard.metallic,
        (value) => (standard.metallic = value),
      ),
      createControl(
        'Roughness',
        0.02,
        1,
        0.01,
        () => standard.roughness,
        (value) => (standard.roughness = value),
      ),
    ],
    material: standard,
    name: 'Standard PBR',
    setColor: (color) => (standard.baseColor = color),
  },
  {
    color: '#c05cff',
    controls: [
      createControl(
        'Glossiness',
        0,
        1,
        0.01,
        () => specularGlossiness.glossiness,
        (value) => (specularGlossiness.glossiness = value),
      ),
    ],
    material: specularGlossiness,
    name: 'Specular-glossiness',
    setColor: (color) => (specularGlossiness.diffuse = color),
  },
  {
    color: '#d58d3a',
    controls: [
      createControl(
        'Anisotropy',
        0,
        1,
        0.01,
        () => anisotropy.anisotropyStrength,
        (value) => (anisotropy.anisotropyStrength = value),
      ),
      createControl(
        'Rotation',
        0,
        Math.PI * 2,
        0.01,
        () => anisotropy.anisotropyRotation,
        (value) => (anisotropy.anisotropyRotation = value),
      ),
    ],
    material: anisotropy,
    name: 'Anisotropy PBR',
    setColor: (color) => (anisotropy.standard.baseColor = color),
  },
  {
    color: '#2b5bd7',
    controls: [
      createControl(
        'Clearcoat',
        0,
        1,
        0.01,
        () => clearcoat.clearcoat,
        (value) => (clearcoat.clearcoat = value),
      ),
      createControl(
        'Coat roughness',
        0,
        1,
        0.01,
        () => clearcoat.clearcoatRoughness,
        (value) => (clearcoat.clearcoatRoughness = value),
      ),
    ],
    material: clearcoat,
    name: 'Clearcoat PBR',
    setColor: (color) => (clearcoat.standard.baseColor = color),
  },
  {
    color: '#28263d',
    controls: [
      createControl(
        'Iridescence',
        0,
        1,
        0.01,
        () => iridescence.iridescence,
        (value) => (iridescence.iridescence = value),
      ),
      createControl(
        'Film thickness',
        100,
        800,
        1,
        () => iridescence.iridescenceThicknessMax,
        (value) => (iridescence.iridescenceThicknessMax = value),
      ),
    ],
    material: iridescence,
    name: 'Iridescence PBR',
    setColor: (color) => (iridescence.standard.baseColor = color),
  },
  {
    color: '#45205f',
    controls: [
      createControl(
        'Sheen roughness',
        0,
        1,
        0.01,
        () => sheen.sheenRoughness,
        (value) => (sheen.sheenRoughness = value),
      ),
    ],
    material: sheen,
    name: 'Sheen PBR',
    setColor: (color) => (sheen.standard.baseColor = color),
  },
  {
    color: '#159c8b',
    controls: [
      createControl(
        'Specular',
        0,
        1,
        0.01,
        () => specular.specular,
        (value) => (specular.specular = value),
      ),
    ],
    material: specular,
    name: 'Specular PBR',
    setColor: (color) => (specular.standard.baseColor = color),
  },
  {
    color: '#e98275',
    controls: [
      createControl(
        'Subsurface',
        0,
        1,
        0.01,
        () => subsurface.subsurface,
        (value) => (subsurface.subsurface = value),
      ),
      createControl(
        'Thickness',
        0,
        1,
        0.01,
        () => subsurface.thickness,
        (value) => (subsurface.thickness = value),
      ),
    ],
    material: subsurface,
    name: 'Subsurface PBR',
    setColor: (color) => (subsurface.standard.baseColor = color),
  },
  {
    color: '#d7f6ff',
    controls: [
      createControl(
        'Transmission',
        0,
        1,
        0.01,
        () => transmission.transmission,
        (value) => (transmission.transmission = value),
      ),
      createControl(
        'IOR',
        1,
        2.5,
        0.01,
        () => transmission.ior,
        (value) => (transmission.ior = value),
      ),
    ],
    material: transmission,
    name: 'Transmission volume',
    setColor: (color) => (transmission.standard.baseColor = color),
  },
  {
    color: '#ea4f68',
    controls: [
      createControl(
        'Shininess',
        1,
        128,
        1,
        () => blinnPhong.shininess,
        (value) => (blinnPhong.shininess = value),
      ),
    ],
    material: blinnPhong,
    name: 'Blinn-Phong',
    setColor: (color) => (blinnPhong.diffuse = color),
  },
  {
    color: '#eab44f',
    controls: [],
    material: lambert,
    name: 'Lambert',
    setColor: (color) => (lambert.diffuse = color),
  },
  {
    color: '#7ed259',
    controls: [
      createControl(
        'Shininess',
        1,
        128,
        1,
        () => phong.shininess,
        (value) => (phong.shininess = value),
      ),
    ],
    material: phong,
    name: 'Phong',
    setColor: (color) => (phong.diffuse = color),
  },
  {
    color: '#7d66ff',
    controls: [
      createControl(
        'Bands',
        1,
        8,
        1,
        () => toon.steps,
        (value) => (toon.steps = Math.round(value)),
      ),
    ],
    material: toon,
    name: 'Toon',
    setColor: (color) => (toon.baseColor = color),
  },
  {
    color: '#ff794d',
    controls: [],
    material: unlit,
    name: 'Unlit',
    setColor: (color) => (unlit.baseColor = color),
  },
  {
    color: '#35d7ff',
    controls: [
      createControl(
        'Intensity',
        0,
        4,
        0.01,
        () => emissive.emissiveStrength,
        (value) => (emissive.emissiveStrength = value),
      ),
    ],
    material: emissive,
    name: 'Emissive',
    setColor: (color) => (emissive.emissive = color),
  },
  {
    color: '#d8b8ff',
    controls: [],
    material: matcap,
    name: 'Matcap',
    setColor: (color) => (matcap.tint = color),
  },
  {
    color: null,
    controls: [
      createControl(
        'Normal scale',
        0,
        2,
        0.01,
        () => normal.normalScale,
        (value) => (normal.normalScale = value),
      ),
    ],
    material: normal,
    name: 'Normal',
    setColor: null,
  },
  {
    color: null,
    controls: [
      createControl(
        'Far plane',
        8,
        40,
        0.1,
        () => depth.far,
        (value) => (depth.far = value),
      ),
    ],
    material: depth,
    name: 'Depth',
    setColor: null,
  },
  {
    color: '#65e6aa',
    controls: [],
    material: vertexColor,
    name: 'Vertex color',
    setColor: (color) => (vertexColor.tint = color),
  },
  {
    color: '#f0f5ff',
    controls: [
      createControl(
        'Line width',
        0.5,
        4,
        0.1,
        () => wireframe.thickness,
        (value) => (wireframe.thickness = value),
      ),
    ],
    material: wireframe,
    name: 'Wireframe',
    setColor: (color) => (wireframe.color = color),
  },
];

const scene = createNode3D(Node3DKind);
const meshes: Mesh[] = [];
for (let index = 0; index < entries.length; index++) {
  const entry = entries[index];
  const mesh = createMesh(entry.material === vertexColor && supportsVertexColor0 ? vertexColorGeometry : geometry, [
    entry.material,
  ]);
  mesh.position.x = ((index % 5) - 2) * 1.75 - 0.7;
  mesh.position.y = (1.5 - Math.floor(index / 5)) * 1.65;
  invalidateNodeLocalTransform(mesh);
  addNodeChild(scene, mesh);
  meshes.push(mesh);
}

const camera = createCamera3D({
  far: 60,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
const cameraController = createOrbitCameraController({
  azimuth: 0,
  distance: 12.7,
  maxDistance: 18,
  minDistance: 8,
  polar: 0.03,
  smoothTime: 0.12,
  target: createVector3(-0.7, 0, 0),
});
updateOrbitCameraController(cameraController, camera, 1);

const directionalDirection = createVector3(-0.75, -0.9, -0.5);
normalizeVector3(directionalDirection, directionalDirection);
const lights: Scene3DLightsLike = {
  ambient: createAmbientLight({ color: 0x59709fff, intensity: 0.18 }),
  directional: createDirectionalLight({
    color: 0xffe4c4ff,
    direction: directionalDirection,
    intensity: 2.2,
  }),
  point: [
    createPointLight({
      color: 0x56c8ffff,
      intensity: 22,
      position: createVector3(-4, 2.8, 3),
      range: 14,
    }),
    createPointLight({
      color: 0xff5fa8ff,
      intensity: 13,
      position: createVector3(3.6, -2, 2.2),
      range: 11,
    }),
  ],
};

let selectedIndex = 0;
let dragging = false;
let previousPointerX = 0;
let previousPointerY = 0;

canvas.addEventListener('pointerdown', (event: PointerEvent) => {
  dragging = true;
  previousPointerX = event.clientX;
  previousPointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event: PointerEvent) => {
  if (!dragging) return;
  rotateOrbitCameraController(
    cameraController,
    -(event.clientX - previousPointerX) * 0.006,
    (event.clientY - previousPointerY) * 0.006,
  );
  previousPointerX = event.clientX;
  previousPointerY = event.clientY;
});

canvas.addEventListener('pointerup', (event: PointerEvent) => {
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener(
  'wheel',
  (event: WheelEvent) => {
    event.preventDefault();
    dollyOrbitCameraController(cameraController, event.deltaY * 0.006);
  },
  { passive: false },
);

const controls = document.createElement('section');
controls.className = 'controls';
controls.innerHTML =
  '<h1>Flight materials</h1><p>All 20 built-in 3D material families, rendered on the same geometry and lights. WebGPU currently falls back to tint for Matcap textures and vertex color0, and to geometric normals for Normal maps.</p>';
document.body.appendChild(controls);

const selector = document.createElement('select');
selector.setAttribute('aria-label', 'Selected material');
for (const entry of entries) {
  const option = document.createElement('option');
  option.textContent = entry.name;
  selector.appendChild(option);
}
appendField(controls, 'Material', selector);

const liveControls = document.createElement('div');
controls.appendChild(liveControls);
const hint = document.createElement('p');
hint.className = 'hint';
hint.textContent = 'Drag to orbit · wheel to zoom · selected sphere is enlarged';
controls.appendChild(hint);

selector.addEventListener('change', () => {
  selectedIndex = selector.selectedIndex;
  updateSelection();
  rebuildLiveControls();
});

function appendField(parent: HTMLElement, label: string, input: HTMLElement, value?: HTMLElement): void {
  const field = document.createElement('div');
  field.className = 'field';
  const labelElement = document.createElement('label');
  labelElement.textContent = label;
  if (value !== undefined) labelElement.appendChild(value);
  field.append(labelElement, input);
  parent.appendChild(field);
}

function parseColorInput(value: string): number {
  return ((Number.parseInt(value.slice(1), 16) << 8) | 0xff) >>> 0;
}

function rebuildLiveControls(): void {
  liveControls.replaceChildren();
  const entry = entries[selectedIndex];
  if (entry.color !== null && entry.setColor !== null) {
    const color = document.createElement('input');
    color.type = 'color';
    color.value = entry.color;
    color.addEventListener('input', () => {
      entry.color = color.value;
      entry.setColor?.(parseColorInput(color.value));
    });
    appendField(liveControls, 'Base color', color);
  }

  for (const control of entry.controls) {
    const value = document.createElement('span');
    const range = document.createElement('input');
    range.type = 'range';
    range.min = String(control.min);
    range.max = String(control.max);
    range.step = String(control.step);
    range.value = String(control.getValue());
    value.textContent = formatControlValue(control.getValue(), control.step);
    range.addEventListener('input', () => {
      const next = Number(range.value);
      control.setValue(next);
      value.textContent = formatControlValue(next, control.step);
    });
    appendField(liveControls, control.label, range, value);
  }
}

function formatControlValue(value: number, step: number): string {
  return step >= 1 ? String(Math.round(value)) : value.toFixed(step >= 0.1 ? 1 : 2);
}

function updateSelection(): void {
  for (let index = 0; index < meshes.length; index++) {
    const scaleValue = index === selectedIndex ? 1.16 : 1;
    const mesh = meshes[index];
    mesh.scale.x = scaleValue;
    mesh.scale.y = scaleValue;
    mesh.scale.z = scaleValue;
    invalidateNodeLocalTransform(mesh);
  }
}

updateSelection();
rebuildLiveControls();
render(scene, camera, lights);

const captureWindow = window as typeof window & { __flightCapture?: boolean };

let previousTime = performance.now();
function enterFrame(now: number): void {
  const deltaTime = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;
  updateOrbitCameraController(cameraController, camera, deltaTime);
  render(scene, camera, lights);
  requestAnimationFrame(enterFrame);
}

if (captureWindow.__flightCapture) {
  queueCaptureFramesAfterWarmup(1);
} else {
  requestAnimationFrame(enterFrame);
}

function queueCaptureFramesAfterWarmup(framesRemaining: number): void {
  requestAnimationFrame(() => {
    if (framesRemaining > 0) {
      queueCaptureFramesAfterWarmup(framesRemaining - 1);
      return;
    }
    for (let frame = 0; frame < 32; frame++) requestAnimationFrame(() => {});
  });
}
