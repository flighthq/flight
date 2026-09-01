import { parseToolPipelineConfig } from './pipelineConfig';

describe('parseToolPipelineConfig', () => {
  it('accepts the strict version-1 shape and normalizes groups without reordering assets', () => {
    const config = parseToolPipelineConfig(
      JSON.stringify({
        assets: [
          { groups: ['z', 'a', 'z'], id: 'second', source: 'images/hero.PNG', type: 'image' },
          { id: 'first', source: 'data/scene.bin', type: 'scene' },
        ],
        schemaVersion: 1,
      }),
      'fixture.json',
    );

    expect(config).toEqual({
      assets: [
        { groups: ['a', 'z'], id: 'second', source: 'images/hero.PNG', type: 'image' },
        { id: 'first', source: 'data/scene.bin', type: 'scene' },
      ],
      schemaVersion: 1,
    });
  });

  it('rejects missing or unsupported schema versions and unknown fields', () => {
    expect(() => parseToolPipelineConfig('{"assets":[]}', 'missing.json')).toThrow(
      'missing.json: schemaVersion must equal 1',
    );
    expect(() => parseToolPipelineConfig('{"assets":[],"schemaVersion":2}', 'newer.json')).toThrow(
      'newer.json: schemaVersion must equal 1',
    );
    expect(() => parseToolPipelineConfig('{"assets":[],"schemaVersion":1,"watch":true}', 'unknown.json')).toThrow(
      'unknown.json: unknown field "watch"',
    );
    expect(() =>
      parseToolPipelineConfig(
        '{"assets":[{"id":"a","source":"a.bin","transform":"copy","type":"data"}],"schemaVersion":1}',
        'asset-unknown.json',
      ),
    ).toThrow('asset-unknown.json: assets[0]: unknown field "transform"');
  });

  it.each(['/absolute.png', '../escape.png', './local.png', 'nested//file.png', 'nested\\file.png', 'C:/file.png'])(
    'rejects non-portable source path %s',
    (source) => {
      expect(() =>
        parseToolPipelineConfig(
          JSON.stringify({ assets: [{ id: 'asset', source, type: 'image' }], schemaVersion: 1 }),
          'paths.json',
        ),
      ).toThrow('paths.json: assets[0].source must be a portable relative path');
    },
  );

  it('rejects duplicate IDs and empty scalar/group values', () => {
    expect(() =>
      parseToolPipelineConfig(
        JSON.stringify({
          assets: [
            { id: 'same', source: 'a.bin', type: 'data' },
            { id: 'same', source: 'b.bin', type: 'data' },
          ],
          schemaVersion: 1,
        }),
        'duplicates.json',
      ),
    ).toThrow('duplicates.json: duplicate asset id "same"');
    expect(() =>
      parseToolPipelineConfig(
        JSON.stringify({ assets: [{ groups: [''], id: 'asset', source: 'a.bin', type: 'data' }], schemaVersion: 1 }),
        'groups.json',
      ),
    ).toThrow('groups.json: assets[0].groups must contain non-empty strings');
    expect(() =>
      parseToolPipelineConfig(
        JSON.stringify({ assets: [{ id: '', source: 'a.bin', type: 'data' }], schemaVersion: 1 }),
        'id.json',
      ),
    ).toThrow('id.json: assets[0].id must be a non-empty string');
  });
});
