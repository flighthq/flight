import type { Md2SectionHandler } from '@flighthq/types/contract';

import { md2AnimationHandler } from './md2AnimationHandler.ts';
import { md2SkinHandler } from './md2SkinHandler.ts';

export const md2AnimationFamily: readonly Md2SectionHandler[] = [md2AnimationHandler];

export const md2SkinFamily: readonly Md2SectionHandler[] = [md2SkinHandler];

/**
 * Every section handler Flight reads an MD2 file with — the full-support preset, which reproduces the
 * importer's complete behavior.
 *
 * ORDER IS THE PARSE ORDER, and it matters here: the skin handler appends the material index the mesh
 * binds, so it runs before the mesh is assembled, while the animation handler only appends clips. A caller
 * who wants a static textured model names `md2SkinFamily` and never links `@flighthq/animation`; one who
 * wants untextured animation names `md2AnimationFamily` and never links `@flighthq/materials`.
 */
export const md2AllSectionHandlers: readonly Md2SectionHandler[] = [...md2SkinFamily, ...md2AnimationFamily];
