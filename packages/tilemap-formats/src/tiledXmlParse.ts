import type {
  TiledCompression,
  TiledLayer,
  TiledMap,
  TiledObject,
  TiledOrientation,
  TiledParseOptions,
  TiledProperty,
  TiledPropertyType,
  TiledRenderOrder,
  TiledTileset,
  TiledTilesetRef,
  TiledTilesetTile,
  TiledTilesetTileFrame,
  Vector2Like,
} from '@flighthq/types';
import type { XmlElement } from '@flighthq/types';
import {
  getXmlElementAttribute,
  getXmlElementChildByName,
  getXmlElementChildrenByName,
  parseXmlDocument,
} from '@flighthq/xml';

import { parseTiledColor } from './tiledColor';
import { decodeTiledBase64Layer, decodeTiledCsvLayer } from './tiledLayerData';

// XML front-end of the Tiled codec: TMX maps and standalone TSX tilesets. Both are the same XML tree
// (`@flighthq/xml`), so they share the tileset/layer/object/property builders below. Numeric byte
// decoding, color, and GID handling come from the representation-independent primitives.

// Parses a standalone TSX tileset document into a `TiledTileset`, or null when the root is not a
// `<tileset>` element.
export function parseTiledTileset(text: string, _options?: Readonly<TiledParseOptions>): TiledTileset | null {
  const root = parseXmlDocument(text);
  if (root === null || root.name !== 'tileset') return null;
  return buildTiledTilesetFromXml(root);
}

// Parses a TMX map document into a faithful `TiledMap`, or null when the root is not a `<map>`
// element. A compressed tile layer with no `inflate` seam is preserved as an all-zero grid.
export function parseTiledTmx(text: string, options?: Readonly<TiledParseOptions>): TiledMap | null {
  const root = parseXmlDocument(text);
  if (root === null || root.name !== 'map') return null;

  const tilesets: TiledTilesetRef[] = [];
  for (const element of getXmlElementChildrenByName(root, 'tileset')) {
    tilesets.push(buildTiledTilesetRefFromXml(element));
  }

  const layers: TiledLayer[] = [];
  for (const element of root.children) {
    const layer = buildTiledLayerFromXml(element, options);
    if (layer !== null) layers.push(layer);
  }

  const background = getXmlElementAttribute(root, 'backgroundcolor');
  return {
    backgroundColor: background !== null ? parseTiledColor(background) : null,
    height: attrNumber(root, 'height', 0),
    infinite: attrBool(root, 'infinite', false),
    layers,
    orientation: asOrientation(getXmlElementAttribute(root, 'orientation')),
    properties: buildTiledPropertiesFromXml(root),
    renderOrder: asRenderOrder(getXmlElementAttribute(root, 'renderorder')),
    tileHeight: attrNumber(root, 'tileheight', 0),
    tileWidth: attrNumber(root, 'tilewidth', 0),
    tiledVersion: getXmlElementAttribute(root, 'tiledversion'),
    tilesets,
    version: attrString(root, 'version', '1.0'),
    width: attrNumber(root, 'width', 0),
  };
}

function attrBool(element: Readonly<XmlElement>, name: string, fallback: boolean): boolean {
  const value = getXmlElementAttribute(element, name);
  if (value === null) return fallback;
  return value === '1' || value === 'true';
}

