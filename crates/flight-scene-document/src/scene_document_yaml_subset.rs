//! The deliberately closed YAML subset underlying Flight document text (TS
//! `sceneDocumentYamlSubset.ts`). It yields syntax values only; it does not claim or materialize a
//! scene schema.
//!
//! Lexing runs over the source's UTF-16 code units, so every limit, offset and column is the
//! source's code-unit count (D15). Decoded scalars become Rust strings; a lone surrogate written as
//! a `\u` escape has no UTF-8 form and decodes to U+FFFD (D15 non-representable).

// flight-lint: allow-file(contract-vocabulary) i64 limits and counts project JS safe integers (|n| <= 2^53)

// flight-lint: allow-file(f64) D1: YAML subset numbers are JS Numbers; Number.isSafeInteger and exact decimal parsing need double precision

use flight_entity::{Record, has_record_key, set_record_value};

use crate::types::FlightDocumentRefusalReason;

/// A parsed syntax value of the subset.
#[derive(Clone, Debug)]
pub enum SceneDocumentYamlSubsetValue {
    Boolean(bool),
    Mapping(SceneDocumentYamlSubsetMapping),
    Null,
    Number(f64),
    // flight-lint: allow(enum-payload-named) a source array value maps directly to Vec; a wrapper struct adds no semantic value
    Sequence(Vec<SceneDocumentYamlSubsetValue>),
    String(String),
}

/// A parsed mapping, in JavaScript property order.
pub type SceneDocumentYamlSubsetMapping = Record<SceneDocumentYamlSubsetValue>;

/// A positioned subset refusal. `kind` is always one of the lexer/parser identities of the public
/// refusal taxonomy; `offset`, `line` and `column` are UTF-16 code-unit positions.
#[derive(Clone, Debug, PartialEq)]
pub struct SceneDocumentYamlSubsetRefusal {
    pub kind: FlightDocumentRefusalReason,
    pub limit: Option<i64>,
    pub actual: Option<i64>,
    pub offset: usize,
    pub line: usize,
    pub column: usize,
}

