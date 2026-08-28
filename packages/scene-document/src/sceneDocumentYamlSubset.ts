import type { FlightDocumentRefusalReason } from '@flighthq/types/contract';

type SceneDocumentYamlSubsetValue =
  | null
  | boolean
  | number
  | string
  | SceneDocumentYamlSubsetValue[]
  | SceneDocumentYamlSubsetMapping;

interface SceneDocumentYamlSubsetMapping {
  [key: string]: SceneDocumentYamlSubsetValue;
}

interface SceneDocumentYamlSubsetSuccess {
  readonly ok: true;
  readonly value: SceneDocumentYamlSubsetValue;
}

interface SceneDocumentYamlSubsetRefusal {
  readonly ok: false;
  readonly kind: SceneDocumentYamlSubsetRefusalReason;
  readonly limit: number | null;
  readonly actual: number | null;
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

type SceneDocumentYamlSubsetResult = SceneDocumentYamlSubsetSuccess | SceneDocumentYamlSubsetRefusal;

// This exact private union makes every refusal the parser can emit a compile-time subset of the public
// diagnostic taxonomy. Adding a lexer/parser refusal therefore requires publishing its stable identity
// first; callers never need to cast an untyped parser string into FlightDocumentRefusalReason.
type SceneDocumentYamlSubsetRefusalReason = Extract<
  FlightDocumentRefusalReason,
  | 'flight-document.limit.collection-entries'
  | 'flight-document.limit.document-code-units'
  | 'flight-document.limit.key-code-units'
  | 'flight-document.limit.nesting-depth'
  | 'flight-document.limit.scalar-code-units'
  | 'flight-document.limit.total-nodes'
  | 'flight-document.scalar.number-out-of-range'
  | 'flight-document.syntax.duplicate-key'
  | 'flight-document.syntax.expected-flow-delimiter'
  | 'flight-document.syntax.expected-mapping-entry'
  | 'flight-document.syntax.expected-mapping-key'
  | 'flight-document.syntax.expected-scalar'
  | 'flight-document.syntax.expected-value'
  | 'flight-document.syntax.invalid-document'
  | 'flight-document.syntax.invalid-escape'
  | 'flight-document.syntax.mixed-collection'
  | 'flight-document.syntax.multiple-root-values'
  | 'flight-document.syntax.root-indentation'
  | 'flight-document.syntax.tab-character'
  | 'flight-document.syntax.trailing-flow-comma'
  | 'flight-document.syntax.trailing-flow-content'
  | 'flight-document.syntax.unexpected-indentation'
  | 'flight-document.syntax.unexpected-token'
  | 'flight-document.syntax.unterminated-flow-mapping'
  | 'flight-document.syntax.unterminated-quoted-scalar'
  | 'flight-document.unsupported.alias'
  | 'flight-document.unsupported.anchor'
  | 'flight-document.unsupported.block-scalar'
  | 'flight-document.unsupported.document-separator'
  | 'flight-document.unsupported.flow-sequence'
  | 'flight-document.unsupported.tag'
>;

type SceneDocumentYamlSubsetTokenKind =
  | 'colon'
  | 'comma'
  | 'flow-mapping-end'
  | 'flow-mapping-start'
  | 'scalar'
  | 'sequence-item';

interface SceneDocumentYamlSubsetToken {
  readonly kind: SceneDocumentYamlSubsetTokenKind;
  readonly value: string;
  readonly quoted: boolean;
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

interface SceneDocumentYamlSubsetLine {
  readonly indent: number;
  readonly tokens: readonly SceneDocumentYamlSubsetToken[];
}

interface SceneDocumentYamlSubsetLexSuccess {
  readonly ok: true;
  readonly lines: readonly SceneDocumentYamlSubsetLine[];
}

type SceneDocumentYamlSubsetLexResult = SceneDocumentYamlSubsetLexSuccess | SceneDocumentYamlSubsetRefusal;

interface SceneDocumentYamlSubsetQuotedToken {
  readonly ok: true;
  readonly nextOffset: number;
  readonly token: SceneDocumentYamlSubsetToken;
}

interface SceneDocumentYamlSubsetPosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

const PARSE_FAILURE = Symbol('scene-document-yaml-subset-parse-failure');

type SceneDocumentYamlSubsetParseValue = SceneDocumentYamlSubsetValue | typeof PARSE_FAILURE;

/**
 * Parses the deliberately closed YAML subset that will underlie Flight document text. The module is
 * private because it yields syntax values only; it does not claim or materialize a scene schema.
 */
export function parseSceneDocumentYamlSubset(source: string): SceneDocumentYamlSubsetResult {
  if (source.length > MAX_DOCUMENT_CODE_UNITS) {
    const position = getSceneDocumentYamlSubsetPosition(source, MAX_DOCUMENT_CODE_UNITS);
    return createSceneDocumentYamlSubsetRefusal(
      'flight-document.limit.document-code-units',
      position,
      MAX_DOCUMENT_CODE_UNITS,
      source.length,
    );
  }

  const lexed = new SceneDocumentYamlSubsetLexer(source).lex();
  if (!lexed.ok) return lexed;
  return new SceneDocumentYamlSubsetParser(lexed.lines).parse();
}

class SceneDocumentYamlSubsetLexer {
  private readonly source: string;

