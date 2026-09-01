import type { AssetType } from '@flighthq/types/contract';

export const TOOL_PIPELINE_CONFIG_SCHEMA_VERSION = 1;

export interface ToolPipelineConfig {
  readonly assets: readonly Readonly<ToolPipelineSource>[];
  readonly schemaVersion: 1;
}

export interface ToolPipelineSource {
  readonly groups?: readonly string[];
  readonly id: string;
  readonly source: string;
  readonly type: AssetType;
}

export function parseToolPipelineConfig(
  source: string,
  sourceName: string = 'tool pipeline config',
): ToolPipelineConfig {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`${sourceName}: invalid JSON`);
  }
  if (!isRecord(value)) throw new Error(`${sourceName}: config must be an object`);
  assertKnownFields(value, ['assets', 'schemaVersion'], sourceName);
  if (value['schemaVersion'] !== TOOL_PIPELINE_CONFIG_SCHEMA_VERSION) {
    throw new Error(`${sourceName}: schemaVersion must equal ${TOOL_PIPELINE_CONFIG_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(value['assets'])) throw new Error(`${sourceName}: assets must be an array`);

  const ids = new Set<string>();
  const assets: ToolPipelineSource[] = [];
  for (let index = 0; index < value['assets'].length; index++) {
    const input = value['assets'][index];
    const label = `${sourceName}: assets[${index}]`;
    if (!isRecord(input)) throw new Error(`${label} must be an object`);
    assertKnownFields(input, ['groups', 'id', 'source', 'type'], label);

    const id = input['id'];
    const assetSource = input['source'];
    const type = input['type'];
    if (typeof id !== 'string' || id.length === 0) throw new Error(`${label}.id must be a non-empty string`);
    if (ids.has(id)) throw new Error(`${sourceName}: duplicate asset id "${id}"`);
    ids.add(id);
    if (typeof assetSource !== 'string' || !isPortableRelativePath(assetSource)) {
      throw new Error(`${label}.source must be a portable relative path`);
    }
    if (typeof type !== 'string' || type.length === 0) throw new Error(`${label}.type must be a non-empty string`);

    const groups = input['groups'];
    if (
      groups !== undefined &&
      (!Array.isArray(groups) || groups.some((group) => typeof group !== 'string' || group.length === 0))
    ) {
      throw new Error(`${label}.groups must contain non-empty strings`);
    }
    const normalizedGroups = groups === undefined ? [] : [...new Set(groups as string[])].sort(compareCodeUnits);
    assets.push({
      ...(normalizedGroups.length > 0 ? { groups: normalizedGroups } : {}),
      id,
      source: assetSource,
      type: type as AssetType,
    });
  }
  return { assets, schemaVersion: TOOL_PIPELINE_CONFIG_SCHEMA_VERSION };
}

function assertKnownFields(value: Readonly<Record<string, unknown>>, fields: readonly string[], label: string): void {
  const known = new Set(fields);
  const unknown = Object.keys(value)
    .filter((field) => !known.has(field))
    .sort(compareCodeUnits)[0];
  if (unknown !== undefined) throw new Error(`${label}: unknown field "${unknown}"`);
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isPortableRelativePath(value: string): boolean {
  if (value.length === 0 || value.startsWith('/') || value.includes('\\') || /^[A-Za-z]:/.test(value)) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