/// The parse result: a value, or the first refusal (TS `{ ok: true, value } | { ok: false, … }`).
#[derive(Clone, Debug)]
pub enum SceneDocumentYamlSubsetResult {
    Ok(SceneDocumentYamlSubsetValue),
    Refusal(SceneDocumentYamlSubsetRefusal),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TokenKind {
    Colon,
    Comma,
    FlowMappingEnd,
    FlowMappingStart,
    Scalar,
    SequenceItem,
}

#[derive(Clone, Debug)]
struct Token {
    kind: TokenKind,
    value: Vec<u16>,
    quoted: bool,
    offset: usize,
    line: usize,
    column: usize,
}

#[derive(Clone, Debug)]
struct Line {
    indent: usize,
    tokens: Vec<Token>,
}

#[derive(Clone, Copy)]
struct Position {
    offset: usize,
    line: usize,
    column: usize,
}

struct Lexer {
    source: Vec<u16>,
}

struct Parser {
    lines: Vec<Line>,
    index: usize,
    node_count: usize,
    refusal: Option<SceneDocumentYamlSubsetRefusal>,
}

// A parse step: the value, or failure with the first refusal recorded on the parser.
type ParseValue = Option<SceneDocumentYamlSubsetValue>;

fn create_refusal(
    kind: FlightDocumentRefusalReason,
    position: Position,
    limit: Option<i64>,
    actual: Option<i64>,
) -> SceneDocumentYamlSubsetRefusal {
    return SceneDocumentYamlSubsetRefusal {
        kind,
        limit,
        actual,
        offset: position.offset,
        line: position.line,
        column: position.column,
    };
}

fn create_token(kind: TokenKind, offset: usize, line: usize, column: usize) -> Token {
    return Token {
        kind,
        value: Vec::new(),
        quoted: false,
        offset,
        line,
        column,
    };
}

fn find_top_level_colon(tokens: &[Token], start: usize) -> Option<usize> {
    let mut flow_depth: i64 = 0;
    for (index, token) in tokens.iter().enumerate().skip(start) {
        match token.kind {
            TokenKind::FlowMappingStart => flow_depth += 1,
            TokenKind::FlowMappingEnd => flow_depth -= 1,
            TokenKind::Colon if flow_depth == 0 => return Some(index),
            _ => {}
        }
    }
    return None;
}

fn get_double_quoted_escape(escape: u16) -> Option<u16> {
    let decoded = match u8::try_from(escape).ok()? {
        b'"' => b'"',
        b'\\' => b'\\',
        b'/' => b'/',
        b'b' => 0x08,
        b'f' => 0x0c,
        b'n' => b'\n',
        b'r' => b'\r',
        b't' => b'\t',
        _ => return None,
    };
    return Some(u16::from(decoded));
}

fn get_position(source: &[u16], offset: usize) -> Position {
    let mut line = 1;
    let mut column = 1;
    for unit in &source[..offset] {
        if *unit == LF {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }
    return Position {
        offset,
        line,
        column,
    };
}

fn is_decimal_number(value: &[u16]) -> bool {
    // ^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$
    let mut index = 0;
    if value.get(index) == Some(&MINUS) {
        index += 1;
    }
    match value.get(index) {
        Some(&ZERO) => index += 1,
        Some(unit) if is_digit(*unit) => {
            while value.get(index).is_some_and(|unit| is_digit(*unit)) {
                index += 1;
            }
        }
        _ => return false,
    }
    if value.get(index) == Some(&DOT) {
        index += 1;
        if !value.get(index).is_some_and(|unit| is_digit(*unit)) {
            return false;
        }
        while value.get(index).is_some_and(|unit| is_digit(*unit)) {
            index += 1;
        }
    }
    if value.get(index) == Some(&LOWER_E) || value.get(index) == Some(&UPPER_E) {
        index += 1;
        if value.get(index) == Some(&PLUS) || value.get(index) == Some(&MINUS) {
            index += 1;
        }
        if !value.get(index).is_some_and(|unit| is_digit(*unit)) {
            return false;
        }
        while value.get(index).is_some_and(|unit| is_digit(*unit)) {
            index += 1;
        }
    }
    return index == value.len();
}

fn is_digit(unit: u16) -> bool {
    return (ZERO..=ZERO + 9).contains(&unit);
}

fn is_document_separator(source: &[u16], offset: usize) -> bool {
    let candidate = &source[offset..(offset + 3).min(source.len())];
    let dashes = [MINUS, MINUS, MINUS];
    let dots = [DOT, DOT, DOT];
    return (candidate == dashes || candidate == dots)
        && is_separation(source.get(offset + 3).copied());
}

fn is_hex_digit(unit: u16) -> bool {
    return is_digit(unit)
        || (u16::from(b'a')..=u16::from(b'f')).contains(&unit)
        || (u16::from(b'A')..=u16::from(b'F')).contains(&unit);
}

fn is_hex_integer(value: &[u16]) -> bool {
    // ^0x[0-9a-fA-F]+$
    return value.len() > 2
        && value[0] == ZERO
        && value[1] == u16::from(b'x')
        && value[2..].iter().all(|unit| is_hex_digit(*unit));
}

fn is_line_break(unit: Option<u16>) -> bool {
    return unit == Some(LF) || unit == Some(CR);
}

fn is_mapping_colon(unit: Option<u16>) -> bool {
    return is_separation(unit)
        || unit == Some(LEFT_BRACE)
        || unit == Some(DOUBLE_QUOTE)
        || unit == Some(SINGLE_QUOTE);
}

fn is_separation(unit: Option<u16>) -> bool {
    return unit.is_none() || unit == Some(SPACE) || unit == Some(TAB) || is_line_break(unit);
}

fn is_unsupported_indicator(unit: Option<u16>) -> bool {
    return [
        AMPERSAND,
        ASTERISK,
        BANG,
        LEFT_BRACKET,
        RIGHT_BRACKET,
        PIPE,
        GREATER,
    ]
    .iter()
    .any(|indicator| unit == Some(*indicator));
}

fn lexer_append_decoded_scalar(
    current: usize,
    next: usize,
    offset: usize,
    line: usize,
    line_start: usize,
) -> Option<SceneDocumentYamlSubsetRefusal> {
    let actual = current + next;
    if actual <= MAX_SCALAR_CODE_UNITS {
        return None;
    }
    return Some(lexer_refuse(
        FlightDocumentRefusalReason::ScalarCodeUnitsLimitExceeded,
        offset,
        line,
        offset - line_start + 1,
        Some(MAX_SCALAR_CODE_UNITS as i64),
        Some(actual as i64),
    ));
}

fn lexer_at(lexer: &Lexer, offset: usize) -> Option<u16> {
    return lexer.source.get(offset).copied();
}

fn lexer_lex(lexer: &Lexer) -> Result<Vec<Line>, SceneDocumentYamlSubsetRefusal> {
    let mut lines: Vec<Line> = Vec::new();
    let mut line = 1;
    let mut line_start = 0;
    let mut offset = 0;
    let length = lexer.source.len();

    while offset < length {
        let mut indent = 0;
        while lexer_at(lexer, offset) == Some(SPACE) {
            offset += 1;
            indent += 1;
        }
        if lexer_at(lexer, offset) == Some(TAB) {
            return Err(lexer_refuse_at(
                FlightDocumentRefusalReason::TabCharacter,
                offset,
                line,
                line_start,
            ));
        }

        let mut tokens: Vec<Token> = Vec::new();
        let mut flow_depth = 0;
        while offset < length && !is_line_break(lexer_at(lexer, offset)) {
            while lexer_at(lexer, offset) == Some(SPACE) {
                offset += 1;
            }
            if lexer_at(lexer, offset) == Some(TAB) {
                return Err(lexer_refuse_at(
                    FlightDocumentRefusalReason::TabCharacter,
                    offset,
                    line,
                    line_start,
                ));
            }
            if offset >= length || is_line_break(lexer_at(lexer, offset)) {
                break;
            }
            if lexer_at(lexer, offset) == Some(HASH) {
                while offset < length && !is_line_break(lexer_at(lexer, offset)) {
                    offset += 1;
                }
                break;
            }

            let column = offset - line_start + 1;
            if tokens.is_empty() && flow_depth == 0 && is_document_separator(&lexer.source, offset)
            {
                return Err(lexer_refuse(
                    FlightDocumentRefusalReason::DocumentSeparatorUnsupported,
                    offset,
                    line,
                    column,
                    None,
                    None,
                ));
            }

            let character = lexer.source[offset];
            if character == DOUBLE_QUOTE || character == SINGLE_QUOTE {
                let (token, next_offset) =
                    lexer_lex_quoted_scalar(lexer, offset, line, line_start)?;
                tokens.push(token);
                offset = next_offset;
                continue;
            }
            let indicator = match character {
                LEFT_BRACKET | RIGHT_BRACKET => {
                    Some(FlightDocumentRefusalReason::FlowSequenceUnsupported)
                }
                AMPERSAND => Some(FlightDocumentRefusalReason::AnchorUnsupported),
                ASTERISK => Some(FlightDocumentRefusalReason::AliasUnsupported),
                BANG => Some(FlightDocumentRefusalReason::TagUnsupported),
                PIPE | GREATER => Some(FlightDocumentRefusalReason::BlockScalarUnsupported),
                _ => None,
            };
            if let Some(reason) = indicator {
                return Err(lexer_refuse(reason, offset, line, column, None, None));
            }
            if character == LEFT_BRACE {
                tokens.push(create_token(
                    TokenKind::FlowMappingStart,
                    offset,
                    line,
                    column,
                ));
                flow_depth += 1;
                offset += 1;
                continue;
            }
            if character == RIGHT_BRACE {
                if flow_depth == 0 {
                    return Err(lexer_refuse(
                        FlightDocumentRefusalReason::UnexpectedToken,
                        offset,
                        line,
                        column,
                        None,
                        None,
                    ));
                }
                tokens.push(create_token(
                    TokenKind::FlowMappingEnd,
                    offset,
                    line,
                    column,
                ));
                flow_depth -= 1;
                offset += 1;
                continue;
            }
            if character == COMMA {
                if flow_depth == 0 {
                    return Err(lexer_refuse(
                        FlightDocumentRefusalReason::UnexpectedToken,
                        offset,
                        line,
                        column,
                        None,
                        None,
                    ));
                }
                tokens.push(create_token(TokenKind::Comma, offset, line, column));
                offset += 1;
                continue;
            }
            if character == COLON {
                tokens.push(create_token(TokenKind::Colon, offset, line, column));
                offset += 1;
                continue;
            }
            if character == MINUS && flow_depth == 0 && is_separation(lexer_at(lexer, offset + 1)) {
                tokens.push(create_token(TokenKind::SequenceItem, offset, line, column));
                offset += 1;
                continue;
            }

            let (token, next_offset) =
                lexer_lex_plain_scalar(lexer, offset, line, line_start, flow_depth)?;
            tokens.push(token);
            offset = next_offset;
        }

        if flow_depth != 0 {
            return Err(lexer_refuse_at(
                FlightDocumentRefusalReason::UnterminatedFlowMapping,
                offset,
                line,
                line_start,
            ));
        }
        if !tokens.is_empty() {
            lines.push(Line { indent, tokens });
        }

        if lexer_at(lexer, offset) == Some(CR) {
            offset += 1;
        }
        if lexer_at(lexer, offset) == Some(LF) {
            offset += 1;
        }
        if offset > line_start {
            line += 1;
            line_start = offset;
        }
    }

    return Ok(lines);
}

fn lexer_lex_double_quoted_scalar(
    lexer: &Lexer,
    start: usize,
    line: usize,
    line_start: usize,
) -> Result<(Token, usize), SceneDocumentYamlSubsetRefusal> {
    let mut offset = start + 1;
    let mut value: Vec<u16> = Vec::new();
    while offset < lexer.source.len() && !is_line_break(lexer_at(lexer, offset)) {
        let character = lexer.source[offset];
        if character == DOUBLE_QUOTE {
            return Ok((
                Token {
                    kind: TokenKind::Scalar,
                    value,
                    quoted: true,
                    offset: start,
                    line,
                    column: start - line_start + 1,
                },
                offset + 1,
            ));
        }
        if character != BACKSLASH {
            if let Some(refusal) =
                lexer_append_decoded_scalar(value.len(), 1, offset, line, line_start)
            {
                return Err(refusal);
            }
            value.push(character);
            offset += 1;
            continue;
        }

        let escape = lexer_at(lexer, offset + 1);
        let Some(escape) = escape.filter(|escape| !is_line_break(Some(*escape))) else {
            return Err(lexer_refuse_at(
                FlightDocumentRefusalReason::InvalidEscape,
                offset,
                line,
                line_start,
            ));
        };
        if let Some(simple) = get_double_quoted_escape(escape) {
            if let Some(refusal) =
                lexer_append_decoded_scalar(value.len(), 1, offset, line, line_start)
            {
                return Err(refusal);
            }
            value.push(simple);
            offset += 2;
            continue;
        }
        if escape != u16::from(b'u') {
            return Err(lexer_refuse_at(
                FlightDocumentRefusalReason::InvalidEscape,
                offset,
                line,
                line_start,
            ));
        }

        let end = (offset + 6).min(lexer.source.len());
        let code = &lexer.source[(offset + 2).min(end)..end];
        if code.len() != 4 || !code.iter().all(|unit| is_hex_digit(*unit)) {
            return Err(lexer_refuse_at(
                FlightDocumentRefusalReason::InvalidEscape,
                offset,
                line,
                line_start,
            ));
        }
        let decoded = code.iter().fold(0u16, |accumulated, unit| {
            let digit = char::from_u32(u32::from(*unit))
                .and_then(|character| character.to_digit(16))
                .unwrap_or(0) as u16;
            return accumulated * 16 + digit;
        });
        if let Some(refusal) = lexer_append_decoded_scalar(value.len(), 1, offset, line, line_start)
        {
            return Err(refusal);
        }
        value.push(decoded);
        offset += 6;
    }
    return Err(lexer_refuse(
        FlightDocumentRefusalReason::UnterminatedQuotedScalar,
        start,
        line,
        start - line_start + 1,
        None,
        None,
    ));
}

fn lexer_lex_plain_scalar(
    lexer: &Lexer,
    start: usize,
    line: usize,
    line_start: usize,
    flow_depth: usize,
) -> Result<(Token, usize), SceneDocumentYamlSubsetRefusal> {
    let mut end = start;
    let mut offset = start;
    while offset < lexer.source.len() && !is_line_break(lexer_at(lexer, offset)) {
        let character = lexer.source[offset];
        if character == TAB {
            return Err(lexer_refuse_at(
                FlightDocumentRefusalReason::TabCharacter,
                offset,
                line,
                line_start,
            ));
        }
        let previous = if offset == 0 {
            None
        } else {
            lexer_at(lexer, offset - 1)
        };
        if character == HASH && is_separation(previous) {
            break;
        }
        if character == COLON && is_mapping_colon(lexer_at(lexer, offset + 1)) {
            break;
        }
        if flow_depth > 0 && (character == COMMA || character == RIGHT_BRACE) {
            break;
        }
        if character == SPACE {
            let mut next = offset + 1;
            while lexer_at(lexer, next) == Some(SPACE) {
                next += 1;
            }
            if is_unsupported_indicator(lexer_at(lexer, next)) {
                break;
            }
        }

        if character != SPACE {
            end = offset + 1;
            let actual = end - start;
            if actual > MAX_SCALAR_CODE_UNITS {
                return Err(lexer_refuse(
                    FlightDocumentRefusalReason::ScalarCodeUnitsLimitExceeded,
                    offset,
                    line,
                    offset - line_start + 1,
                    Some(MAX_SCALAR_CODE_UNITS as i64),
                    Some(actual as i64),
                ));
            }
        }
        offset += 1;
    }

    return Ok((
        Token {
            kind: TokenKind::Scalar,
            value: lexer.source[start..end].to_vec(),
            quoted: false,
            offset: start,
            line,
            column: start - line_start + 1,
        },
        offset,
    ));
}

fn lexer_lex_quoted_scalar(
    lexer: &Lexer,
    start: usize,
    line: usize,
    line_start: usize,
) -> Result<(Token, usize), SceneDocumentYamlSubsetRefusal> {
    if lexer.source[start] == DOUBLE_QUOTE {
        return lexer_lex_double_quoted_scalar(lexer, start, line, line_start);
    }
    return lexer_lex_single_quoted_scalar(lexer, start, line, line_start);
}

fn lexer_lex_single_quoted_scalar(
    lexer: &Lexer,
    start: usize,
    line: usize,
    line_start: usize,
) -> Result<(Token, usize), SceneDocumentYamlSubsetRefusal> {
    let mut offset = start + 1;
    let mut value: Vec<u16> = Vec::new();
    while offset < lexer.source.len() && !is_line_break(lexer_at(lexer, offset)) {
        let character = lexer.source[offset];
        if character != SINGLE_QUOTE {
            if let Some(refusal) =
                lexer_append_decoded_scalar(value.len(), 1, offset, line, line_start)
            {
                return Err(refusal);
            }
            value.push(character);
            offset += 1;
            continue;
        }
        if lexer_at(lexer, offset + 1) == Some(SINGLE_QUOTE) {
            if let Some(refusal) =
                lexer_append_decoded_scalar(value.len(), 1, offset, line, line_start)
            {
                return Err(refusal);
            }
            value.push(SINGLE_QUOTE);
            offset += 2;
            continue;
        }
        return Ok((
            Token {
                kind: TokenKind::Scalar,
                value,
                quoted: true,
                offset: start,
                line,
                column: start - line_start + 1,
            },
            offset + 1,
        ));
    }
    return Err(lexer_refuse(
        FlightDocumentRefusalReason::UnterminatedQuotedScalar,
        start,
        line,
        start - line_start + 1,
        None,
        None,
    ));
}

fn lexer_refuse(
    kind: FlightDocumentRefusalReason,
    offset: usize,
    line: usize,
    column: usize,
    limit: Option<i64>,
    actual: Option<i64>,
) -> SceneDocumentYamlSubsetRefusal {
    return create_refusal(
        kind,
        Position {
            offset,
            line,
            column,
        },
        limit,
        actual,
    );
}

// A refusal at `offset` whose column is measured from the current line start.
fn lexer_refuse_at(
    kind: FlightDocumentRefusalReason,
    offset: usize,
    line: usize,
    line_start: usize,
) -> SceneDocumentYamlSubsetRefusal {
    return lexer_refuse(kind, offset, line, offset - line_start + 1, None, None);
}

/// Parses the closed YAML subset (TS `parseSceneDocumentYamlSubset`).
pub fn parse_scene_document_yaml_subset(source: &str) -> SceneDocumentYamlSubsetResult {
    let units: Vec<u16> = source.encode_utf16().collect();
    if units.len() > MAX_DOCUMENT_CODE_UNITS {
        let position = get_position(&units, MAX_DOCUMENT_CODE_UNITS);
        return SceneDocumentYamlSubsetResult::Refusal(create_refusal(
            FlightDocumentRefusalReason::DocumentCodeUnitsLimitExceeded,
            position,
            Some(MAX_DOCUMENT_CODE_UNITS as i64),
            Some(units.len() as i64),
        ));
    }
    let lines = match lexer_lex(&Lexer { source: units }) {
        Ok(lines) => lines,
        Err(refusal) => return SceneDocumentYamlSubsetResult::Refusal(refusal),
    };
    return parser_parse(Parser {
        lines,
        index: 0,
        node_count: 0,
        refusal: None,
    });
}

fn parser_add_mapping_entry(
    parser: &mut Parser,
    mapping: &mut SceneDocumentYamlSubsetMapping,
    count: usize,
    tokens: &[Token],
    colon_index: usize,
    indent: usize,
    depth: usize,
) -> Option<usize> {
    let colon = &tokens[colon_index];
    let anchor = tokens.first().unwrap_or(colon);
    if count >= MAX_COLLECTION_ENTRIES {
        return parser_refuse(
            parser,
            FlightDocumentRefusalReason::CollectionEntriesLimitExceeded,
            anchor,
            Some(MAX_COLLECTION_ENTRIES as i64),
            Some(count as i64 + 1),
        );
    }
    if colon_index != 1 || tokens[0].kind != TokenKind::Scalar {
        return parser_refuse(
            parser,
            FlightDocumentRefusalReason::ExpectedMappingKey,
            anchor,
            None,
            None,
        );
    }

    let key_units = &tokens[0].value;
    if key_units.len() > MAX_KEY_CODE_UNITS {
        return parser_refuse(
            parser,
            FlightDocumentRefusalReason::KeyCodeUnitsLimitExceeded,
            &tokens[0],
            Some(MAX_KEY_CODE_UNITS as i64),
            Some(key_units.len() as i64),
        );
    }
    let key = String::from_utf16_lossy(key_units);
    if has_record_key(mapping, &key) {
        return parser_refuse(
            parser,
            FlightDocumentRefusalReason::DuplicateKey,
            &tokens[0],
            None,
            None,
        );
    }

    let value = if colon_index + 1 == tokens.len() {
        let next_indent = parser.lines.get(parser.index).map(|next| next.indent);
        match next_indent {
            Some(next_indent) if next_indent > indent => {
                parser_parse_block(parser, next_indent, depth + 1)
            }
            _ => parser_parse_null(parser, colon),
        }
    } else {
        parser_parse_inline(parser, tokens, colon_index + 1, depth + 1)
    };
    set_record_value(mapping, key, value?);
    return Some(count + 1);
}

fn parser_check_collection(parser: &mut Parser, depth: usize, token: &Token) -> bool {
    if depth > MAX_NESTING_DEPTH {
        parser_refuse::<()>(
            parser,
            FlightDocumentRefusalReason::NestingDepthLimitExceeded,
            token,
            Some(MAX_NESTING_DEPTH as i64),
            Some(depth as i64),
        );
        return false;
    }
    return parser_check_node(parser, token);
}

fn parser_check_node(parser: &mut Parser, token: &Token) -> bool {
    if parser.node_count >= MAX_TOTAL_NODES {
        let actual = parser.node_count as i64 + 1;
        parser_refuse::<()>(
            parser,
            FlightDocumentRefusalReason::TotalNodesLimitExceeded,
            token,
            Some(MAX_TOTAL_NODES as i64),
            Some(actual),
        );
        return false;
    }
    parser.node_count += 1;
    return true;
}

fn parser_create_token_refusal(
    kind: FlightDocumentRefusalReason,
    token: &Token,
) -> SceneDocumentYamlSubsetRefusal {
    return create_refusal(
        kind,
        Position {
            offset: token.offset,
            line: token.line,
            column: token.column,
        },
        None,
        None,
    );
}

fn parser_get_refusal(parser: &mut Parser) -> SceneDocumentYamlSubsetRefusal {
    return parser.refusal.take().unwrap_or_else(|| {
        return create_refusal(
            FlightDocumentRefusalReason::InvalidDocument,
            Position {
                offset: 0,
                line: 1,
                column: 1,
            },
            None,
            None,
        );
    });
}

fn parser_parse(mut parser: Parser) -> SceneDocumentYamlSubsetResult {
    if parser.lines.is_empty() {
        return SceneDocumentYamlSubsetResult::Ok(SceneDocumentYamlSubsetValue::Null);
    }
    if parser.lines[0].indent != 0 {
        return SceneDocumentYamlSubsetResult::Refusal(parser_create_token_refusal(
            FlightDocumentRefusalReason::RootIndentation,
            &parser.lines[0].tokens[0],
        ));
    }

    let Some(value) = parser_parse_block(&mut parser, 0, 1) else {
        return SceneDocumentYamlSubsetResult::Refusal(parser_get_refusal(&mut parser));
    };
    if parser.index != parser.lines.len() {
        return SceneDocumentYamlSubsetResult::Refusal(parser_create_token_refusal(
            FlightDocumentRefusalReason::MultipleRootValues,
            &parser.lines[parser.index].tokens[0],
        ));
    }
    return SceneDocumentYamlSubsetResult::Ok(value);
}

fn parser_parse_block(parser: &mut Parser, indent: usize, depth: usize) -> ParseValue {
    let line = parser.lines.get(parser.index)?.clone();
    let first = line.tokens.first()?;
    if line.indent != indent {
        return parser_refuse(
            parser,
            FlightDocumentRefusalReason::UnexpectedIndentation,
            first,
            None,
            None,
        );
    }
    if first.kind == TokenKind::SequenceItem {
        return parser_parse_block_sequence(parser, indent, depth);
    }
    if find_top_level_colon(&line.tokens, 0).is_some() {
        return parser_parse_block_mapping(parser, indent, depth);
    }

    parser.index += 1;
    let value = parser_parse_inline(parser, &line.tokens, 0, depth)?;
    if let Some(next) = parser.lines.get(parser.index)
        && next.indent > indent
    {
        let token = next.tokens[0].clone();
        return parser_refuse(
            parser,
            FlightDocumentRefusalReason::UnexpectedIndentation,
            &token,
            None,
            None,
        );
    }
    return Some(value);
}

fn parser_parse_block_mapping(parser: &mut Parser, indent: usize, depth: usize) -> ParseValue {
    let first = parser.lines[parser.index].tokens[0].clone();
    if !parser_check_collection(parser, depth, &first) {
        return None;
    }

    let mut mapping = SceneDocumentYamlSubsetMapping::default();
    let mut count = 0;
    while parser.index < parser.lines.len() {
        let line = parser.lines[parser.index].clone();
        let first_token = &line.tokens[0];
        if line.indent < indent {
            break;
        }
        if line.indent > indent {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::UnexpectedIndentation,
                first_token,
                None,
                None,
            );
        }
        if first_token.kind == TokenKind::SequenceItem {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::MixedCollection,
                first_token,
                None,
                None,
            );
        }

        let Some(colon_index) = find_top_level_colon(&line.tokens, 0) else {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::ExpectedMappingEntry,
                first_token,
                None,
                None,
            );
        };
        parser.index += 1;
        count = parser_add_mapping_entry(
            parser,
            &mut mapping,
            count,
            &line.tokens,
            colon_index,
            indent,
            depth,
        )?;
    }
    return Some(SceneDocumentYamlSubsetValue::Mapping(mapping));
}

