import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  createDisplayObject,
  createShape,
  createTextLabel,
  getMeshGeometryVertexPosition,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';
import { parseGltf, parseTexturePackerSpritesheet, parseTiledTmj } from '@flighthq/sdk/formats';

import { render, scale } from './render';

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

function bytesToDataUri(bytes: Readonly<Uint8Array>): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:application/octet-stream;base64,${btoa(binary)}`;
}

// Tiny synthetic fixtures keep this example self-contained. Each parser consumes the same JSON
// shape its corresponding authoring tool writes; the visuals below are derived from parsed output.
const positions = new Float32Array([-1, -0.7, 0, 1, -0.7, 0, 0, 1, 0]);
const gltfFixture = JSON.stringify({
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, max: [1, 1, 0], min: [-1, -0.7, 0], type: 'VEC3' }],
  asset: { generator: 'Flight formatloading fixture', version: '2.0' },
  bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
  buffers: [{ byteLength: positions.byteLength, uri: bytesToDataUri(new Uint8Array(positions.buffer)) }],
  meshes: [{ name: 'Flight Triangle', primitives: [{ attributes: { POSITION: 0 } }] }],
  nodes: [{ mesh: 0, name: 'Triangle Node' }],
  scene: 0,
  scenes: [{ name: 'Fixture Scene3D', nodes: [0] }],
});

const texturePackerFixture = JSON.stringify({
  frames: {
    'idle.png': {
      frame: { h: 64, w: 56, x: 0, y: 0 },
      pivot: { x: 0.5, y: 1 },
      rotated: false,
      sourceSize: { h: 64, w: 64 },
      spriteSourceSize: { h: 64, w: 56, x: 4, y: 0 },
      trimmed: true,
    },
    'jump.png': {
      frame: { h: 64, w: 64, x: 56, y: 0 },
      rotated: false,
      sourceSize: { h: 64, w: 64 },
      spriteSourceSize: { h: 64, w: 64, x: 0, y: 0 },
      trimmed: false,
    },
    'spark.png': {
      frame: { h: 32, w: 32, x: 0, y: 64 },
      rotated: false,
      sourceSize: { h: 32, w: 32 },
      spriteSourceSize: { h: 32, w: 32, x: 0, y: 0 },
      trimmed: false,
    },
  },
  meta: {
    app: 'https://www.codeandweb.com/texturepacker',
    format: 'RGBA8888',
    frameTags: [{ direction: 'forward', from: 0, name: 'hero', to: 1 }],
    image: 'atlas.png',
    scale: 1,
    size: { h: 96, w: 128 },
    version: '1.0',
  },
});

const tiledFixture = JSON.stringify({
  height: 5,
  infinite: false,
  layers: [
    {
      data: [1, 1, 2, 2, 1, 1, 1, 3, 3, 2, 2, 1, 4, 4, 3, 3, 2, 2, 4, 4, 4, 3, 3, 2, 4, 4, 4, 4, 3, 3],
      height: 5,
      id: 1,
      name: 'terrain',
      type: 'tilelayer',
      width: 6,
    },
  ],
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tiledversion: '1.10.2',
  tileheight: 32,
  tilesets: [
    {
      columns: 4,
      firstgid: 1,
      image: 'terrain.png',
      imageheight: 32,
      imagewidth: 128,
      name: 'terrain',
      tilecount: 4,
      tileheight: 32,
      tilewidth: 32,
    },
  ],
  tilewidth: 32,
  type: 'map',
  version: '1.10',
  width: 6,
});

const gltf = parseGltf(gltfFixture);
const spritesheet = parseTexturePackerSpritesheet(texturePackerFixture);
const tiled = parseTiledTmj(tiledFixture);

function addLabel(text: string, x: number, y: number, size: number, color: number): void {
  const label = createTextLabel();
  label.data.text = text;
  label.data.textFormat = { font: 'sans-serif', size, color };
  label.x = x;
  label.y = y;
  invalidateNodeLocalTransform(label);
  addNodeChild(root, label);
}

function addPanel(x: number, accent: number): void {
  const panel = createShape();
  appendShapeBeginFill(panel, 0x192438ff);
  appendShapeRectangle(panel, x, 96, 232, 390);
  appendShapeEndFill(panel);
  appendShapeBeginFill(panel, accent);
  appendShapeRectangle(panel, x, 96, 232, 5);
  appendShapeEndFill(panel);
  addNodeChild(root, panel);
}

addLabel('Standard Format Loading', 24, 20, 28, 0xf4f7fbff);
addLabel('Three authoring formats parsed through @flighthq/sdk/formats', 25, 57, 15, 0x91a4bfff);

addPanel(24, 0x61dafbff);
addPanel(284, 0xffc857ff);
addPanel(544, 0x55d187ff);

addLabel('glTF 2.0', 42, 118, 20, 0x61dafbff);
addLabel('mesh geometry', 42, 146, 13, 0xaebbd0ff);

const gltfShape = createShape();
const geometry = gltf.meshes[0]?.geometry;
const vertex = { x: 0, y: 0, z: 0 };
const projected: { x: number; y: number }[] = [];
if (geometry !== undefined) {
  for (let i = 0; i < 3; i++) {
    if (getMeshGeometryVertexPosition(vertex, geometry, i)) {
      projected.push({ x: 140 + vertex.x * 78, y: 280 - vertex.y * 78 });
    }
  }
}
if (projected.length === 3) {
  appendShapeBeginFill(gltfShape, 0x3478c9ff, 0.75);
  appendShapeMoveTo(gltfShape, projected[0].x, projected[0].y);
  appendShapeLineTo(gltfShape, projected[1].x, projected[1].y);
  appendShapeLineTo(gltfShape, projected[2].x, projected[2].y);
  appendShapeLineTo(gltfShape, projected[0].x, projected[0].y);
  appendShapeEndFill(gltfShape);
  appendShapeLineStyle(gltfShape, 3, 0x8ee7ffff);
  appendShapeMoveTo(gltfShape, projected[0].x, projected[0].y);
  appendShapeLineTo(gltfShape, projected[1].x, projected[1].y);
  appendShapeLineTo(gltfShape, projected[2].x, projected[2].y);
  appendShapeLineTo(gltfShape, projected[0].x, projected[0].y);
}
addNodeChild(root, gltfShape);
addLabel(`${gltf.meshes.length} mesh • 3 vertices`, 42, 414, 14, 0xd7e3f4ff);
addLabel(`${gltf.nodes.length} node • ${gltf.scenes.length} scene`, 42, 440, 13, 0x8fa3bfff);

addLabel('TexturePacker', 302, 118, 20, 0xffc857ff);
addLabel('JSON atlas', 302, 146, 13, 0xaebbd0ff);

const atlasShape = createShape();
const atlasX = 310;
const atlasY = 190;
const atlasScale = 1.55;
appendShapeBeginFill(atlasShape, 0x0f1726ff);
appendShapeRectangle(
  atlasShape,
  atlasX,
  atlasY,
  spritesheet.imageWidth * atlasScale,
  spritesheet.imageHeight * atlasScale,
);
appendShapeEndFill(atlasShape);
const frameColors = [0xf08a5dff, 0xf9c74fff, 0x9b5de5ff];
for (let i = 0; i < spritesheet.frames.length; i++) {
  const frame = spritesheet.frames[i];
  appendShapeBeginFill(atlasShape, frameColors[i], 0.88);
  appendShapeRectangle(
    atlasShape,
    atlasX + frame.x * atlasScale,
    atlasY + frame.y * atlasScale,
    frame.width * atlasScale,
    frame.height * atlasScale,
  );
  appendShapeEndFill(atlasShape);
  appendShapeLineStyle(atlasShape, 1, 0xffffffff, 0.55);
  appendShapeRectangle(
    atlasShape,
    atlasX + frame.x * atlasScale,
    atlasY + frame.y * atlasScale,
    frame.width * atlasScale,
    frame.height * atlasScale,
  );
}
addNodeChild(root, atlasShape);
addLabel(`${spritesheet.frames.length} frames • ${spritesheet.animations.length} animation`, 302, 414, 14, 0xd7e3f4ff);
addLabel(`${spritesheet.imageWidth}×${spritesheet.imageHeight} atlas`, 302, 440, 13, 0x8fa3bfff);

addLabel('Tiled TMJ', 562, 118, 20, 0x55d187ff);
addLabel('orthogonal tilemap', 562, 146, 13, 0xaebbd0ff);

const tileLayer = tiled?.layers.find((layer) => layer.type === 'tilelayer');
const tileShape = createShape();
const tileColors = [0x3f8f5fff, 0x4b84c6ff, 0xd9ad4aff, 0x80664bff];
const cellSize = 30;
const mapX = 570;
const mapY = 190;
if (tileLayer !== undefined) {
  for (let row = 0; row < tileLayer.height; row++) {
    for (let col = 0; col < tileLayer.width; col++) {
      const gid = tileLayer.data[row * tileLayer.width + col];
      appendShapeBeginFill(tileShape, tileColors[Math.max(0, gid - 1)]);
      appendShapeRectangle(tileShape, mapX + col * cellSize, mapY + row * cellSize, cellSize - 2, cellSize - 2);
      appendShapeEndFill(tileShape);
    }
  }
}
addNodeChild(root, tileShape);
addLabel(
  `${tiled?.width ?? 0}×${tiled?.height ?? 0} map • ${tileLayer?.name ?? 'no tile layer'}`,
  562,
  414,
  14,
  0xd7e3f4ff,
);
addLabel(`${tiled?.tilesets.length ?? 0} tileset • ${tileLayer?.data.length ?? 0} cells`, 562, 440, 13, 0x8fa3bfff);

addLabel('✓ parsed', 42, 520, 15, 0x61dafbff);
addLabel('✓ parsed', 302, 520, 15, 0xffc857ff);
addLabel('✓ parsed', 562, 520, 15, 0x55d187ff);
addLabel('Self-contained fixtures • no network required', 255, 564, 13, 0x71839dff);

function enterFrame(): void {
  render(root);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
