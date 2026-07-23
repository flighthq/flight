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

import { parseTiledColor } from './tiledColor';
import { decodeTiledBase64Layer, decodeTiledCsvLayer } from './tiledLayerData';

// JSON front-end of the Tiled codec: TMJ maps and standalone TSJ tilesets. The same DTO builders as
// the XML front-end, walking a parsed JSON tree instead of an XML one.

// Parses a standalone TSJ tileset document into a `TiledTileset`, or null on malformed JSON.
export function parseTiledTilesetJson(text: string, _options?: Readonly<TiledParseOptions>): TiledTileset | null {
  const root = parseJson(text);
  if (root === null) return null;
  return buildTiledTilesetFromJson(root);
}

// Parses a TMJ map document into a faithful `TiledMap`, or null on malformed JSON. A compressed tile
// layer with no `inflate` seam is preserved as an all-zero grid.
export function parseTiledTmj(text: string, options?: Readonly<TiledParseOptions>): TiledMap | null {
  const root = parseJson(text);
  if (root === null) return null;

  const background = strField(root, 'backgroundcolor');
  return {
    backgroundColor: background !== null ? parseTiledColor(background) : null,
    height: numField(root, 'height', 0),
    infinite: boolField(root, 'infinite', false),
    layers: arrayField(root, 'layers')
      .map((layer) => buildTiledLayerFromJson(layer, options))
      .filter((layer): layer is TiledLayer => layer !== null),
    orientation: asOrientation(strField(root, 'orientation')),
    properties: buildTiledPropertiesFromJson(root),
    renderOrder: asRenderOrder(strField(root, 'renderorder')),
    tileHeight: numField(root, 'tileheight', 0),
    tileWidth: numField(root, 'tilewidth', 0),
    tiledVersion: strField(root, 'tiledversion'),
    tilesets: arrayField(root, 'tilesets').map(buildTiledTilesetRefFromJson),
    version: stringOr(numOrString(root.version), '1.0'),
    width: numField(root, 'width', 0),
  };
}