fn parser_parse_block_sequence(parser: &mut Parser, indent: usize, depth: usize) -> ParseValue {
    let first = parser.lines[parser.index].tokens[0].clone();
    if !parser_check_collection(parser, depth, &first) {
        return None;
    }

    let mut sequence: Vec<SceneDocumentYamlSubsetValue> = Vec::new();
    while parser.index < parser.lines.len() {
        let line = parser.lines[parser.index].clone();
        let item = &line.tokens[0];
        if line.indent < indent {
            break;
        }
        if line.indent > indent {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::UnexpectedIndentation,
                item,
                None,
                None,
            );
        }
        if item.kind != TokenKind::SequenceItem {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::MixedCollection,
                item,
                None,
                None,
            );
        }
        if sequence.len() >= MAX_COLLECTION_ENTRIES {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::CollectionEntriesLimitExceeded,
                item,
                Some(MAX_COLLECTION_ENTRIES as i64),
                Some(sequence.len() as i64 + 1),
            );
        }

        parser.index += 1;
        let value = if line.tokens.len() == 1 {
            let next_indent = parser.lines.get(parser.index).map(|next| next.indent);
            match next_indent {
                Some(next_indent) if next_indent > indent => {
                    parser_parse_block(parser, next_indent, depth + 1)
                }
                _ => parser_parse_null(parser, item),
            }
        } else {
            match find_top_level_colon(&line.tokens, 1) {
                Some(colon_index) => {
                    parser_parse_sequence_mapping(parser, &line, indent, depth + 1, colon_index)
                }
                None => parser_parse_inline(parser, &line.tokens, 1, depth + 1),
            }
        };
        sequence.push(value?);

        if let Some(next) = parser.lines.get(parser.index)
            && next.indent > indent
        {
            let token = next.tokens[0].clone();
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::UnexpectedIndentation,
                &token,
                None,
                None,
            );
        }
    }
    return Some(SceneDocumentYamlSubsetValue::Sequence(sequence));
}

