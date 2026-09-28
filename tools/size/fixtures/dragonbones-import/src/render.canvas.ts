import { parseDragonBonesSkeleton } from '@flighthq/skeleton2d-formats';

export const skeleton = parseDragonBonesSkeleton(
  JSON.stringify({
    compatibleVersion: '5.5',
    version: '5.5',
    armature: [{ bone: [{ name: 'root' }] }],
  }),
);