  public constructor(source: string) {
    this.source = source;
  }

  public lex(): SceneDocumentYamlSubsetLexResult {
    const lines: SceneDocumentYamlSubsetLine[] = [];
    let line = 1;
    let lineStart = 0;
    let offset = 0;

    while (offset < this.source.length) {
      let indent = 0;
      while (this.source[offset] === ' ') {
        offset++;
        indent++;
      }
      if (this.source[offset] === '\t') {
        return this.refuse('flight-document.syntax.tab-character', offset, line, offset - lineStart + 1);
      }

      const tokens: SceneDocumentYamlSubsetToken[] = [];
      let flowDepth = 0;
      while (offset < this.source.length && !isSceneDocumentYamlSubsetLineBreak(this.source[offset])) {
        while (this.source[offset] === ' ') offset++;
        if (this.source[offset] === '\t') {
          return this.refuse('flight-document.syntax.tab-character', offset, line, offset - lineStart + 1);
        }
        if (offset >= this.source.length || isSceneDocumentYamlSubsetLineBreak(this.source[offset])) break;
        if (this.source[offset] === '#') {
          while (offset < this.source.length && !isSceneDocumentYamlSubsetLineBreak(this.source[offset])) offset++;
          break;
        }

        const column = offset - lineStart + 1;
        if (tokens.length === 0 && flowDepth === 0 && isSceneDocumentYamlSubsetDocumentSeparator(this.source, offset)) {
          return this.refuse('flight-document.unsupported.document-separator', offset, line, column);
        }

        const character = this.source[offset];
        if (character === '"' || character === "'") {
          const quoted = this.lexQuotedScalar(offset, line, lineStart);
          if (!quoted.ok) return quoted;
          tokens.push(quoted.token);
          offset = quoted.nextOffset;
          continue;
        }
        if (character === '[' || character === ']') {
          return this.refuse('flight-document.unsupported.flow-sequence', offset, line, column);
        }
        if (character === '&') return this.refuse('flight-document.unsupported.anchor', offset, line, column);
        if (character === '*') return this.refuse('flight-document.unsupported.alias', offset, line, column);
        if (character === '!') return this.refuse('flight-document.unsupported.tag', offset, line, column);
        if (character === '|' || character === '>') {
          return this.refuse('flight-document.unsupported.block-scalar', offset, line, column);
        }
        if (character === '{') {
          tokens.push(createSceneDocumentYamlSubsetToken('flow-mapping-start', offset, line, column));
          flowDepth++;
          offset++;
          continue;
        }
        if (character === '}') {
          if (flowDepth === 0) return this.refuse('flight-document.syntax.unexpected-token', offset, line, column);
          tokens.push(createSceneDocumentYamlSubsetToken('flow-mapping-end', offset, line, column));
          flowDepth--;
          offset++;
          continue;
        }
        if (character === ',') {
          if (flowDepth === 0) return this.refuse('flight-document.syntax.unexpected-token', offset, line, column);
          tokens.push(createSceneDocumentYamlSubsetToken('comma', offset, line, column));
          offset++;
          continue;
        }
        if (character === ':') {
          tokens.push(createSceneDocumentYamlSubsetToken('colon', offset, line, column));
          offset++;
          continue;
        }
        if (character === '-' && flowDepth === 0 && isSceneDocumentYamlSubsetSeparation(this.source[offset + 1])) {
          tokens.push(createSceneDocumentYamlSubsetToken('sequence-item', offset, line, column));
          offset++;
          continue;
        }

        const plain = this.lexPlainScalar(offset, line, lineStart, flowDepth);
        if (!plain.ok) return plain;
        tokens.push(plain.token);
        offset = plain.nextOffset;
      }

      if (flowDepth !== 0) {
        return this.refuse('flight-document.syntax.unterminated-flow-mapping', offset, line, offset - lineStart + 1);
      }
      if (tokens.length > 0) lines.push({ indent, tokens });

      if (this.source[offset] === '\r') offset++;
      if (this.source[offset] === '\n') offset++;
      if (offset > lineStart) {
        line++;
        lineStart = offset;
      }
    }

    return { ok: true, lines };
  }

