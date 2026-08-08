export interface Md5IntegerDeclarationProbe {
  malformed: number;
  occurrences: number;
  value: number | null;
}

export interface Md5SectionProbeBase {
  declarationsReconciled: boolean;
  version: Md5IntegerDeclarationProbe;
}

export interface Md5RecordSectionProbe {
  blocks: number;
  closedBlocks: number;
  malformedOpeners: number;
  malformedRecords: number;
  records: number;
}

export interface Md5IndexedRecordProbe {
  declaration: Md5IntegerDeclarationProbe;
  indices: readonly number[];
  malformedRecords: number;
  records: number;
  sequential: boolean;
}

export interface Md5MeshBodyProbe {
  closed: boolean;
  declarationsReconciled: boolean;
  triangles: Md5IndexedRecordProbe;
  vertices: Md5IndexedRecordProbe;
  weights: Md5IndexedRecordProbe;
}

export interface Md5MeshSectionProbe extends Md5SectionProbeBase {
  declarations: {
    joints: Md5IntegerDeclarationProbe;
    meshes: Md5IntegerDeclarationProbe;
  };
  kind: 'mesh';
  sections: {
    joints: Md5RecordSectionProbe;
    malformedMeshOpeners: number;
    meshes: readonly Md5MeshBodyProbe[];
  };
}

export interface Md5FrameSectionProbe {
  closed: boolean;
  index: number;
  malformedValues: number;
  values: number;
}

export interface Md5AnimSectionProbe extends Md5SectionProbeBase {
  declarations: {
    animatedComponents: Md5IntegerDeclarationProbe;
    frames: Md5IntegerDeclarationProbe;
    joints: Md5IntegerDeclarationProbe;
  };
  kind: 'anim';
  sections: {
    baseframe: Md5RecordSectionProbe;
    frames: readonly Md5FrameSectionProbe[];
    hierarchy: Md5RecordSectionProbe;
    malformedFrameOpeners: number;
  };
}

export interface Md5UnknownSectionProbe extends Md5SectionProbeBase {
  kind: 'unknown';
}

export type Md5SectionProbe = Md5AnimSectionProbe | Md5MeshSectionProbe | Md5UnknownSectionProbe;

interface LogicalLine {
  text: string;
}

interface SourceBlock {
  closed: boolean;
  lines: readonly LogicalLine[];
  nextLine: number;
}

interface ParsedSource {
  animatedComponents: (number | null)[];
  baseframeBlocks: SourceBlock[];
  frames: { block: SourceBlock; index: number }[];
  hierarchyBlocks: SourceBlock[];
  jointCounts: (number | null)[];
  jointsBlocks: SourceBlock[];
  malformedBaseframeOpeners: number;
  malformedFrameOpeners: number;
  malformedHierarchyOpeners: number;
  malformedJointsOpeners: number;
  malformedMeshOpeners: number;
  meshCounts: (number | null)[];
  meshes: SourceBlock[];
  numFrames: (number | null)[];
  sawAnimSignal: boolean;
  sawMeshSignal: boolean;
  versions: (number | null)[];
}

const NUMBER = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
const JOINT_RECORD = new RegExp(
  String.raw`^"(?:[^"\\]|\\.)*"\s+-?\d+\s+\(\s*${NUMBER}\s+${NUMBER}\s+${NUMBER}\s*\)\s+\(\s*${NUMBER}\s+${NUMBER}\s+${NUMBER}\s*\)$`,
);
const HIERARCHY_RECORD = /^"(?:[^"\\]|\\.)*"\s+-?\d+\s+\d+\s+\d+$/;
const BASEFRAME_RECORD = new RegExp(
  String.raw`^\(\s*${NUMBER}\s+${NUMBER}\s+${NUMBER}\s*\)\s+\(\s*${NUMBER}\s+${NUMBER}\s+${NUMBER}\s*\)$`,
);
const VERT_RECORD = new RegExp(String.raw`^vert\s+(\d+)\s+\(\s*${NUMBER}\s+${NUMBER}\s*\)\s+\d+\s+\d+$`);
const TRI_RECORD = /^tri\s+(\d+)\s+\d+\s+\d+\s+\d+$/;
const WEIGHT_RECORD = new RegExp(
  String.raw`^weight\s+(\d+)\s+\d+\s+${NUMBER}\s+\(\s*${NUMBER}\s+${NUMBER}\s+${NUMBER}\s*\)$`,
);

