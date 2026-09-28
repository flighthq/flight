import type { Md2SectionHandler } from '@flighthq/types/contract';

import { md2AnimationFamily } from './md2AnimationHandler.ts';
import { md2SkinFamily } from './md2SkinHandler.ts';

/**
 * Every section handler Flight reads an MD2 file with — the full-support preset, which reproduces the
 * importer's complete behavior.
 *
 * ★ THIS FILE IS THE PRESET AND NOTHING ELSE. Each family constant now lives beside the handler it names, because while
 * both sat here a caller naming one family imported this module and linked the other's handler with it. Importing THIS
 * module still costs both, which is what asking for everything means.
 *
 * ORDER IS THE PARSE ORDER, and it matters here: the skin handler appends the material index the mesh
 * binds, so it runs before the mesh is assembled, while the animation handler only appends clips. A caller
 * who wants a static textured model names `md2SkinFamily` and never links `@flighthq/animation`; one who
 * wants untextured animation names `md2AnimationFamily` and never links `@flighthq/materials`.
 */
export const md2AllSectionHandlers: readonly Md2SectionHandler[] = [...md2SkinFamily, ...md2AnimationFamily];
