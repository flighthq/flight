import type { Md5SectionHandler } from '@flighthq/types/contract';
import { MD5_SKELETON_FEATURE } from '@flighthq/types/contract';

import { buildMd5SkeletonDocument } from './md5Parse.ts';

/**
 * Emits the `joints { }` block as the document's skeleton — a group node plus one node per joint — and the
 * skin every mesh section binds.
 *
 * ★ THIS ONE IS A CONTENT TOGGLE, NOT A DEPENDENCY BOUNDARY, and the distinction is worth stating because
 * the other MD5 handler is the opposite. Omitting the material handler drops `@flighthq/materials` from the
 * build; omitting this one drops no package at all, since the geometry path needs `@flighthq/geometry`
 * either way. What it drops is the joint nodes and the skin, which is the right choice for a caller who
 * wants the bind pose as static geometry and will never pose it.
 *
 * It records the skin index on the context because the meshes are assembled at a later dispatch point and
 * have to read it back.
 */
export const md5SkeletonHandler: Readonly<Md5SectionHandler> = {
  collect(context) {
    if (context.joints.length === 0) return;
    context.skin = context.document.skins.length;
    context.document.skins.push(buildMd5SkeletonDocument(context.joints, context.document, context.drops));
  },
  feature: MD5_SKELETON_FEATURE,
};