function arrayField(obj: JsonObject, key: string): JsonObject[] {
  const value = obj[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isJsonObject);
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

function boolField(obj: JsonObject, key: string, fallback: boolean): boolean {
  const value = obj[key];
  return typeof value === 'boolean' ? value : fallback;
}

function buildTiledLayerBaseFromJson(obj: JsonObject): {
  id: number;
  name: string;
  offsetX: number;
  offsetY: number;
  opacity: number;
  properties: readonly TiledProperty[];
  visible: boolean;
} {
  return {
    id: numField(obj, 'id', 0),
    name: strField(obj, 'name') ?? '',
    offsetX: numField(obj, 'offsetx', 0),
    offsetY: numField(obj, 'offsety', 0),
    opacity: numField(obj, 'opacity', 1),
    properties: buildTiledPropertiesFromJson(obj),
    visible: boolField(obj, 'visible', true),
  };
}

function buildTiledLayerDataFromJson(
  obj: JsonObject,
  width: number,
  height: number,
  options?: Readonly<TiledParseOptions>,
): Uint32Array {
  const grid = new Uint32Array(width * height);
  const data = obj.data;
  let decoded: Uint32Array | null = null;
  if (Array.isArray(data)) {
    decoded = Uint32Array.from(data, (v) => (typeof v === 'number' ? v >>> 0 : 0));
  } else if (typeof data === 'string') {
    decoded =
      strField(obj, 'encoding') === 'csv'
        ? decodeTiledCsvLayer(data)
        : decodeTiledBase64Layer(data, asCompression(strField(obj, 'compression')), options?.inflate);
  }
  if (decoded === null) return grid;
  grid.set(decoded.subarray(0, grid.length));
  return grid;
}

function buildTiledLayerFromJson(obj: JsonObject, options?: Readonly<TiledParseOptions>): TiledLayer | null {
  const base = buildTiledLayerBaseFromJson(obj);
  const type = strField(obj, 'type');
  if (type === 'tilelayer') {
    const width = numField(obj, 'width', 0);
    const height = numField(obj, 'height', 0);
    return {
      ...base,
      data: buildTiledLayerDataFromJson(obj, width, height, options),
      height,
      type: 'tilelayer',
      width,
    };
  }
  if (type === 'objectgroup') {
    return { ...base, objects: arrayField(obj, 'objects').map(buildTiledObjectFromJson), type: 'objectgroup' };
  }
  if (type === 'imagelayer') {
    return { ...base, image: strField(obj, 'image') ?? '', type: 'imagelayer' };
  }
  if (type === 'group') {
    return {
      ...base,
      layers: arrayField(obj, 'layers')
        .map((layer) => buildTiledLayerFromJson(layer, options))
        .filter((layer): layer is TiledLayer => layer !== null),
      type: 'group',
    };
  }
  return null;
}

function buildTiledObjectFromJson(obj: JsonObject): TiledObject {
  const gid = obj.gid;
  return {
    ellipse: boolField(obj, 'ellipse', false),
    gid: typeof gid === 'number' ? gid >>> 0 : null,
    height: numField(obj, 'height', 0),
    id: numField(obj, 'id', 0),
    name: strField(obj, 'name') ?? '',
    point: boolField(obj, 'point', false),
    polygon: parsePointsField(obj, 'polygon'),
    polyline: parsePointsField(obj, 'polyline'),
    properties: buildTiledPropertiesFromJson(obj),
    type: strField(obj, 'type') ?? strField(obj, 'class') ?? '',
    width: numField(obj, 'width', 0),
    x: numField(obj, 'x', 0),
    y: numField(obj, 'y', 0),
  };
}

function buildTiledPropertiesFromJson(obj: JsonObject): TiledProperty[] {
  return arrayField(obj, 'properties').map((property) => {
    const type = asPropertyType(strField(property, 'type'));
    const raw = property.value;
    return { name: strField(property, 'name') ?? '', type, value: coercePropertyValue(type, raw) };
  });
}

function buildTiledTilesetFromJson(obj: JsonObject): TiledTileset {
  return {
    columns: numField(obj, 'columns', 0),
    image: strField(obj, 'image'),
    imageHeight: numField(obj, 'imageheight', 0),
    imageWidth: numField(obj, 'imagewidth', 0),
    margin: numField(obj, 'margin', 0),
    name: strField(obj, 'name') ?? '',
    properties: buildTiledPropertiesFromJson(obj),
    spacing: numField(obj, 'spacing', 0),
    tileCount: numField(obj, 'tilecount', 0),
    tileHeight: numField(obj, 'tileheight', 0),
    tileWidth: numField(obj, 'tilewidth', 0),
    tiles: arrayField(obj, 'tiles').map(buildTiledTilesetTileFromJson),
  };
}

function buildTiledTilesetRefFromJson(obj: JsonObject): TiledTilesetRef {
  const source = strField(obj, 'source');
  return {
    firstGid: numField(obj, 'firstgid', 1),
    source,
    tileset: source !== null ? null : buildTiledTilesetFromJson(obj),
  };
}

function buildTiledTilesetTileFromJson(obj: JsonObject): TiledTilesetTile {
  const animation = obj.animation;
  const objectGroup = isJsonObject(obj.objectgroup) ? obj.objectgroup : null;
  const frames: TiledTilesetTileFrame[] | null = Array.isArray(animation)
    ? animation
        .filter(isJsonObject)
        .map((frame) => ({ duration: numField(frame, 'duration', 0), tileId: numField(frame, 'tileid', 0) }))
    : null;
  return {
    animation: frames,
    id: numField(obj, 'id', 0),
    image: strField(obj, 'image'),
    objects: objectGroup !== null ? arrayField(objectGroup, 'objects').map(buildTiledObjectFromJson) : null,
    properties: buildTiledPropertiesFromJson(obj),
    type: strField(obj, 'type') ?? strField(obj, 'class') ?? '',
  };
}

function coercePropertyValue(type: TiledPropertyType, raw: unknown): string | number | boolean {
  if (type === 'bool') return raw === true;
  if (type === 'int' || type === 'float') return typeof raw === 'number' ? raw : 0;
  return typeof raw === 'string' ? raw : String(raw ?? '');
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numField(obj: JsonObject, key: string, fallback: number): number {
  const value = obj[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numOrString(value: unknown): string | number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  return null;
}

function parseJson(text: string): JsonObject | null {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  return isJsonObject(root) ? root : null;
}

function parsePointsField(obj: JsonObject, key: string): Vector2Like[] | null {
  const value = obj[key];
  if (!Array.isArray(value)) return null;
  return value.filter(isJsonObject).map((point) => ({ x: numField(point, 'x', 0), y: numField(point, 'y', 0) }));
}

function stringOr(value: string | number | null, fallback: string): string {
  if (value === null) return fallback;
  return typeof value === 'number' ? String(value) : value;
}

function strField(obj: JsonObject, key: string): string | null {
  const value = obj[key];
  return typeof value === 'string' ? value : null;
}

type JsonObject = Record<string, unknown>;