function attrNumber(element: Readonly<XmlElement>, name: string, fallback: number): number {
  const value = getXmlElementAttribute(element, name);
  if (value === null || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function attrString(element: Readonly<XmlElement>, name: string, fallback: string): string {
  const value = getXmlElementAttribute(element, name);
  return value !== null ? value : fallback;
}

function buildTiledLayerBaseFromXml(element: Readonly<XmlElement>): {
  id: number;
  name: string;
  offsetX: number;
  offsetY: number;
  opacity: number;
  properties: readonly TiledProperty[];
  visible: boolean;
} {
  return {
    id: attrNumber(element, 'id', 0),
    name: attrString(element, 'name', ''),
    offsetX: attrNumber(element, 'offsetx', 0),
    offsetY: attrNumber(element, 'offsety', 0),
    opacity: attrNumber(element, 'opacity', 1),
    properties: buildTiledPropertiesFromXml(element),
    visible: attrBool(element, 'visible', true),
  };
}

function buildTiledLayerFromXml(
  element: Readonly<XmlElement>,
  options?: Readonly<TiledParseOptions>,
): TiledLayer | null {
  const base = buildTiledLayerBaseFromXml(element);
  if (element.name === 'layer') {
    const width = attrNumber(element, 'width', 0);
    const height = attrNumber(element, 'height', 0);
    return {
      ...base,
      data: buildTiledLayerDataFromXml(element, width, height, options),
      height,
      type: 'tilelayer',
      width,
    };
  }
  if (element.name === 'objectgroup') {
    return {
      ...base,
      objects: getXmlElementChildrenByName(element, 'object').map(buildTiledObjectFromXml),
      type: 'objectgroup',
    };
  }
  if (element.name === 'imagelayer') {
    const image = getXmlElementChildByName(element, 'image');
    return { ...base, image: image !== null ? attrString(image, 'source', '') : '', type: 'imagelayer' };
  }
  if (element.name === 'group') {
    const layers: TiledLayer[] = [];
    for (const child of element.children) {
      const layer = buildTiledLayerFromXml(child, options);
      if (layer !== null) layers.push(layer);
    }
    return { ...base, layers, type: 'group' };
  }
  return null;
}

// Decodes a `<layer>`'s `<data>` into a width*height grid of raw GIDs. Handles csv, base64
// (optionally compressed via `options.inflate`), and the uncompressed `<tile gid>` element form.
// Always returns a grid sized exactly width*height (short/failed payloads pad with 0 = empty).
function buildTiledLayerDataFromXml(
  element: Readonly<XmlElement>,
  width: number,
  height: number,
  options?: Readonly<TiledParseOptions>,
): Uint32Array {
  const grid = new Uint32Array(width * height);
  const data = getXmlElementChildByName(element, 'data');
  if (data === null) return grid;

  const encoding = getXmlElementAttribute(data, 'encoding');
  let decoded: Uint32Array | null;
  if (encoding === 'csv') {
    decoded = decodeTiledCsvLayer(data.text);
  } else if (encoding === 'base64') {
    decoded = decodeTiledBase64Layer(
      data.text,
      asCompression(getXmlElementAttribute(data, 'compression')),
      options?.inflate,
    );
  } else {
    decoded = Uint32Array.from(
      getXmlElementChildrenByName(data, 'tile').map((tile) => attrNumber(tile, 'gid', 0) >>> 0),
    );
  }
  if (decoded === null) return grid;
  grid.set(decoded.subarray(0, grid.length));
  return grid;
}

function buildTiledObjectFromXml(element: Readonly<XmlElement>): TiledObject {
  const gid = getXmlElementAttribute(element, 'gid');
  const polygon = getXmlElementChildByName(element, 'polygon');
  const polyline = getXmlElementChildByName(element, 'polyline');
  return {
    ellipse: getXmlElementChildByName(element, 'ellipse') !== null,
    gid: gid !== null ? Number(gid) >>> 0 : null,
    height: attrNumber(element, 'height', 0),
    id: attrNumber(element, 'id', 0),
    name: attrString(element, 'name', ''),
    point: getXmlElementChildByName(element, 'point') !== null,
    polygon: polygon !== null ? parseTiledPoints(attrString(polygon, 'points', '')) : null,
    polyline: polyline !== null ? parseTiledPoints(attrString(polyline, 'points', '')) : null,
    properties: buildTiledPropertiesFromXml(element),
    type: attrString(element, 'type', attrString(element, 'class', '')),
    width: attrNumber(element, 'width', 0),
    x: attrNumber(element, 'x', 0),
    y: attrNumber(element, 'y', 0),
  };
}

function buildTiledPropertiesFromXml(element: Readonly<XmlElement>): TiledProperty[] {
  const container = getXmlElementChildByName(element, 'properties');
  if (container === null) return [];
  return getXmlElementChildrenByName(container, 'property').map((property) => {
    const type = asPropertyType(getXmlElementAttribute(property, 'type'));
    const raw = getXmlElementAttribute(property, 'value') ?? property.text;
    return { name: attrString(property, 'name', ''), type, value: parsePropertyValue(type, raw) };
  });
}

function buildTiledTilesetFromXml(element: Readonly<XmlElement>): TiledTileset {
  const image = getXmlElementChildByName(element, 'image');
  return {
    columns: attrNumber(element, 'columns', 0),
    image: image !== null ? attrString(image, 'source', '') : null,
    imageHeight: image !== null ? attrNumber(image, 'height', 0) : 0,
    imageWidth: image !== null ? attrNumber(image, 'width', 0) : 0,
    margin: attrNumber(element, 'margin', 0),
    name: attrString(element, 'name', ''),
    properties: buildTiledPropertiesFromXml(element),
    spacing: attrNumber(element, 'spacing', 0),
    tileCount: attrNumber(element, 'tilecount', 0),
    tileHeight: attrNumber(element, 'tileheight', 0),
    tileWidth: attrNumber(element, 'tilewidth', 0),
    tiles: getXmlElementChildrenByName(element, 'tile').map(buildTiledTilesetTileFromXml),
  };
}

function buildTiledTilesetRefFromXml(element: Readonly<XmlElement>): TiledTilesetRef {
  const source = getXmlElementAttribute(element, 'source');
  return {
    firstGid: attrNumber(element, 'firstgid', 1),
    source,
    tileset: source !== null ? null : buildTiledTilesetFromXml(element),
  };
}

function buildTiledTilesetTileFromXml(element: Readonly<XmlElement>): TiledTilesetTile {
  const animation = getXmlElementChildByName(element, 'animation');
  const objectGroup = getXmlElementChildByName(element, 'objectgroup');
  const image = getXmlElementChildByName(element, 'image');
  const frames: TiledTilesetTileFrame[] | null =
    animation !== null
      ? getXmlElementChildrenByName(animation, 'frame').map((frame) => ({
          duration: attrNumber(frame, 'duration', 0),
          tileId: attrNumber(frame, 'tileid', 0),
        }))
      : null;
  return {
    animation: frames,
    id: attrNumber(element, 'id', 0),
    image: image !== null ? attrString(image, 'source', '') : null,
    objects:
      objectGroup !== null ? getXmlElementChildrenByName(objectGroup, 'object').map(buildTiledObjectFromXml) : null,
    properties: buildTiledPropertiesFromXml(element),
    type: attrString(element, 'type', attrString(element, 'class', '')),
  };
}

function parseTiledPoints(text: string): Vector2Like[] {
  const points: Vector2Like[] = [];
  for (const pair of text.trim().split(/\s+/)) {
    if (pair === '') continue;
    const [x, y] = pair.split(',');
    points.push({ x: Number(x) || 0, y: Number(y) || 0 });
  }
  return points;
}

function asCompression(value: string | null): TiledCompression | null {
  return value === 'gzip' || value === 'zlib' || value === 'zstd' ? value : null;
}

function asOrientation(value: string | null): TiledOrientation {
  return value === 'isometric' || value === 'staggered' || value === 'hexagonal' ? value : 'orthogonal';
}

function asPropertyType(value: string | null): TiledPropertyType {
  return value === 'int' ||
    value === 'float' ||
    value === 'bool' ||
    value === 'color' ||
    value === 'file' ||
    value === 'object'
    ? value
    : 'string';
}

function asRenderOrder(value: string | null): TiledRenderOrder {
  return value === 'right-up' || value === 'left-down' || value === 'left-up' ? value : 'right-down';
}

function parsePropertyValue(type: TiledPropertyType, raw: string): string | number | boolean {
  if (type === 'bool') return raw === 'true';
  if (type === 'int' || type === 'float') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return raw;
}