  private lexDoubleQuotedScalar(
    start: number,
    line: number,
    lineStart: number,
  ): SceneDocumentYamlSubsetQuotedToken | SceneDocumentYamlSubsetRefusal {
    let offset = start + 1;
    let value = '';
    while (offset < this.source.length && !isSceneDocumentYamlSubsetLineBreak(this.source[offset])) {
      const character = this.source[offset];
      if (character === '"') {
        return {
          ok: true,
          nextOffset: offset + 1,
          token: createSceneDocumentYamlSubsetToken('scalar', start, line, start - lineStart + 1, value, true),
        };
      }
      if (character !== '\\') {
        const refusal = this.appendDecodedScalar(value, character, offset, line, lineStart);
        if (refusal !== null) return refusal;
        value += character;
        offset++;
        continue;
      }

      const escape = this.source[offset + 1];
      if (escape === undefined || isSceneDocumentYamlSubsetLineBreak(escape)) {
        return this.refuse('flight-document.syntax.invalid-escape', offset, line, offset - lineStart + 1);
      }
      const simpleEscape = DOUBLE_QUOTED_ESCAPES[escape];
      if (simpleEscape !== undefined) {
        const refusal = this.appendDecodedScalar(value, simpleEscape, offset, line, lineStart);
        if (refusal !== null) return refusal;
        value += simpleEscape;
        offset += 2;
        continue;
      }
      if (escape !== 'u') {
        return this.refuse('flight-document.syntax.invalid-escape', offset, line, offset - lineStart + 1);
      }

      const code = this.source.slice(offset + 2, offset + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(code)) {
        return this.refuse('flight-document.syntax.invalid-escape', offset, line, offset - lineStart + 1);
      }
      const decoded = String.fromCharCode(Number.parseInt(code, 16));
      const refusal = this.appendDecodedScalar(value, decoded, offset, line, lineStart);
      if (refusal !== null) return refusal;
      value += decoded;
      offset += 6;
    }
    return this.refuse('flight-document.syntax.unterminated-quoted-scalar', start, line, start - lineStart + 1);
  }

  private lexPlainScalar(
    start: number,
    line: number,
    lineStart: number,
    flowDepth: number,
  ): SceneDocumentYamlSubsetQuotedToken | SceneDocumentYamlSubsetRefusal {
    let end = start;
    let offset = start;
    while (offset < this.source.length && !isSceneDocumentYamlSubsetLineBreak(this.source[offset])) {
      const character = this.source[offset];
      if (character === '\t') {
        return this.refuse('flight-document.syntax.tab-character', offset, line, offset - lineStart + 1);
      }
      if (character === '#' && isSceneDocumentYamlSubsetSeparation(this.source[offset - 1])) break;
      if (character === ':' && isSceneDocumentYamlSubsetMappingColon(this.source[offset + 1])) break;
      if (flowDepth > 0 && (character === ',' || character === '}')) break;
      if (character === ' ') {
        let next = offset + 1;
        while (this.source[next] === ' ') next++;
        if (isSceneDocumentYamlSubsetUnsupportedIndicator(this.source[next])) break;
      }

      if (character !== ' ') {
        end = offset + 1;
        const actual = end - start;
        if (actual > MAX_SCALAR_CODE_UNITS) {
          return this.refuse(
            'flight-document.limit.scalar-code-units',
            offset,
            line,
            offset - lineStart + 1,
            MAX_SCALAR_CODE_UNITS,
            actual,
          );
        }
      }
      offset++;
    }

    return {
      ok: true,
      nextOffset: offset,
      token: createSceneDocumentYamlSubsetToken(
        'scalar',
        start,
        line,
        start - lineStart + 1,
        this.source.slice(start, end),
        false,
      ),
    };
  }

