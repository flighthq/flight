import { dirname, resolve } from 'node:path';

export function resolveExampleRenderModule(source: string, importer: string | undefined): string | undefined {
  if (source !== './render.ts' || importer === undefined) return undefined;
  const match = importer.match(/\?render=([^&]+)/);
  if (match === null) return undefined;
  return resolve(dirname(importer.split('?')[0]), `render.${match[1]}.ts`);
}