fn parser_parse_flow_mapping(
    parser: &mut Parser,
    tokens: &[Token],
    cursor: &mut usize,
    depth: usize,
) -> ParseValue {
    let start = &tokens[*cursor];
    if !parser_check_collection(parser, depth, start) {
        return None;
    }

    let mut mapping = SceneDocumentYamlSubsetMapping::default();
    let mut count = 0;
    *cursor += 1;
    if tokens.get(*cursor).map(|token| token.kind) == Some(TokenKind::FlowMappingEnd) {
        *cursor += 1;
        return Some(SceneDocumentYamlSubsetValue::Mapping(mapping));
    }

    while *cursor < tokens.len() {
        let key_token = &tokens[*cursor];
        if count >= MAX_COLLECTION_ENTRIES {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::CollectionEntriesLimitExceeded,
                key_token,
                Some(MAX_COLLECTION_ENTRIES as i64),
                Some(count as i64 + 1),
            );
        }
        if key_token.kind != TokenKind::Scalar {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::ExpectedMappingKey,
                key_token,
                None,
                None,
            );
        }
        if key_token.value.len() > MAX_KEY_CODE_UNITS {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::KeyCodeUnitsLimitExceeded,
                key_token,
                Some(MAX_KEY_CODE_UNITS as i64),
                Some(key_token.value.len() as i64),
            );
        }
        let key = String::from_utf16_lossy(&key_token.value);
        if has_record_key(&mapping, &key) {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::DuplicateKey,
                key_token,
                None,
                None,
            );
        }
        *cursor += 1;

        let Some(colon) = tokens
            .get(*cursor)
            .filter(|token| token.kind == TokenKind::Colon)
        else {
            let anchor = tokens.get(*cursor).unwrap_or(key_token);
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::ExpectedMappingEntry,
                anchor,
                None,
                None,
            );
        };
        *cursor += 1;

        let Some(value_token) = tokens.get(*cursor) else {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::ExpectedValue,
                colon,
                None,
                None,
            );
        };
        let value = match value_token.kind {
            TokenKind::FlowMappingStart => {
                parser_parse_flow_mapping(parser, tokens, cursor, depth + 1)
            }
            TokenKind::Scalar => {
                *cursor += 1;
                parser_parse_scalar(parser, value_token)
            }
            _ => {
                return parser_refuse(
                    parser,
                    FlightDocumentRefusalReason::ExpectedValue,
                    value_token,
                    None,
                    None,
                );
            }
        };
        set_record_value(&mut mapping, key, value?);
        count += 1;

        let delimiter = tokens.get(*cursor);
        if delimiter.map(|token| token.kind) == Some(TokenKind::FlowMappingEnd) {
            *cursor += 1;
            return Some(SceneDocumentYamlSubsetValue::Mapping(mapping));
        }
        if delimiter.map(|token| token.kind) != Some(TokenKind::Comma) {
            let anchor = delimiter.unwrap_or(value_token);
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::ExpectedFlowDelimiter,
                anchor,
                None,
                None,
            );
        }
        *cursor += 1;
        if let Some(next) = tokens.get(*cursor)
            && next.kind == TokenKind::FlowMappingEnd
        {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::TrailingFlowComma,
                next,
                None,
                None,
            );
        }
    }

    return parser_refuse(
        parser,
        FlightDocumentRefusalReason::UnterminatedFlowMapping,
        start,
        None,
        None,
    );
}