  private lexQuotedScalar(
    start: number,
    line: number,
    lineStart: number,
  ): SceneDocumentYamlSubsetQuotedToken | SceneDocumentYamlSubsetRefusal {
    return this.source[start] === '"'
      ? this.lexDoubleQuotedScalar(start, line, lineStart)
      : this.lexSingleQuotedScalar(start, line, lineStart);
  }

  private lexSingleQuotedScalar(
    start: number,
    line: number,
    lineStart: number,
  ): SceneDocumentYamlSubsetQuotedToken | SceneDocumentYamlSubsetRefusal {
    let offset = start + 1;
    let value = '';
    while (offset < this.source.length && !isSceneDocumentYamlSubsetLineBreak(this.source[offset])) {
      const character = this.source[offset];
      if (character !== "'") {
        const refusal = this.appendDecodedScalar(value, character, offset, line, lineStart);
        if (refusal !== null) return refusal;
        value += character;
        offset++;
        continue;
      }
      if (this.source[offset + 1] === "'") {
        const refusal = this.appendDecodedScalar(value, "'", offset, line, lineStart);
        if (refusal !== null) return refusal;
        value += "'";
        offset += 2;
        continue;
      }
      return {
        ok: true,
        nextOffset: offset + 1,
        token: createSceneDocumentYamlSubsetToken('scalar', start, line, start - lineStart + 1, value, true),
      };
    }
    return this.refuse('flight-document.syntax.unterminated-quoted-scalar', start, line, start - lineStart + 1);
  }

  private appendDecodedScalar(
    current: string,
    next: string,
    offset: number,
    line: number,
    lineStart: number,
  ): SceneDocumentYamlSubsetRefusal | null {
    const actual = current.length + next.length;
    return actual <= MAX_SCALAR_CODE_UNITS
      ? null
      : this.refuse(
          'flight-document.limit.scalar-code-units',
          offset,
          line,
          offset - lineStart + 1,
          MAX_SCALAR_CODE_UNITS,
          actual,
        );
  }

  private refuse(
    kind: SceneDocumentYamlSubsetRefusalReason,
    offset: number,
    line: number,
    column: number,
    limit: number | null = null,
    actual: number | null = null,
  ): SceneDocumentYamlSubsetRefusal {
    return createSceneDocumentYamlSubsetRefusal(kind, { offset, line, column }, limit, actual);
  }
}

class SceneDocumentYamlSubsetParser {
  private readonly lines: readonly SceneDocumentYamlSubsetLine[];
  private index = 0;
  private nodeCount = 0;
  private refusal: SceneDocumentYamlSubsetRefusal | null = null;

  public constructor(lines: readonly SceneDocumentYamlSubsetLine[]) {
    this.lines = lines;
  }

  public parse(): SceneDocumentYamlSubsetResult {
    if (this.lines.length === 0) return { ok: true, value: null };
    const first = this.lines[0];
    if (first.indent !== 0) {
      return this.createRefusal('flight-document.syntax.root-indentation', first.tokens[0]);
    }

    const value = this.parseBlock(0, 1);
    if (value === PARSE_FAILURE) return this.getRefusal();
    if (this.index !== this.lines.length) {
      return this.createRefusal('flight-document.syntax.multiple-root-values', this.lines[this.index].tokens[0]);
    }
    return { ok: true, value };
  }

