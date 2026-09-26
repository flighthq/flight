import type { Md5SectionHandler } from '@flighthq/types/contract';

import { md5MaterialHandler } from './md5MaterialHandler.ts';
import { md5SkeletonHandler } from './md5SkeletonHandler.ts';

export const md5MaterialFamily: readonly Md5SectionHandler[] = [md5MaterialHandler];

export const md5SkeletonFamily: readonly Md5SectionHandler[] = [md5SkeletonHandler];

/**
 * Every section handler Flight reads an MD5 mesh file with — the full-support preset, which reproduces the
 * importer's complete behavior.
 *
 * The two run at DIFFERENT dispatch points (skeleton once per file, material once per `mesh { }` block), so
 * their relative order in this array does not decide which runs first — the parser's two dispatch points do.
 * A caller who wants untextured posable geometry names `md5SkeletonFamily` and never links
 * `@flighthq/materials`; one who wants a static textured bind pose names `md5MaterialFamily`.
 */
export const md5AllSectionHandlers: readonly Md5SectionHandler[] = [...md5SkeletonFamily, ...md5MaterialFamily];
