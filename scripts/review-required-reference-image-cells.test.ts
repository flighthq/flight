import { describe, expect, it } from 'vitest';

import { readRequiredReferenceImageCells } from '../tools/review/src/requiredReferenceImageCells';

describe('readRequiredReferenceImageCells', () => {
  // ★ THE CASE THAT MADE THIS EXIST: effect-bokeh-dof owes a reference image on webgl, and its only other
  // cell is a declared control that review hides on purpose. With discovery driven by `.artifacts` alone,
  // a run that produced no bokeh screenshot showed the reviewer no bokeh scene at all — while the gate
  // went on failing it as `missing-reference-image`.
  it('groups required cells by scene so an uncaptured one still has a name to show', () => {
    const required = readRequiredReferenceImageCells(
      {
        subjects: {
          functional: {
            'effect-bokeh-dof/webgl': ['fingerprint', 'sceneAssertion', 'referenceImage', 'screenshot'],
            'effect-bokeh-dof/webgpu': ['fingerprint', 'sceneAssertion', 'screenshot'],
          },
        },
      },
      'functional',
    );

    expect([...required]).toEqual([['effect-bokeh-dof', ['webgl']]]);
  });

  it('collects every required renderer of one scene', () => {
    const required = readRequiredReferenceImageCells(
      {
        subjects: {
          functional: {
            'effect-motion-blur/webgl': ['referenceImage'],
            'effect-motion-blur/webgpu': ['referenceImage'],
          },
        },
      },
      'functional',
    );

    expect(required.get('effect-motion-blur')).toEqual(['webgl', 'webgpu']);
  });

  it('requires nothing from a subject that declares no reference images', () => {
    const manifest = { subjects: { functional: { 'a/webgl': ['fingerprint', 'screenshot'] } } };

    expect(readRequiredReferenceImageCells(manifest, 'functional').size).toBe(0);
    expect(readRequiredReferenceImageCells(manifest, 'examples').size).toBe(0);
    expect(readRequiredReferenceImageCells({}, 'functional').size).toBe(0);
  });

  // The renderer is the LAST segment, so a scene name is free to contain a slash; a key with no renderer
  // segment is dropped rather than turned into a scene whose renderer is the empty string.
  it('splits the renderer off the end and drops a key that has no renderer', () => {
    const required = readRequiredReferenceImageCells(
      {
        subjects: {
          functional: {
            'group/scene/webgl': ['referenceImage'],
            'no-renderer': ['referenceImage'],
            'trailing/': ['referenceImage'],
          },
        },
      },
      'functional',
    );

    expect([...required]).toEqual([['group/scene', ['webgl']]]);
  });
});