  private addMappingEntry(
    mapping: SceneDocumentYamlSubsetMapping,
    count: number,
    tokens: readonly SceneDocumentYamlSubsetToken[],
    colonIndex: number,
    indent: number,
    depth: number,
  ): number | typeof PARSE_FAILURE {
    const colon = tokens[colonIndex];
    if (count >= MAX_COLLECTION_ENTRIES) {
      return this.refuse(
        'flight-document.limit.collection-entries',
        tokens[0] ?? colon,
        MAX_COLLECTION_ENTRIES,
        count + 1,
      );
    }
    if (colonIndex !== 1 || tokens[0]?.kind !== 'scalar') {
      return this.refuse('flight-document.syntax.expected-mapping-key', tokens[0] ?? colon);
    }

    const key = tokens[0].value;
    if (key.length > MAX_KEY_CODE_UNITS) {
      return this.refuse('flight-document.limit.key-code-units', tokens[0], MAX_KEY_CODE_UNITS, key.length);
    }
    if (Object.hasOwn(mapping, key)) return this.refuse('flight-document.syntax.duplicate-key', tokens[0]);

    let value: SceneDocumentYamlSubsetParseValue;
    if (colonIndex + 1 === tokens.length) {
      const next = this.lines[this.index];
      if (next !== undefined && next.indent > indent) value = this.parseBlock(next.indent, depth + 1);
      else value = this.parseNull(colon);
    } else {
      value = this.parseInline(tokens, colonIndex + 1, depth + 1);
    }
    if (value === PARSE_FAILURE) return PARSE_FAILURE;

    mapping[key] = value;
    return count + 1;
  }

  private checkCollection(depth: number, token: SceneDocumentYamlSubsetToken): boolean {
    if (depth > MAX_NESTING_DEPTH) {
      this.refuse('flight-document.limit.nesting-depth', token, MAX_NESTING_DEPTH, depth);
      return false;
    }
    return this.checkNode(token);
  }

  private checkNode(token: SceneDocumentYamlSubsetToken): boolean {
    if (this.nodeCount >= MAX_TOTAL_NODES) {
      this.refuse('flight-document.limit.total-nodes', token, MAX_TOTAL_NODES, this.nodeCount + 1);
      return false;
    }
    this.nodeCount++;
    return true;
  }

  private createRefusal(
    kind: SceneDocumentYamlSubsetRefusalReason,
    token: SceneDocumentYamlSubsetToken,
    limit: number | null = null,
    actual: number | null = null,
  ): SceneDocumentYamlSubsetRefusal {
    return createSceneDocumentYamlSubsetRefusal(kind, token, limit, actual);
  }

  private getRefusal(): SceneDocumentYamlSubsetRefusal {
    return (
      this.refusal ??
      createSceneDocumentYamlSubsetRefusal('flight-document.syntax.invalid-document', { offset: 0, line: 1, column: 1 })
    );
  }

  private parseBlock(indent: number, depth: number): SceneDocumentYamlSubsetParseValue {
    const line = this.lines[this.index];
    const first = line?.tokens[0];
    if (line === undefined || first === undefined) return PARSE_FAILURE;
    if (line.indent !== indent) return this.refuse('flight-document.syntax.unexpected-indentation', first);
    if (first.kind === 'sequence-item') return this.parseBlockSequence(indent, depth);
    if (findSceneDocumentYamlSubsetTopLevelColon(line.tokens, 0) >= 0) {
      return this.parseBlockMapping(indent, depth);
    }

    this.index++;
    const value = this.parseInline(line.tokens, 0, depth);
    if (value === PARSE_FAILURE) return PARSE_FAILURE;
    const next = this.lines[this.index];
    if (next !== undefined && next.indent > indent) {
      return this.refuse('flight-document.syntax.unexpected-indentation', next.tokens[0]);
    }
    return value;
  }