// This deliberately reads MD5's wire structure itself. It must not call the MD5 importers: the probe is
// intended to be an independent observation that can later be compared with importer outcomes.
export function probeMd5Sections(source: string): Md5SectionProbe {
  const parsed = parseSource(toLogicalLines(source));
  const version = declarationProbe(parsed.versions);

  if (parsed.sawMeshSignal === parsed.sawAnimSignal) {
    return { declarationsReconciled: false, kind: 'unknown', version };
  }
  return parsed.sawMeshSignal ? probeMesh(parsed, version) : probeAnim(parsed, version);
}

function probeMesh(parsed: ParsedSource, version: Md5IntegerDeclarationProbe): Md5MeshSectionProbe {
  const declarations = {
    joints: declarationProbe(parsed.jointCounts),
    meshes: declarationProbe(parsed.meshCounts),
  };
  const joints = recordSectionProbe(parsed.jointsBlocks, parsed.malformedJointsOpeners, (line) =>
    JOINT_RECORD.test(line),
  );
  const meshes = parsed.meshes.map(probeMeshBody);
  const declarationsReconciled =
    isVersion10(version) &&
    declarationMatches(declarations.joints, joints.records) &&
    declarationMatches(declarations.meshes, meshes.length) &&
    joints.blocks === 1 &&
    joints.closedBlocks === 1 &&
    joints.malformedOpeners === 0 &&
    joints.malformedRecords === 0 &&
    parsed.malformedMeshOpeners === 0 &&
    meshes.every((mesh) => mesh.declarationsReconciled);

  return {
    declarations,
    declarationsReconciled,
    kind: 'mesh',
    sections: { joints, malformedMeshOpeners: parsed.malformedMeshOpeners, meshes },
    version,
  };
}

function probeMeshBody(block: SourceBlock): Md5MeshBodyProbe {
  const vertices = indexedRecordProbe(block.lines, 'numverts', 'vert', VERT_RECORD);
  const triangles = indexedRecordProbe(block.lines, 'numtris', 'tri', TRI_RECORD);
  const weights = indexedRecordProbe(block.lines, 'numweights', 'weight', WEIGHT_RECORD);
  const declarationsReconciled =
    block.closed &&
    indexedRecordsConform(vertices) &&
    indexedRecordsConform(triangles) &&
    indexedRecordsConform(weights);
  return { closed: block.closed, declarationsReconciled, triangles, vertices, weights };
}

function probeAnim(parsed: ParsedSource, version: Md5IntegerDeclarationProbe): Md5AnimSectionProbe {
  const declarations = {
    animatedComponents: declarationProbe(parsed.animatedComponents),
    frames: declarationProbe(parsed.numFrames),
    joints: declarationProbe(parsed.jointCounts),
  };
  const hierarchy = recordSectionProbe(parsed.hierarchyBlocks, parsed.malformedHierarchyOpeners, (line) =>
    HIERARCHY_RECORD.test(line),
  );
  const baseframe = recordSectionProbe(parsed.baseframeBlocks, parsed.malformedBaseframeOpeners, (line) =>
    BASEFRAME_RECORD.test(line),
  );
  const frames = parsed.frames.map(({ block, index }) => probeFrame(block, index));
  const framesConform = frames.every(
    (frame, index) =>
      frame.closed &&
      frame.index === index &&
      frame.malformedValues === 0 &&
      declarationMatches(declarations.animatedComponents, frame.values),
  );
  const declarationsReconciled =
    isVersion10(version) &&
    declarationMatches(declarations.joints, hierarchy.records) &&
    declarationMatches(declarations.joints, baseframe.records) &&
    declarationMatches(declarations.frames, frames.length) &&
    hierarchy.blocks === 1 &&
    hierarchy.closedBlocks === 1 &&
    hierarchy.malformedOpeners === 0 &&
    hierarchy.malformedRecords === 0 &&
    baseframe.blocks === 1 &&
    baseframe.closedBlocks === 1 &&
    baseframe.malformedOpeners === 0 &&
    baseframe.malformedRecords === 0 &&
    parsed.malformedFrameOpeners === 0 &&
    framesConform;

  return {
    declarations,
    declarationsReconciled,
    kind: 'anim',
    sections: { baseframe, frames, hierarchy, malformedFrameOpeners: parsed.malformedFrameOpeners },
    version,
  };
}

