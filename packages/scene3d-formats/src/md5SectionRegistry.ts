import type { Md5SectionHandler } from '@flighthq/types/contract';

import { md5MaterialFamily } from './md5MaterialHandler.ts';
import { md5SkeletonFamily } from './md5SkeletonHandler.ts';

/**
 * Every section handler Flight reads an MD5 mesh file with — the full-support preset, which reproduces the
 * importer's complete behavior.
 *
 * ★ THIS FILE IS THE PRESET AND NOTHING ELSE. Each family constant now lives beside the handler it names, because while
 * both sat here a caller naming `md5SkeletonFamily` imported this module and linked the material handler too — 8,392
 * measured bytes (65,336 → 56,944), including `@flighthq/materials`, for a family they had declined. The material
 * family alone paid the larger half of it back: 65,336 → 53,761. Importing THIS module still costs
 * both, which is what asking for everything means.
 *
 * The two run at DIFFERENT dispatch points (skeleton once per file, material once per `mesh { }` block), so
 * their relative order in this array does not decide which runs first — the parser's two dispatch points do.
 * A caller who wants untextured posable geometry names `md5SkeletonFamily` and never links
 * `@flighthq/materials`; one who wants a static textured bind pose names `md5MaterialFamily`.
 */
export const md5AllSectionHandlers: readonly Md5SectionHandler[] = [...md5SkeletonFamily, ...md5MaterialFamily];