  private parseBlockMapping(indent: number, depth: number): SceneDocumentYamlSubsetParseValue {
    const first = this.lines[this.index].tokens[0];
    if (!this.checkCollection(depth, first)) return PARSE_FAILURE;

    const mapping: SceneDocumentYamlSubsetMapping = Object.create(null);
    let count = 0;
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      const firstToken = line.tokens[0];
      if (line.indent < indent) break;
      if (line.indent > indent) {
        return this.refuse('flight-document.syntax.unexpected-indentation', firstToken);
      }
      if (firstToken.kind === 'sequence-item') {
        return this.refuse('flight-document.syntax.mixed-collection', firstToken);
      }

      const colonIndex = findSceneDocumentYamlSubsetTopLevelColon(line.tokens, 0);
      if (colonIndex < 0) return this.refuse('flight-document.syntax.expected-mapping-entry', firstToken);
      this.index++;
      const nextCount = this.addMappingEntry(mapping, count, line.tokens, colonIndex, indent, depth);
      if (nextCount === PARSE_FAILURE) return PARSE_FAILURE;
      count = nextCount;
    }
    return mapping;
  }

  private parseBlockSequence(indent: number, depth: number): SceneDocumentYamlSubsetParseValue {
    const first = this.lines[this.index].tokens[0];
    if (!this.checkCollection(depth, first)) return PARSE_FAILURE;

    const sequence: SceneDocumentYamlSubsetValue[] = [];
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      const item = line.tokens[0];
      if (line.indent < indent) break;
      if (line.indent > indent) return this.refuse('flight-document.syntax.unexpected-indentation', item);
      if (item.kind !== 'sequence-item') return this.refuse('flight-document.syntax.mixed-collection', item);
      if (sequence.length >= MAX_COLLECTION_ENTRIES) {
        return this.refuse(
          'flight-document.limit.collection-entries',
          item,
          MAX_COLLECTION_ENTRIES,
          sequence.length + 1,
        );
      }

      this.index++;
      let value: SceneDocumentYamlSubsetParseValue;
      if (line.tokens.length === 1) {
        const next = this.lines[this.index];
        value =
          next !== undefined && next.indent > indent ? this.parseBlock(next.indent, depth + 1) : this.parseNull(item);
      } else {
        const colonIndex = findSceneDocumentYamlSubsetTopLevelColon(line.tokens, 1);
        value =
          colonIndex >= 0
            ? this.parseSequenceMapping(line, indent, depth + 1, colonIndex)
            : this.parseInline(line.tokens, 1, depth + 1);
      }
      if (value === PARSE_FAILURE) return PARSE_FAILURE;
      sequence.push(value);

      const next = this.lines[this.index];
      if (next !== undefined && next.indent > indent) {
        return this.refuse('flight-document.syntax.unexpected-indentation', next.tokens[0]);
      }
    }
    return sequence;
  }

  private parseFlowMapping(
    tokens: readonly SceneDocumentYamlSubsetToken[],
    cursor: { index: number },
    depth: number,
  ): SceneDocumentYamlSubsetParseValue {
    const start = tokens[cursor.index];
    if (!this.checkCollection(depth, start)) return PARSE_FAILURE;

    const mapping: SceneDocumentYamlSubsetMapping = Object.create(null);
    let count = 0;
    cursor.index++;
    if (tokens[cursor.index]?.kind === 'flow-mapping-end') {
      cursor.index++;
      return mapping;
    }

    while (cursor.index < tokens.length) {
      const keyToken = tokens[cursor.index];
      if (count >= MAX_COLLECTION_ENTRIES) {
        return this.refuse('flight-document.limit.collection-entries', keyToken, MAX_COLLECTION_ENTRIES, count + 1);
      }
      if (keyToken.kind !== 'scalar') return this.refuse('flight-document.syntax.expected-mapping-key', keyToken);
      if (keyToken.value.length > MAX_KEY_CODE_UNITS) {
        return this.refuse('flight-document.limit.key-code-units', keyToken, MAX_KEY_CODE_UNITS, keyToken.value.length);
      }
      if (Object.hasOwn(mapping, keyToken.value)) {
        return this.refuse('flight-document.syntax.duplicate-key', keyToken);
      }
      cursor.index++;

      const colon = tokens[cursor.index];
      if (colon?.kind !== 'colon') {
        return this.refuse('flight-document.syntax.expected-mapping-entry', colon ?? keyToken);
      }
      cursor.index++;

      const valueToken = tokens[cursor.index];
      if (valueToken === undefined) return this.refuse('flight-document.syntax.expected-value', colon);
      let value: SceneDocumentYamlSubsetParseValue;
      if (valueToken.kind === 'flow-mapping-start') value = this.parseFlowMapping(tokens, cursor, depth + 1);
      else if (valueToken.kind === 'scalar') {
        cursor.index++;
        value = this.parseScalar(valueToken);
      } else return this.refuse('flight-document.syntax.expected-value', valueToken);
      if (value === PARSE_FAILURE) return PARSE_FAILURE;

      mapping[keyToken.value] = value;
      count++;
      const delimiter = tokens[cursor.index];
      if (delimiter?.kind === 'flow-mapping-end') {
        cursor.index++;
        return mapping;
      }
      if (delimiter?.kind !== 'comma') {
        return this.refuse('flight-document.syntax.expected-flow-delimiter', delimiter ?? valueToken);
      }
      cursor.index++;
      if (tokens[cursor.index]?.kind === 'flow-mapping-end') {
        return this.refuse('flight-document.syntax.trailing-flow-comma', tokens[cursor.index]);
      }
    }

    return this.refuse('flight-document.syntax.unterminated-flow-mapping', start);
  }

