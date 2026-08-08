import { probeMd5Sections } from './md5-section-probe';

describe('probeMd5Sections', () => {
  it('independently reconciles a mesh file and its indexed body records', () => {
    const probe = probeMd5Sections(
      [
        'MD5Version 10',
        'commandline "mesh // comment marker inside quotes"',
        'numJoints 1',
        'numMeshes 1',
        'joints',
        '{',
        '  "root" -1 ( 0 0 0 ) ( 0 0 0 ) // root joint',
        '}',
        'mesh {',
        '  shader "textures/example"',
        '  numverts 2',
        '  vert 0 ( 0 0 ) 0 1',
        '  vert 1 ( 1 0 ) 1 1',
        '  numtris 1',
        '  tri 0 0 1 0',
        '  numweights 2',
        '  weight 0 0 1 ( 0 0 0 )',
        '  weight 1 0 1e-1 ( -2.5 0 +3 )',
        '}',
      ].join('\n'),
    );

    expect(probe.kind).toBe('mesh');
    if (probe.kind !== 'mesh') throw new Error('expected mesh probe');
    expect(probe.declarationsReconciled).toBe(true);
    expect(probe.version).toEqual({ malformed: 0, occurrences: 1, value: 10 });
    expect(probe.declarations).toEqual({
      joints: { malformed: 0, occurrences: 1, value: 1 },
      meshes: { malformed: 0, occurrences: 1, value: 1 },
    });
    expect(probe.sections.joints).toEqual({
      blocks: 1,
      closedBlocks: 1,
      malformedOpeners: 0,
      malformedRecords: 0,
      records: 1,
    });
    expect(probe.sections.meshes[0]).toMatchObject({
      closed: true,
      declarationsReconciled: true,
      triangles: { indices: [0], malformedRecords: 0, records: 1, sequential: true },
      vertices: { indices: [0, 1], malformedRecords: 0, records: 2, sequential: true },
      weights: { indices: [0, 1], malformedRecords: 0, records: 2, sequential: true },
    });
  });

  it('reports mesh declaration, syntax, index, and closure disagreements without importer recovery', () => {
    const probe = probeMd5Sections(
      [
        'MD5Version 10',
        'numJoints 2',
        'numMeshes 1',
        'joints {',
        '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
        '  not-a-joint',
        '}',
        'mesh {',
        '  numverts 2',
        '  vert 1 ( 0 0 ) 0 1',
        '  vert nope',
        '  numtris 0',
        '  numweights 0',
      ].join('\n'),
    );

    expect(probe.kind).toBe('mesh');
    if (probe.kind !== 'mesh') throw new Error('expected mesh probe');
    expect(probe.declarationsReconciled).toBe(false);
    expect(probe.sections.joints).toMatchObject({ malformedRecords: 1, records: 1 });
    expect(probe.sections.meshes[0]).toMatchObject({
      closed: false,
      declarationsReconciled: false,
      vertices: {
        declaration: { malformed: 0, occurrences: 1, value: 2 },
        indices: [1],
        malformedRecords: 1,
        records: 1,
        sequential: false,
      },
    });
  });

  it('reconciles animation hierarchy, baseframe, frame count, and frame widths', () => {
    const probe = probeMd5Sections(
      [
        'MD5Version 10',
        'numFrames 2',
        'numJoints 1',
        'frameRate 24',
        'numAnimatedComponents 2',
        'hierarchy {',
        '  "root" -1 3 0',
        '}',
        'bounds {',
        '  ( -1 -1 -1 ) ( 1 1 1 )',
        '}',
        'baseframe {',
        '  ( 0 0 0 ) ( 0 0 0 )',
        '}',
        'frame 0 {',
        '  0 0',
        '}',
        'frame 1',
        '{',
        '  1.5 -2e-1',
        '}',
      ].join('\n'),
    );

    expect(probe.kind).toBe('anim');
    if (probe.kind !== 'anim') throw new Error('expected anim probe');
    expect(probe.declarationsReconciled).toBe(true);
    expect(probe.declarations).toEqual({
      animatedComponents: { malformed: 0, occurrences: 1, value: 2 },
      frames: { malformed: 0, occurrences: 1, value: 2 },
      joints: { malformed: 0, occurrences: 1, value: 1 },
    });
    expect(probe.sections.hierarchy).toMatchObject({ closedBlocks: 1, malformedRecords: 0, records: 1 });
    expect(probe.sections.baseframe).toMatchObject({ closedBlocks: 1, malformedRecords: 0, records: 1 });
    expect(probe.sections.frames).toEqual([
      { closed: true, index: 0, malformedValues: 0, values: 2 },
      { closed: true, index: 1, malformedValues: 0, values: 2 },
    ]);
  });

  it('reports animation count, frame-order, malformed-value, and opener disagreements', () => {
    const probe = probeMd5Sections(
      [
        'MD5Version 10',
        'numFrames 2',
        'numJoints 2',
        'numAnimatedComponents 2',
        'hierarchy {',
        '  "root" -1 3 0',
        '}',
        'baseframe missing-brace',
        'frame 1 {',
        '  0 nope',
        '}',
      ].join('\n'),
    );

    expect(probe.kind).toBe('anim');
    if (probe.kind !== 'anim') throw new Error('expected anim probe');
    expect(probe.declarationsReconciled).toBe(false);
    expect(probe.sections.baseframe).toMatchObject({ blocks: 0, malformedOpeners: 1, records: 0 });
    expect(probe.sections.frames).toEqual([{ closed: true, index: 1, malformedValues: 1, values: 1 }]);
  });

  it('does not guess between absent and conflicting MD5 format signals', () => {
    expect(probeMd5Sections('MD5Version 10\nnumJoints 1')).toEqual({
      kind: 'unknown',
      declarationsReconciled: false,
      version: { malformed: 0, occurrences: 1, value: 10 },
    });
    expect(probeMd5Sections('MD5Version 10\nnumMeshes 0\nnumFrames 0')).toMatchObject({
      kind: 'unknown',
      declarationsReconciled: false,
    });
  });

  it('requires one supported version declaration rather than accepting duplicate or malformed headers', () => {
    const duplicate = probeMd5Sections('MD5Version 10\nMD5Version 10\nnumJoints 0\nnumMeshes 0\njoints {\n}');
    const unsupported = probeMd5Sections('MD5Version 11\nnumJoints 0\nnumMeshes 0\njoints {\n}');

    expect(duplicate).toMatchObject({
      kind: 'mesh',
      declarationsReconciled: false,
      version: { malformed: 0, occurrences: 2, value: null },
    });
    expect(unsupported).toMatchObject({
      kind: 'mesh',
      declarationsReconciled: false,
      version: { malformed: 0, occurrences: 1, value: 11 },
    });
  });
});