fn parser_parse_inline(
    parser: &mut Parser,
    tokens: &[Token],
    start: usize,
    depth: usize,
) -> ParseValue {
    let token = tokens.get(start)?;
    if token.kind == TokenKind::FlowMappingStart {
        let mut cursor = start;
        let value = parser_parse_flow_mapping(parser, tokens, &mut cursor, depth)?;
        if cursor != tokens.len() {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::TrailingFlowContent,
                &tokens[cursor],
                None,
                None,
            );
        }
        return Some(value);
    }
    if token.kind != TokenKind::Scalar || start + 1 != tokens.len() {
        return parser_refuse(
            parser,
            FlightDocumentRefusalReason::ExpectedScalar,
            token,
            None,
            None,
        );
    }
    return parser_parse_scalar(parser, token);
}

fn parser_parse_null(parser: &mut Parser, token: &Token) -> ParseValue {
    return parser_check_node(parser, token).then_some(SceneDocumentYamlSubsetValue::Null);
}

fn parser_parse_scalar(parser: &mut Parser, token: &Token) -> ParseValue {
    if !parser_check_node(parser, token) {
        return None;
    }
    let value = &token.value;
    if token.quoted {
        return Some(SceneDocumentYamlSubsetValue::String(
            String::from_utf16_lossy(value),
        ));
    }
    if units_equal(value, "null") {
        return Some(SceneDocumentYamlSubsetValue::Null);
    }
    if units_equal(value, "true") {
        return Some(SceneDocumentYamlSubsetValue::Boolean(true));
    }
    if units_equal(value, "false") {
        return Some(SceneDocumentYamlSubsetValue::Boolean(false));
    }

    let text = String::from_utf16_lossy(value);
    if is_hex_integer(value) {
        // Number.parseInt accumulates in a double; any value past the safe range refuses.
        return match u64::from_str_radix(&text[2..], 16) {
            Ok(parsed) if parsed <= MAX_SAFE_INTEGER => {
                Some(SceneDocumentYamlSubsetValue::Number(parsed as f64))
            }
            _ => parser_refuse(
                parser,
                FlightDocumentRefusalReason::NumberOutOfRange,
                token,
                None,
                None,
            ),
        };
    }
    if is_decimal_number(value) {
        let parsed: f64 = text.parse().unwrap_or(f64::INFINITY);
        if !parsed.is_finite() {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::NumberOutOfRange,
                token,
                None,
                None,
            );
        }
        let is_integer_text = !text.contains('.') && !text.contains('e') && !text.contains('E');
        if is_integer_text && parsed.abs() > MAX_SAFE_INTEGER as f64 {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::NumberOutOfRange,
                token,
                None,
                None,
            );
        }
        return Some(SceneDocumentYamlSubsetValue::Number(parsed));
    }
    return Some(SceneDocumentYamlSubsetValue::String(text));
}