function parseSource(lines: readonly LogicalLine[]): ParsedSource {
  const parsed: ParsedSource = {
    animatedComponents: [],
    baseframeBlocks: [],
    frames: [],
    hierarchyBlocks: [],
    jointCounts: [],
    jointsBlocks: [],
    malformedBaseframeOpeners: 0,
    malformedFrameOpeners: 0,
    malformedHierarchyOpeners: 0,
    malformedJointsOpeners: 0,
    malformedMeshOpeners: 0,
    meshCounts: [],
    meshes: [],
    numFrames: [],
    sawAnimSignal: false,
    sawMeshSignal: false,
    versions: [],
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const text = lines[lineIndex]!.text;
    if (startsWithWord(text, 'MD5Version')) {
      parsed.versions.push(parseDeclarationValue(text, 'MD5Version'));
    } else if (startsWithWord(text, 'numJoints')) {
      parsed.jointCounts.push(parseDeclarationValue(text, 'numJoints'));
    } else if (startsWithWord(text, 'numMeshes')) {
      parsed.sawMeshSignal = true;
      parsed.meshCounts.push(parseDeclarationValue(text, 'numMeshes'));
    } else if (startsWithWord(text, 'numFrames')) {
      parsed.sawAnimSignal = true;
      parsed.numFrames.push(parseDeclarationValue(text, 'numFrames'));
    } else if (startsWithWord(text, 'numAnimatedComponents')) {
      parsed.sawAnimSignal = true;
      parsed.animatedComponents.push(parseDeclarationValue(text, 'numAnimatedComponents'));
    } else if (startsWithWord(text, 'frameRate') || startsWithWord(text, 'bounds')) {
      parsed.sawAnimSignal = true;
    }

    const section = matchSectionStart(lines, lineIndex, 'joints');
    if (section.matched) {
      parsed.sawMeshSignal = true;
      if (section.block === null) parsed.malformedJointsOpeners++;
      else {
        parsed.jointsBlocks.push(section.block);
        lineIndex = section.block.nextLine - 1;
      }
      continue;
    }

    const mesh = matchSectionStart(lines, lineIndex, 'mesh');
    if (mesh.matched) {
      parsed.sawMeshSignal = true;
      if (mesh.block === null) parsed.malformedMeshOpeners++;
      else {
        parsed.meshes.push(mesh.block);
        lineIndex = mesh.block.nextLine - 1;
      }
      continue;
    }

    const hierarchy = matchSectionStart(lines, lineIndex, 'hierarchy');
    if (hierarchy.matched) {
      parsed.sawAnimSignal = true;
      if (hierarchy.block === null) parsed.malformedHierarchyOpeners++;
      else {
        parsed.hierarchyBlocks.push(hierarchy.block);
        lineIndex = hierarchy.block.nextLine - 1;
      }
      continue;
    }

    const baseframe = matchSectionStart(lines, lineIndex, 'baseframe');
    if (baseframe.matched) {
      parsed.sawAnimSignal = true;
      if (baseframe.block === null) parsed.malformedBaseframeOpeners++;
      else {
        parsed.baseframeBlocks.push(baseframe.block);
        lineIndex = baseframe.block.nextLine - 1;
      }
      continue;
    }

    const frame = matchFrameStart(lines, lineIndex);
    if (frame.matched) {
      parsed.sawAnimSignal = true;
      if (frame.block === null || frame.index === null) parsed.malformedFrameOpeners++;
      else {
        parsed.frames.push({ block: frame.block, index: frame.index });
        lineIndex = frame.block.nextLine - 1;
      }
    }
  }
  return parsed;
}

function matchSectionStart(
  lines: readonly LogicalLine[],
  lineIndex: number,
  name: string,
): { block: SourceBlock | null; matched: boolean } {
  const text = lines[lineIndex]!.text;
  if (!startsWithWord(text, name)) return { block: null, matched: false };
  const match = new RegExp(`^${name}\\s*(\\{)?$`).exec(text);
  if (match === null) return { block: null, matched: true };
  return { block: readBlock(lines, lineIndex, match[1] !== undefined), matched: true };
}