  private parseInline(
    tokens: readonly SceneDocumentYamlSubsetToken[],
    start: number,
    depth: number,
  ): SceneDocumentYamlSubsetParseValue {
    const token = tokens[start];
    if (token === undefined) return PARSE_FAILURE;
    if (token.kind === 'flow-mapping-start') {
      const cursor = { index: start };
      const value = this.parseFlowMapping(tokens, cursor, depth);
      if (value === PARSE_FAILURE) return PARSE_FAILURE;
      if (cursor.index !== tokens.length) {
        return this.refuse('flight-document.syntax.trailing-flow-content', tokens[cursor.index]);
      }
      return value;
    }
    if (token.kind !== 'scalar' || start + 1 !== tokens.length) {
      return this.refuse('flight-document.syntax.expected-scalar', token);
    }
    return this.parseScalar(token);
  }

  private parseNull(token: SceneDocumentYamlSubsetToken): SceneDocumentYamlSubsetParseValue {
    return this.checkNode(token) ? null : PARSE_FAILURE;
  }

  private parseScalar(token: SceneDocumentYamlSubsetToken): SceneDocumentYamlSubsetParseValue {
    if (!this.checkNode(token)) return PARSE_FAILURE;
    if (token.quoted) return token.value;
    if (token.value === 'null') return null;
    if (token.value === 'true') return true;
    if (token.value === 'false') return false;

    if (HEX_INTEGER_PATTERN.test(token.value)) {
      const value = Number.parseInt(token.value.slice(2), 16);
      return Number.isSafeInteger(value) ? value : this.refuse('flight-document.scalar.number-out-of-range', token);
    }
    if (DECIMAL_NUMBER_PATTERN.test(token.value)) {
      const value = Number(token.value);
      if (!Number.isFinite(value)) return this.refuse('flight-document.scalar.number-out-of-range', token);
      if (!token.value.includes('.') && !/[eE]/.test(token.value) && !Number.isSafeInteger(value)) {
        return this.refuse('flight-document.scalar.number-out-of-range', token);
      }
      return value;
    }
    return token.value;
  }

  private parseSequenceMapping(
    line: SceneDocumentYamlSubsetLine,
    sequenceIndent: number,
    depth: number,
    colonIndex: number,
  ): SceneDocumentYamlSubsetParseValue {
    const first = line.tokens[1];
    if (!this.checkCollection(depth, first)) return PARSE_FAILURE;

    const mapping: SceneDocumentYamlSubsetMapping = Object.create(null);
    const mappingIndent = sequenceIndent + 2;
    let count: number | typeof PARSE_FAILURE = this.addMappingEntry(
      mapping,
      0,
      line.tokens.slice(1),
      colonIndex - 1,
      mappingIndent,
      depth,
    );
    if (count === PARSE_FAILURE) return PARSE_FAILURE;

    while (this.index < this.lines.length) {
      const nextLine = this.lines[this.index];
      const nextFirst = nextLine.tokens[0];
      if (nextLine.indent <= sequenceIndent) break;
      if (nextLine.indent !== mappingIndent) {
        return this.refuse('flight-document.syntax.unexpected-indentation', nextFirst);
      }
      if (nextFirst.kind === 'sequence-item') {
        return this.refuse('flight-document.syntax.mixed-collection', nextFirst);
      }

      const nextColon = findSceneDocumentYamlSubsetTopLevelColon(nextLine.tokens, 0);
      if (nextColon < 0) return this.refuse('flight-document.syntax.expected-mapping-entry', nextFirst);
      this.index++;
      count = this.addMappingEntry(mapping, count, nextLine.tokens, nextColon, mappingIndent, depth);
      if (count === PARSE_FAILURE) return PARSE_FAILURE;
    }
    return mapping;
  }

