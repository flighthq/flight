use crate::spine_binary_parse_helpers::report_spine_binary_crumb;
use crate::spine_binary_reader::*;
use crate::types::{ByteReader, SpineBinarySectionContext};

enum ConstraintKind {
    Ik,
    Path,
    Transform,
}

fn consume_constraints(
    context: &mut SpineBinarySectionContext<'_>,
    kind: ConstraintKind,
    report: bool,
) {
    let count = read_spine_binary_varint(&mut context.reader) as usize;
    for _ in 0..count {
        if is_spine_binary_reader_overrun(&context.reader) {
            break;
        }
        skip_constraint_head(&mut context.reader);
        match kind {
            ConstraintKind::Ik => {
                read_spine_binary_varint(&mut context.reader);
                skip_spine_binary_bytes(&mut context.reader, 12);
            }
            ConstraintKind::Transform => {
                read_spine_binary_varint(&mut context.reader);
                skip_spine_binary_bytes(&mut context.reader, 50);
            }
            ConstraintKind::Path => {
                for _ in 0..4 {
                    read_spine_binary_varint(&mut context.reader);
                }
                skip_spine_binary_bytes(&mut context.reader, 24);
            }
        }
    }
    if report {
        let diagnostic_kind = match kind {
            ConstraintKind::Ik => "spine.ik-constraint-unsupported",
            ConstraintKind::Path => "spine.path-constraint-unsupported",
            ConstraintKind::Transform => "spine.transform-constraint-unsupported",
        };
        report_spine_binary_crumb(
            context.diagnostics.as_deref_mut(),
            count,
            diagnostic_kind,
            "skipSpineBinaryConstraints",
            "constraints",
        );
    }
}

fn consume_events(context: &mut SpineBinarySectionContext<'_>, report: bool) {
    let count = read_spine_binary_varint(&mut context.reader) as usize;
    for _ in 0..count {
        if is_spine_binary_reader_overrun(&context.reader) {
            break;
        }
        read_spine_binary_varint(&mut context.reader);
        read_spine_binary_varint(&mut context.reader);
        skip_spine_binary_bytes(&mut context.reader, 4);
        read_spine_binary_string(&mut context.reader);
        if read_spine_binary_string(&mut context.reader).is_some() {
            skip_spine_binary_bytes(&mut context.reader, 8);
        }
    }
    if report {
        report_spine_binary_crumb(
            context.diagnostics.as_deref_mut(),
            count,
            "spine.event-unsupported",
            "skipSpineBinaryEvents",
            "events",
        );
    }
}

fn skip_constraint_head(reader: &mut ByteReader<'_>) {
    read_spine_binary_string(reader);
    read_spine_binary_varint(reader);
    read_spine_binary_boolean(reader);
    let bones = read_spine_binary_varint(reader) as usize;
    for _ in 0..bones {
        if is_spine_binary_reader_overrun(reader) {
            break;
        }
        read_spine_binary_varint(reader);
    }
}

pub fn skip_spine_binary_events_section(context: &mut SpineBinarySectionContext<'_>) {
    consume_events(context, false);
}

pub fn skip_spine_binary_ik_constraints_section(context: &mut SpineBinarySectionContext<'_>) {
    consume_constraints(context, ConstraintKind::Ik, false);
}

pub fn skip_spine_binary_path_constraints_section(context: &mut SpineBinarySectionContext<'_>) {
    consume_constraints(context, ConstraintKind::Path, false);
}

pub fn skip_spine_binary_transform_constraints_section(
    context: &mut SpineBinarySectionContext<'_>,
) {
    consume_constraints(context, ConstraintKind::Transform, false);
}

pub fn spine_binary_events_section_handler(context: &mut SpineBinarySectionContext<'_>) {
    consume_events(context, true);
}

pub fn spine_binary_ik_constraints_section_handler(context: &mut SpineBinarySectionContext<'_>) {
    consume_constraints(context, ConstraintKind::Ik, true);
}

pub fn spine_binary_path_constraints_section_handler(context: &mut SpineBinarySectionContext<'_>) {
    consume_constraints(context, ConstraintKind::Path, true);
}

pub fn spine_binary_transform_constraints_section_handler(
    context: &mut SpineBinarySectionContext<'_>,
) {
    consume_constraints(context, ConstraintKind::Transform, true);
}