function matchFrameStart(
  lines: readonly LogicalLine[],
  lineIndex: number,
): { block: SourceBlock | null; index: number | null; matched: boolean } {
  const text = lines[lineIndex]!.text;
  if (!startsWithWord(text, 'frame')) return { block: null, index: null, matched: false };
  const match = /^frame\s+(\d+)\s*(\{)?$/.exec(text);
  if (match === null) return { block: null, index: null, matched: true };
  return {
    block: readBlock(lines, lineIndex, match[2] !== undefined),
    index: Number.parseInt(match[1]!, 10),
    matched: true,
  };
}

function readBlock(lines: readonly LogicalLine[], openerIndex: number, braceOnOpener: boolean): SourceBlock | null {
  let contentStart = openerIndex + 1;
  if (!braceOnOpener) {
    if (lines[contentStart]?.text !== '{') return null;
    contentStart++;
  }
  for (let lineIndex = contentStart; lineIndex < lines.length; lineIndex++) {
    if (lines[lineIndex]!.text === '}') {
      return { closed: true, lines: lines.slice(contentStart, lineIndex), nextLine: lineIndex + 1 };
    }
  }
  return { closed: false, lines: lines.slice(contentStart), nextLine: lines.length };
}

function recordSectionProbe(
  blocks: readonly SourceBlock[],
  malformedOpeners: number,
  recordMatches: (line: string) => boolean,
): Md5RecordSectionProbe {
  let records = 0;
  let malformedRecords = 0;
  for (const block of blocks) {
    for (const line of block.lines) {
      if (recordMatches(line.text)) records++;
      else malformedRecords++;
    }
  }
  return {
    blocks: blocks.length,
    closedBlocks: blocks.filter((block) => block.closed).length,
    malformedOpeners,
    malformedRecords,
    records,
  };
}

function indexedRecordProbe(
  lines: readonly LogicalLine[],
  declaration: string,
  record: string,
  recordPattern: RegExp,
): Md5IndexedRecordProbe {
  const declarationValues: (number | null)[] = [];
  const indices: number[] = [];
  let malformedRecords = 0;
  for (const line of lines) {
    if (startsWithWord(line.text, declaration)) {
      declarationValues.push(parseDeclarationValue(line.text, declaration));
    } else if (startsWithWord(line.text, record)) {
      const match = recordPattern.exec(line.text);
      if (match === null) malformedRecords++;
      else indices.push(Number.parseInt(match[1]!, 10));
    }
  }
  return {
    declaration: declarationProbe(declarationValues),
    indices,
    malformedRecords,
    records: indices.length,
    sequential: indices.every((index, position) => index === position),
  };
}

function probeFrame(block: SourceBlock, index: number): Md5FrameSectionProbe {
  let values = 0;
  let malformedValues = 0;
  const numericValue = new RegExp(`^${NUMBER}$`);
  for (const line of block.lines) {
    for (const token of line.text.split(/\s+/)) {
      if (numericValue.test(token)) values++;
      else malformedValues++;
    }
  }
  return { closed: block.closed, index, malformedValues, values };
}

function declarationProbe(values: readonly (number | null)[]): Md5IntegerDeclarationProbe {
  const malformed = values.filter((value) => value === null).length;
  return {
    malformed,
    occurrences: values.length,
    value: values.length === 1 && malformed === 0 ? values[0]! : null,
  };
}

function parseDeclarationValue(text: string, name: string): number | null {
  const match = new RegExp(`^${name}\\s+(\\S+)\\s*$`).exec(text);
  if (match === null || !/^\d+$/.test(match[1]!)) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

function declarationMatches(declaration: Md5IntegerDeclarationProbe, observed: number): boolean {
  return declaration.value !== null && declaration.value === observed;
}

function indexedRecordsConform(records: Md5IndexedRecordProbe): boolean {
  return (
    declarationMatches(records.declaration, records.records) && records.malformedRecords === 0 && records.sequential
  );
}

function isVersion10(version: Md5IntegerDeclarationProbe): boolean {
  return version.value === 10;
}

function startsWithWord(text: string, word: string): boolean {
  return text === word || (text.startsWith(word) && /\s/.test(text[word.length] ?? ''));
}

function toLogicalLines(source: string): LogicalLine[] {
  const lines: LogicalLine[] = [];
  for (const sourceLine of source.split(/\r?\n/)) {
    const text = stripLineComment(sourceLine).trim();
    if (text.length > 0) lines.push({ text });
  }
  return lines;
}

function stripLineComment(line: string): string {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index]!;
    if (character === '"' && !escaped) quoted = !quoted;
    if (!quoted && character === '/' && line[index + 1] === '/') return line.slice(0, index);
    escaped = character === '\\' && !escaped;
    if (character !== '\\') escaped = false;
  }
  return line;
}