  private refuse(
    kind: SceneDocumentYamlSubsetRefusalReason,
    token: SceneDocumentYamlSubsetToken,
    limit: number | null = null,
    actual: number | null = null,
  ): typeof PARSE_FAILURE {
    this.refusal ??= this.createRefusal(kind, token, limit, actual);
    return PARSE_FAILURE;
  }
}

function createSceneDocumentYamlSubsetRefusal(
  kind: SceneDocumentYamlSubsetRefusalReason,
  position: SceneDocumentYamlSubsetPosition,
  limit: number | null = null,
  actual: number | null = null,
): SceneDocumentYamlSubsetRefusal {
  return {
    ok: false,
    kind,
    limit,
    actual,
    offset: position.offset,
    line: position.line,
    column: position.column,
  };
}

function createSceneDocumentYamlSubsetToken(
  kind: SceneDocumentYamlSubsetTokenKind,
  offset: number,
  line: number,
  column: number,
  value = '',
  quoted = false,
): SceneDocumentYamlSubsetToken {
  return { kind, value, quoted, offset, line, column };
}

function findSceneDocumentYamlSubsetTopLevelColon(
  tokens: readonly SceneDocumentYamlSubsetToken[],
  start: number,
): number {
  let flowDepth = 0;
  for (let index = start; index < tokens.length; index++) {
    const kind = tokens[index].kind;
    if (kind === 'flow-mapping-start') flowDepth++;
    else if (kind === 'flow-mapping-end') flowDepth--;
    else if (kind === 'colon' && flowDepth === 0) return index;
  }
  return -1;
}

function getSceneDocumentYamlSubsetPosition(source: string, offset: number): SceneDocumentYamlSubsetPosition {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset; index++) {
    if (source[index] === '\n') {
      line++;
      column = 1;
    } else column++;
  }
  return { offset, line, column };
}

function isSceneDocumentYamlSubsetDocumentSeparator(source: string, offset: number): boolean {
  const candidate = source.slice(offset, offset + 3);
  return (candidate === '---' || candidate === '...') && isSceneDocumentYamlSubsetSeparation(source[offset + 3]);
}

function isSceneDocumentYamlSubsetLineBreak(character: string | undefined): boolean {
  return character === '\n' || character === '\r';
}

function isSceneDocumentYamlSubsetMappingColon(character: string | undefined): boolean {
  return isSceneDocumentYamlSubsetSeparation(character) || character === '{' || character === '"' || character === "'";
}

function isSceneDocumentYamlSubsetSeparation(character: string | undefined): boolean {
  return (
    character === undefined || character === ' ' || character === '\t' || isSceneDocumentYamlSubsetLineBreak(character)
  );
}

function isSceneDocumentYamlSubsetUnsupportedIndicator(character: string | undefined): boolean {
  return (
    character === '&' ||
    character === '*' ||
    character === '!' ||
    character === '[' ||
    character === ']' ||
    character === '|' ||
    character === '>'
  );
}

const MAX_DOCUMENT_CODE_UNITS = 4_194_304;
const MAX_NESTING_DEPTH = 64;
const MAX_COLLECTION_ENTRIES = 65_536;
const MAX_SCALAR_CODE_UNITS = 65_536;
const MAX_KEY_CODE_UNITS = 256;
const MAX_TOTAL_NODES = 262_144;
const DECIMAL_NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const HEX_INTEGER_PATTERN = /^0x[0-9a-fA-F]+$/;
const DOUBLE_QUOTED_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};
