import { checkLicenseProvenance, formatLicenseProvenanceReport } from './check-license-provenance';

describe('license and provenance declaration gate', () => {
  it('rejects every identifier with case-sensitive word boundaries', () => {
    const identifiers = [
      parts('M', 'IT'),
      parts('B', 'SD'),
      parts('A', 'pache'),
      parts('G', 'PL'),
      parts('L', 'G', 'PL'),
      parts('A', 'G', 'PL'),
      parts('I', 'SC'),
      parts('M', 'PL'),
      parts('E', 'PL'),
      parts('C', 'DDL'),
      parts('Z', 'lib'),
      parts('Un', 'license'),
      parts('C', 'C0'),
      parts('C', 'C-BY'),
      parts('W', 'TFPL'),
      parts('Boost', ' Software License'),
      parts('SIL', ' OFL'),
    ];
    const report = checkLicenseProvenance([{ path: 'notes.md', text: identifiers.join('\n') }]);

    expect(report.violations.map((entry) => entry.match)).toEqual(identifiers);
    expect(
      checkLicenseProvenance([{ path: 'notes.md', text: `${parts('m', 'it')} X${parts('M', 'IT')}Y` }]).violations,
    ).toEqual([]);
    expect(checkLicenseProvenance([{ path: 'notes.md', text: `${parts('M', 'IT')}-0` }]).violations).toHaveLength(1);
  });

  it('allows only the root notice and exact manifest property as structural sites', () => {
    const identifier = parts('M', 'IT');
    const report = checkLicenseProvenance([
      { path: 'LICENSE.md', text: identifier },
      { path: 'package.json', text: `  "license": "${identifier}",` },
      { path: 'packages/example/package.json', text: `  "license": "${identifier}"` },
      { path: 'package.json', text: `  "description": "${identifier}"` },
    ]);

    expect(report.structuralMatches).toBe(3);
    expect(report.violations).toEqual([
      { line: 1, match: identifier, path: 'package.json', rule: 'license-identifier' },
    ]);
  });

  it('keeps generated lock metadata as an exact named escape', () => {
    const identifier = parts('I', 'SC');
    const report = checkLicenseProvenance([
      { path: 'package-lock.json', text: `      "license": "${identifier}",\n      "note": "${identifier}"` },
    ]);

    expect(report.escapes.find((entry) => entry.name === 'npm-lock-license-metadata')?.matches).toBe(1);
    expect(report.violations).toEqual([
      { line: 2, match: identifier, path: 'package-lock.json', rule: 'license-identifier' },
    ]);
  });

  it('rejects every unconditional derivation marker', () => {
    const phrases = [
      words('adapted', 'from'),
      words('transcribed', 'from'),
      words('translated', 'from'),
      words('algebra', 'sourced', 'from'),
      words('ported', 'from'),
    ];
    const report = checkLicenseProvenance([{ path: 'source.ts', text: phrases.join('\n') }]);

    expect(report.violations.map((entry) => entry.match.toLowerCase())).toEqual(phrases);
  });

  it('requires provenance context for the conditional marker', () => {
    const phrase = words('derived', 'from');
    const identifier = parts('M', 'IT');
    const report = checkLicenseProvenance([
      {
        path: 'source.ts',
        text: [
          `value ${phrase} input`,
          `implementation ${phrase} upstream (${identifier})`,
          `implementation ${phrase} https://example.com/source`,
          `implementation ${phrase} ${parts('Dragon', 'Bones')}`,
          `implementation ${phrase} Acme project`,
          `algorithm ${phrase} UAX 9`,
        ].join('\n'),
      },
    ]);

    expect(
      report.violations.filter((entry) => entry.rule === 'derived-from-with-provenance').map((entry) => entry.line),
    ).toEqual([2, 3, 4, 5]);
  });

  it('keeps conditional evidence scoped to its line', () => {
    const phrase = words('derived', 'from');
    const source = checkLicenseProvenance([
      { path: 'source.ts', text: `// implementation ${phrase} upstream\n// https://example.com/source` },
    ]);

    expect(source.violations).toEqual([]);
  });

  it('protects negative assertions for every derivation marker', () => {
    const lines = [
      `never ${words('adapted', 'from')} upstream`,
      `not ${words('transcribed', 'from')} a licensed rig`,
      `without content ${words('translated', 'from')} elsewhere`,
      `no algebra ${words('sourced', 'from')} another codebase`,
      `nothing ${words('ported', 'from')} a runtime`,
      `not ${words('derived', 'from')} https://example.com/source`,
    ];

    expect(checkLicenseProvenance([{ path: 'source.ts', text: lines.join('\n') }]).violations).toEqual([]);
  });

  it('keeps all four calibration candidates as must-pass cases', () => {
    const candidates = [
      `Color-matrix fuse primitives ${words('ported', 'from')} the dissolved \`filters\`.`,
      `The AVM2 instruction set is ${words('transcribed', 'from')} the published bytecode format description.`,
      `// World transforms are ${words('derived', 'from')} these by computeWorldTransforms\n// itself follows the ${parts('Dragon', 'Bones')} model.`,
      `Hand-written, never ${words('transcribed', 'from')} a ${words('licensed', 'rig')}.`,
    ];

    for (const text of candidates) {
      expect(checkLicenseProvenance([{ path: 'source.ts', text }]).violations).toEqual([]);
    }
  });

  it('keeps the model provenance denial as a must-pass case', () => {
    const text = [
      'The opcode table is written from the published bytecode format description.',
      `An opcode's number and the operands it declares are facts about the format; nothing here ${words('derives', 'from')} any implementation of it,`,
      `so the package carries no ${words('third-party', 'licence')} or ${words('attribution', 'obligation')}.`,
    ].join(' ');

    expect(checkLicenseProvenance([{ path: 'status.md', text }]).violations).toEqual([]);
  });

  it('reports the two exact policy escapes and their reasons', () => {
    const identifier = parts('M', 'IT');
    const projectPolicy = `Flight is ${identifier}, copyright Joshua Granick alone. **No work may attach an attribution obligation to anyone else.** This outranks any feature, unblock, or deadline. If you think you need third-party material for anything, stop and ask.`;
    const example = `- **State format facts as facts about the format, not as excerpts from a document.** "PNG's magic bytes are \`89 50 4E 47\`" needs no attribution; "${words('derived', 'from')} \`<url>\` at \`<sha>\`, ${identifier}" manufactures one.`;
    const report = checkLicenseProvenance([{ path: 'AGENTS.md', text: `${projectPolicy}\n${example}` }]);
    const output = formatLicenseProvenanceReport(report);

    expect(report.violations).toEqual([]);
    expect(output).toContain('project-license-policy [1 matched line] —');
    expect(output).toContain('prohibited-provenance-example [1 matched line] —');
    expect(output).toContain('Matcher state: [semantic negatives protected; token-keying ready]');
  });

  it('does not mistake re-exports or published algorithm names for provenance', () => {
    expect(
      checkLicenseProvenance([
        {
          path: 'source.ts',
          text: `re-exported from the root; levels ${words('derived', 'from')} UAX 9`,
        },
      ]).violations,
    ).toEqual([]);
  });

  it('permits an internal Flight package move but not an external one', () => {
    const phrase = words('ported', 'from');
    const report = checkLicenseProvenance([
      { path: 'packages/adjustments/package.json', text: '{}' },
      {
        path: 'notes.md',
        text: `${phrase} the dissolved \`filters\`\n${phrase} \`adjustments\`\n${phrase} ExternalProject`,
      },
    ]);

    expect(report.violations).toEqual([{ line: 3, match: phrase, path: 'notes.md', rule: 'ported-from' }]);
  });

  it('permits facts taken from a published interface description but not an implementation', () => {
    const phrase = words('transcribed', 'from');
    const report = checkLicenseProvenance([
      {
        path: 'source.ts',
        text: `${phrase} the published bytecode format description\n${phrase} a published standard\n${phrase} a standard library implementation`,
      },
    ]);

    expect(report.violations).toEqual([{ line: 3, match: phrase, path: 'source.ts', rule: 'transcribed-from' }]);
  });

  it('keeps mathematical derivation separate from a project named on another line', () => {
    const phrase = words('derived', 'from');
    const report = checkLicenseProvenance([
      {
        path: 'source.ts',
        text: `// World transforms are ${phrase} these by computeWorldTransforms\n// itself follows the ${parts('Dragon', 'Bones')} model`,
      },
    ]);

    expect(report.violations).toEqual([]);
  });

  it('deduplicates a finding seen in both working and staged content', () => {
    const identifier = parts('M', 'IT');
    const input = { path: 'notes.md', text: identifier };
    const report = checkLicenseProvenance([input, input]);

    expect(report.scannedFiles).toBe(1);
    expect(report.violations).toHaveLength(1);
  });
});

function parts(...values: string[]): string {
  return values.join('');
}

function words(...values: string[]): string {
  return values.join(' ');
}