fn parser_parse_sequence_mapping(
    parser: &mut Parser,
    line: &Line,
    sequence_indent: usize,
    depth: usize,
    colon_index: usize,
) -> ParseValue {
    let first = &line.tokens[1];
    if !parser_check_collection(parser, depth, first) {
        return None;
    }

    let mut mapping = SceneDocumentYamlSubsetMapping::default();
    let mapping_indent = sequence_indent + 2;
    let mut count = parser_add_mapping_entry(
        parser,
        &mut mapping,
        0,
        &line.tokens[1..],
        colon_index - 1,
        mapping_indent,
        depth,
    )?;

    while parser.index < parser.lines.len() {
        let next_line = parser.lines[parser.index].clone();
        let next_first = &next_line.tokens[0];
        if next_line.indent <= sequence_indent {
            break;
        }
        if next_line.indent != mapping_indent {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::UnexpectedIndentation,
                next_first,
                None,
                None,
            );
        }
        if next_first.kind == TokenKind::SequenceItem {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::MixedCollection,
                next_first,
                None,
                None,
            );
        }

        let Some(next_colon) = find_top_level_colon(&next_line.tokens, 0) else {
            return parser_refuse(
                parser,
                FlightDocumentRefusalReason::ExpectedMappingEntry,
                next_first,
                None,
                None,
            );
        };
        parser.index += 1;
        count = parser_add_mapping_entry(
            parser,
            &mut mapping,
            count,
            &next_line.tokens,
            next_colon,
            mapping_indent,
            depth,
        )?;
    }
    return Some(SceneDocumentYamlSubsetValue::Mapping(mapping));
}

