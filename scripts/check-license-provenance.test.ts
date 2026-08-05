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

  it('keeps identifiers that explain why no implementation was copied', () => {
    const firstIdentifier = parts('B', 'SD');
    const secondIdentifier = parts('G', 'PL');
    const clean = [
      'policy. Two independent implementations were consulted for the FORMAT FACTS only — byte order, field',
      'order, units — and no code, naming, or structure was taken from either; the sources were deleted before',
      `the parser was written, deliberately, because their licenses (${firstIdentifier}-3 attribution and ${secondIdentifier}) make copying a`,
      'problem the facts themselves are not.',
    ].join('\n');
    const copied = [
      'Two implementations were consulted and their code, naming, and structure were taken.',
      `The parser retained them because their licenses (${firstIdentifier} and ${secondIdentifier}) make copying a problem.`,
    ].join('\n');

    expect(checkLicenseProvenance([{ path: 'status.md', text: clean }]).violations).toEqual([]);
    expect(checkLicenseProvenance([{ path: 'status.md', text: copied }]).violations).toEqual([
      { line: 2, match: firstIdentifier, path: 'status.md', rule: 'license-identifier' },
      { line: 2, match: secondIdentifier, path: 'status.md', rule: 'license-identifier' },
    ]);
  });

  it('rejects implementation derivation markers independently of an actual token', () => {
    const phrases = [
      words('sourced', 'from'),
      words('adapted', 'from'),
      words('transcribed', 'from'),
      words('translated', 'from'),
      words('ported', 'from'),
      words('derived', 'from'),
      words('replicates'),
      words('reproduces'),
      words('mirrors'),
      words('follows'),
    ];
    const identifier = parts('M', 'IT');

    for (const phrase of phrases) {
      const withoutToken = checkLicenseProvenance([{ path: 'source.ts', text: `${phrase} external implementation` }]);
      const withToken = checkLicenseProvenance([
        { path: 'source.ts', text: `${phrase} external implementation, ${identifier}` },
      ]);

      expect(withoutToken.violations).toHaveLength(1);
      expect(withoutToken.violations[0].match).toBe(phrase);
      expect(withToken.violations).toHaveLength(2);
      expect(withToken.violations.map((entry) => entry.match)).toEqual(expect.arrayContaining([phrase, identifier]));
    }
  });

  it('rejects the exact ObjectDataParser claim with or without an incidental token', () => {
    const phrase = words('algebra', 'sourced', 'from');
    const marker = words('sourced', 'from');
    const object = `the ${parts('Dragon', 'Bones')} ${parts('Object', 'Data', 'Parser')}`;
    const identifier = parts('M', 'IT');
    const withoutToken = checkLicenseProvenance([{ path: 'status.md', text: `${phrase} ${object}` }]);
    const withToken = checkLicenseProvenance([
      { path: 'status.md', text: `${phrase} the ${identifier} ${object.slice(4)}` },
    ]);

    expect(withoutToken.violations).toEqual([{ line: 1, match: marker, path: 'status.md', rule: 'sourced-from' }]);
    expect(withToken.violations).toEqual([
      { line: 1, match: identifier, path: 'status.md', rule: 'license-identifier' },
      { line: 1, match: marker, path: 'status.md', rule: 'sourced-from' },
    ]);
  });

  it.each([
    { phrase: words('sourced', 'from'), rule: 'sourced-from' },
    { phrase: words('adapted', 'from'), rule: 'adapted-from' },
    { phrase: words('transcribed', 'from'), rule: 'transcribed-from' },
    { phrase: words('translated', 'from'), rule: 'translated-from' },
    { phrase: words('ported', 'from'), rule: 'ported-from' },
    { phrase: words('derived', 'from'), rule: 'derived-from-with-provenance' },
    { phrase: words('replicates'), rule: 'replicates-origin' },
    { phrase: words('reproduces'), rule: 'reproduces-origin' },
    { phrase: words('mirrors'), rule: 'mirrors-origin' },
    { phrase: words('follows'), rule: 'follows-origin' },
  ])('distinguishes an implementation symbol from a format for $phrase', ({ phrase, rule }) => {
    const project = parts('Dragon', 'Bones');
    const implementation = parts('Object', 'Data', 'Parser');
    const positive = checkLicenseProvenance([
      { path: 'source.ts', text: `${phrase} the ${project} ${implementation}` },
    ]);
    const format = checkLicenseProvenance([{ path: 'source.ts', text: `${phrase} the ${project} format` }]);

    expect(positive.violations).toEqual([{ line: 1, match: phrase, path: 'source.ts', rule }]);
    expect(format.violations).toEqual([]);
  });

  it('recognises pronoun-owned symbols and runtime functions without a brand list', () => {
    const derived = words('derived', 'from');
    const comparisonPhrase = words('mirrors');
    const replicationPhrase = words('replicates');
    const symbol = parts('Object', 'Data', 'Parser');
    const project = parts('Dragon', 'Bones');
    const report = checkLicenseProvenance([
      {
        path: 'source.ts',
        text: `${derived} their \`${symbol}\`\n${comparisonPhrase} the ${project} runtime \`addDisplay(slot, null)\`\n${replicationPhrase} the ${project} runtime geometry bake (\`${symbol}._parseGeometry()\`) through a bind matrix\n${derived} their format\n${comparisonPhrase} the ${project} model`,
      },
    ]);

    expect(report.violations).toEqual([
      { line: 1, match: derived, path: 'source.ts', rule: 'derived-from-with-provenance' },
      { line: 2, match: comparisonPhrase, path: 'source.ts', rule: 'mirrors-origin' },
      { line: 3, match: replicationPhrase, path: 'source.ts', rule: 'replicates-origin' },
    ]);
  });

  it('keeps independently corroborated conventions separate from implementation sources', () => {
    const mirrors = words('mirrors');
    const vertexAnimator = parts('Vertex', 'Animator');
    const skeletonAnimator = parts('Skeleton', 'Animator');
    const skeletonData = parts('Skeleton', 'Data');
    const standardFirst = [
      `same clip, same animator, same clock — only the sink differs. This is exactly glTF's model`,
      `(\`channel.target.path\` already admits "weights") and ${mirrors} AwayJS's \`${vertexAnimator}\`/\`VertexAnimationSet\``,
      `vs \`${skeletonAnimator}\`/\`SkeletonAnimationSet\` split under one \`AnimatorBase\`.`,
    ].join('\n');
    const flightFirst = [
      `corresponding \`setup\` bone — the 2D-skeletal analogue of @flighthq/scene3d's \`applyAnimationClipToScene3D\`,`,
      `but relative rather than absolute. This ${mirrors} Spine's ${skeletonData}(setup)/Skeleton(instance) split:`,
    ].join('\n');
    const implementationSource = `Flight's ${vertexAnimator} ${mirrors} Acme's ${vertexAnimator}`;
    const report = checkLicenseProvenance([
      { path: 'morph.md', text: standardFirst },
      { path: 'skeleton.ts', text: flightFirst },
      { path: 'source.ts', text: implementationSource },
    ]);

    expect(report.violations).toEqual([{ line: 1, match: mirrors, path: 'source.ts', rule: 'mirrors-origin' }]);
  });

  it('does not let a Flight analogue mention conceal an implementation derivation', () => {
    const mirrors = words('mirrors');
    const transcribedFrom = words('transcribed', 'from');
    const skeletonData = parts('Skeleton', 'Data');
    const skeletonBinary = parts('Skeleton', 'Binary');
    const readAnimation = parts('_read', 'Animation');
    const flightFirst = [
      `the 2D analogue of \`@flighthq/scene3d\` \`applyAnimationClipToScene3D\`,`,
      `but relative rather than absolute. This ${mirrors} Spine's ${skeletonData}(setup)/Skeleton(instance) split:`,
    ].join('\n');
    const implementationSource = `${mirrors} \`@flighthq/scene3d\` approach; the parse is ${transcribedFrom} Spine \`${skeletonBinary}.${readAnimation}\``;
    const report = checkLicenseProvenance([
      { path: 'flight-first.ts', text: flightFirst },
      { path: 'implementation-source.ts', text: implementationSource },
    ]);

    expect(report.violations).toEqual([
      { line: 1, match: transcribedFrom, path: 'implementation-source.ts', rule: 'transcribed-from' },
    ]);
  });

  it('keeps rules, standards, dependency values, and local expressions separate from implementation sources', () => {
    const follows = words('follows');
    const mirrors = words('mirrors');
    const derived = words('derived', 'from');
    const sourced = words('sourced', 'from');
    const report = checkLicenseProvenance([
      {
        path: 'source.ts',
        text: [
          `${follows} the SDK's plain-data rule`,
          `${mirrors} the CSS spec`,
          `${derived} UAX 9 test data`,
          `${sourced} \`@vendor/plugin-os\``,
          `${derived} \`sub.split('/')\``,
          `${mirrors} the Electron \`menu.popup({ x, y })\` pattern`,
        ].join('\n'),
      },
    ]);

    expect(report.violations).toEqual([]);
  });

  it('treats an external repository path as implementation provenance', () => {
    const phrase = words('derived', 'from');
    const report = checkLicenseProvenance([
      { path: 'source.ts', text: `${phrase} \`vendor/runtime\` revision abc123` },
    ]);

    expect(report.violations).toEqual([
      { line: 1, match: phrase, path: 'source.ts', rule: 'derived-from-with-provenance' },
    ]);
  });

  it('does not require a licence token when the clause claims an implementation source', () => {
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

  it('treats fetch provenance as required evidence rather than a signal', () => {
    const identifier = parts('M', 'IT');
    const clean = `64 files fetched on demand from ${parts('R', 'ive')}'s Android runtime test assets and never committed`;
    const report = checkLicenseProvenance([
      { path: 'status.md', text: clean },
      { path: 'status.md', text: `${identifier}-licensed ${clean}` },
    ]);

    expect(report.violations).toEqual([{ line: 1, match: identifier, path: 'status.md', rule: 'license-identifier' }]);
  });

  it('keeps both negative and positive verification against licensed material', () => {
    const mustPass = [
      `never ${words('transcribed', 'from')} a ${words('licensed', 'rig')}`,
      `verified on the ${words('licensed', 'rig')}`,
    ];

    for (const text of mustPass) {
      expect(checkLicenseProvenance([{ path: 'status.md', text }]).violations).toEqual([]);
    }
  });

  it('pairs exact grant terms with ordinary permission language', () => {
    const termPairs = [
      [words('permission', 'is', 'hereby', 'granted'), words('permission', 'is', 'explicitly', 'granted')],
      [
        words('subject', 'to', 'the', 'following', 'conditions'),
        words('subject', 'to', 'the', 'rendering', 'conditions'),
      ],
    ];

    for (const [term, ordinary] of termPairs) {
      expect(checkLicenseProvenance([{ path: 'notes.md', text: ordinary }]).violations).toEqual([]);
      expect(checkLicenseProvenance([{ path: 'notes.md', text: term }]).violations).toEqual([
        { line: 1, match: term, path: 'notes.md', rule: 'license-vocabulary' },
      ]);
    }
  });

  it('classifies a token-plus-derivation line without flagging the source name', () => {
    const identifier = parts('M', 'IT');
    const phrase = words('adapted', 'from');
    const report = checkLicenseProvenance([{ path: 'source.ts', text: `${phrase} ExternalProject, ${identifier}` }]);

    expect(report.violations).toEqual([
      { line: 1, match: phrase, path: 'source.ts', rule: 'adapted-from' },
      { line: 1, match: identifier, path: 'source.ts', rule: 'license-identifier' },
    ]);
  });

  it('classifies an implementation derivation whether its token is on the same or next line', () => {
    const phrase = words('derived', 'from');
    const identifier = parts('M', 'IT');
    const report = checkLicenseProvenance([
      { path: 'joined.ts', text: `// implementation ${phrase} upstream, ${identifier}` },
      { path: 'split.ts', text: `// implementation ${phrase} upstream\n// ${identifier}` },
    ]);

    expect(report.violations.filter((entry) => entry.rule === 'derived-from-with-provenance')).toEqual([
      { line: 1, match: phrase, path: 'joined.ts', rule: 'derived-from-with-provenance' },
      { line: 1, match: phrase, path: 'split.ts', rule: 'derived-from-with-provenance' },
    ]);
  });

  it('pairs each positive derivation claim with its semantic negative', () => {
    const pairs = [
      [words('adapted', 'from'), parts('M', 'IT')],
      [words('transcribed', 'from'), parts('I', 'SC')],
      [words('translated', 'from'), parts('B', 'SD')],
      [words('sourced', 'from'), parts('A', 'pache')],
      [words('ported', 'from'), parts('G', 'PL')],
      [words('derived', 'from'), parts('C', 'C0')],
    ];

    for (const [phrase, identifier] of pairs) {
      const positive = checkLicenseProvenance([{ path: 'source.ts', text: `${phrase} external code, ${identifier}` }]);
      const negative = checkLicenseProvenance([
        { path: 'source.ts', text: `never ${phrase} external code, ${identifier}` },
      ]);

      expect(positive.violations).toHaveLength(2);
      expect(negative.violations).toEqual([]);
    }
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

  it('pairs the model denial with positive verification use and an actual incorporation claim', () => {
    const denial = [
      'The opcode table is written from the published bytecode format description.',
      `An opcode's number and the operands it declares are facts about the format; nothing here ${words('derives', 'from')} any implementation of it,`,
      `so the package carries no ${words('third-party', 'licence')} or ${words('attribution', 'obligation')}.`,
    ].join(' ');
    const positiveUse = 'The parser was verified against an external implementation used only as an oracle.';
    const incorporation = `${words('transcribed', 'from')} an external implementation, ${parts('M', 'IT')}`;
    const assertedObligation = `The package carries a ${words('third-party', 'licence')} or ${words('attribution', 'obligation')}.`;

    expect(checkLicenseProvenance([{ path: 'status.md', text: denial }]).violations).toEqual([]);
    expect(checkLicenseProvenance([{ path: 'status.md', text: positiveUse }]).violations).toEqual([]);
    expect(checkLicenseProvenance([{ path: 'source.ts', text: incorporation }]).violations).toHaveLength(2);
    expect(checkLicenseProvenance([{ path: 'status.md', text: assertedObligation }]).violations).toHaveLength(2);
  });

  it('keys the project policy escape on its file and rule rather than fixed prose', () => {
    const identifier = parts('M', 'IT');
    const otherIdentifier = parts('B', 'SD');
    const projectPolicy = `Flight is ${identifier}, copyright as stated in the root \`LICENSE.md\` — the operative text, and the only place the holder is named. **No work may attach an attribution obligation to any outside party.** This outranks any feature, unblock, or deadline. If you think you need third-party material for anything, stop and ask.`;
    const example = `- **State format facts as facts about the format, not as excerpts from a document.** "PNG's magic bytes are \`89 50 4E 47\`" needs no attribution; "${words('derived', 'from')} \`<url>\` at \`<sha>\`, ${identifier}" manufactures one.`;
    const report = checkLicenseProvenance([
      { path: 'AGENTS.md', text: `${projectPolicy}\nA third-party package uses ${otherIdentifier}.\n${example}` },
      { path: 'notes.md', text: `${projectPolicy}\n${example}` },
    ]);
    const output = formatLicenseProvenanceReport(report);

    expect(report.violations).toEqual([
      { line: 2, match: otherIdentifier, path: 'AGENTS.md', rule: 'license-identifier' },
      { line: 1, match: identifier, path: 'notes.md', rule: 'license-identifier' },
      { line: 2, match: words('derived', 'from'), path: 'notes.md', rule: 'derived-from-with-provenance' },
      { line: 2, match: identifier, path: 'notes.md', rule: 'license-identifier' },
    ]);
    expect(output).toContain('project-license-policy [1 matched line] —');
    expect(output).toContain('prohibited-provenance-example [1 matched line] —');
    expect(output).toContain(
      'Matcher state: [semantic negatives, independent convention comparisons, and verification protected; implementation derivations token-independent]',
    );
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

  it('pairs internal Flight history with an external implementation claim', () => {
    const phrase = words('ported', 'from');
    const identifier = parts('M', 'IT');
    const report = checkLicenseProvenance([
      { path: 'packages/adjustments/package.json', text: '{}' },
      {
        path: 'notes.md',
        text: [
          `${phrase} the dissolved \`filters\``,
          `${phrase} \`adjustments\``,
          `${phrase} ExternalProject`,
          `${phrase} the dissolved \`filters\`, ${identifier}`,
          `${phrase} ExternalProject, ${identifier}`,
        ].join('\n'),
      },
    ]);

    expect(report.violations.filter((entry) => entry.rule === 'ported-from')).toEqual([
      { line: 3, match: phrase, path: 'notes.md', rule: 'ported-from' },
      { line: 5, match: phrase, path: 'notes.md', rule: 'ported-from' },
    ]);
    expect(report.violations.filter((entry) => entry.rule === 'license-identifier')).toHaveLength(2);
  });

  it('distinguishes a published interface fact from an implementation claim when a token is present', () => {
    const phrase = words('transcribed', 'from');
    const identifier = parts('M', 'IT');
    const report = checkLicenseProvenance([
      {
        path: 'source.ts',
        text: `${phrase} the published bytecode format description, ${identifier}\n${phrase} a published standard, ${identifier}\n${phrase} a standard library implementation, ${identifier}`,
      },
    ]);

    expect(report.violations.filter((entry) => entry.rule === 'transcribed-from')).toEqual([
      { line: 3, match: phrase, path: 'source.ts', rule: 'transcribed-from' },
    ]);
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