// Records the first refusal (later ones never replace it) and fails the current step.
fn parser_refuse<T>(
    parser: &mut Parser,
    kind: FlightDocumentRefusalReason,
    token: &Token,
    limit: Option<i64>,
    actual: Option<i64>,
) -> Option<T> {
    if parser.refusal.is_none() {
        parser.refusal = Some(create_refusal(
            kind,
            Position {
                offset: token.offset,
                line: token.line,
                column: token.column,
            },
            limit,
            actual,
        ));
    }
    return None;
}

fn units_equal(value: &[u16], text: &str) -> bool {
    return value.iter().copied().eq(text.encode_utf16());
}

const MAX_DOCUMENT_CODE_UNITS: usize = 4_194_304;
const MAX_NESTING_DEPTH: usize = 64;
const MAX_COLLECTION_ENTRIES: usize = 65_536;
const MAX_SCALAR_CODE_UNITS: usize = 65_536;
const MAX_KEY_CODE_UNITS: usize = 256;
const MAX_TOTAL_NODES: usize = 262_144;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

const AMPERSAND: u16 = b'&' as u16;
const ASTERISK: u16 = b'*' as u16;
const BACKSLASH: u16 = b'\\' as u16;
const BANG: u16 = b'!' as u16;
const COLON: u16 = b':' as u16;
const COMMA: u16 = b',' as u16;
const CR: u16 = b'\r' as u16;
const DOT: u16 = b'.' as u16;
const DOUBLE_QUOTE: u16 = b'"' as u16;
const GREATER: u16 = b'>' as u16;
const HASH: u16 = b'#' as u16;
const LEFT_BRACE: u16 = b'{' as u16;
const LEFT_BRACKET: u16 = b'[' as u16;
const LF: u16 = b'\n' as u16;
const LOWER_E: u16 = b'e' as u16;
const MINUS: u16 = b'-' as u16;
const PIPE: u16 = b'|' as u16;
const PLUS: u16 = b'+' as u16;
const RIGHT_BRACE: u16 = b'}' as u16;
const RIGHT_BRACKET: u16 = b']' as u16;
const SINGLE_QUOTE: u16 = b'\'' as u16;
const SPACE: u16 = b' ' as u16;
const TAB: u16 = b'\t' as u16;
const UPPER_E: u16 = b'E' as u16;
const ZERO: u16 = b'0' as u16;
