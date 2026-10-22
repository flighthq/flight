use std::cell::Cell;
use std::collections::HashMap;
use std::sync::Arc;

use flight_abc::contract::{
    AbcFile, AbcInstruction, AbcOpcode, AbcTraitKind, read_abc_file, read_abc_instructions,
};
use flight_entity::Uint8Array;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_movieclip::MovieClip;
use flight_scene2d::Node2DRef;
use flight_timeline::{
    FrameScript, TimelineFrameArg, TimelineRef, goto_and_play_timeline, next_frame_timeline,
    play_timeline, prev_frame_timeline, stop_timeline,
};

use crate::SwfReader;

#[derive(Clone)]
struct SwfFrameCommand {
    frame: i32,
    kind: SwfFrameCommandKind,
    label: Option<String>,
}

struct SwfGotoDepthGuard;

struct SwfAbcValue {
    kind: SwfAbcValueKind,
    label: String,
    value: i64,
}

/// Recovers the bounded playback commands that compiler-shaped AVM2 frame scripts declare, keyed
/// by class name and one-based frame number. Bytecode is read as data and never executed (TS
/// `readSwfAbcFrameScripts`).
pub fn read_swf_abc_frame_scripts(
    source: &Uint8Array,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<HashMap<String, HashMap<i32, FrameScript>>> {
    let file = read_abc_file(source)?;
    let mut bodies: HashMap<usize, Vec<AbcInstruction>> = HashMap::new();
    for body in &file.method_bodies {
        if let Some(instructions) = read_abc_instructions(&body.code) {
            bodies.insert(body.method, instructions);
        }
    }

    let mut by_class = HashMap::new();
    for instance in &file.instances {
        let Some(constructor) = bodies.get(&instance.initializer) else {
            continue;
        };
        let mut methods_by_name = HashMap::new();
        for trait_ in &instance.traits {
            if trait_.kind == AbcTraitKind::Method as u8 {
                methods_by_name.insert(
                    swf_resolve_abc_name(&file, trait_.name).to_string(),
                    trait_.method_index,
                );
            }
        }
        let frames = swf_read_abc_calls(
            &file,
            constructor,
            &bodies,
            &methods_by_name,
            diagnostics.as_deref_mut(),
        );
        if !frames.is_empty() {
            by_class.insert(swf_resolve_abc_qualified_name(&file, instance.name), frames);
        }
    }
    return Some(by_class);
}

/// Recognizes an AVM1 `DoAction` block only when every action is a declarative playback command.
/// Any malformed or executable instruction declines the whole block (TS `readSwfFrameActions`).
pub fn read_swf_frame_actions(reader: &mut SwfReader) -> Option<FrameScript> {
    let mut commands = Vec::new();
    for _ in 0..MAX_FRAME_ACTIONS {
        if reader.pos >= reader.end {
            break;
        }
        let code = reader.read_uint8();
        if !reader.valid {
            return None;
        }
        if code == ACTION_END {
            break;
        }

        let length = if code >= ACTION_HAS_BODY {
            usize::from(reader.read_uint16())
        } else {
            0
        };
        let Some(body_end) = reader.pos.checked_add(length) else {
            return None;
        };
        if !reader.valid || body_end > reader.end {
            return None;
        }

        match code {
            ACTION_STOP => commands.push(swf_frame_command_default(SwfFrameCommandKind::Stop)),
            ACTION_PLAY => commands.push(swf_frame_command_default(SwfFrameCommandKind::Play)),
            ACTION_NEXT_FRAME => {
                commands.push(swf_frame_command_default(SwfFrameCommandKind::Next))
            }
            ACTION_PREVIOUS_FRAME => {
                commands.push(swf_frame_command_default(SwfFrameCommandKind::Previous))
            }
            ACTION_GOTO_FRAME => commands.push(SwfFrameCommand {
                frame: i32::from(reader.read_uint16()) + 1,
                kind: SwfFrameCommandKind::Goto,
                label: None,
            }),
            ACTION_GOTO_LABEL => commands.push(SwfFrameCommand {
                frame: 0,
                kind: SwfFrameCommandKind::Goto,
                label: Some(reader.read_string()),
            }),
            _ => return None,
        }

        reader.pos = body_end;
        if !reader.valid {
            return None;
        }
    }
    return (!commands.is_empty()).then(|| swf_frame_script_create(commands));
}

fn swf_frame_command_default(kind: SwfFrameCommandKind) -> SwfFrameCommand {
    return SwfFrameCommand {
        frame: 0,
        kind,
        label: None,
    };
}

fn swf_frame_script_abc_method_value(value: usize) -> SwfAbcValue {
    return SwfAbcValue {
        kind: SwfAbcValueKind::Method,
        label: String::new(),
        value: value as i64,
    };
}

fn swf_frame_script_abc_other_value() -> SwfAbcValue {
    return SwfAbcValue {
        kind: SwfAbcValueKind::Other,
        label: String::new(),
        value: 0,
    };
}

fn swf_frame_script_create(commands: Vec<SwfFrameCommand>) -> FrameScript {
    return Arc::new(move |target: &Node2DRef, _frame: i32| {
        let entered = GOTO_DEPTH.with(|depth| {
            let current = depth.get();
            if current > MAX_GOTO_DEPTH {
                return false;
            }
            depth.set(current + 1);
            return true;
        });
        if !entered {
            return;
        }
        let _depth = SwfGotoDepthGuard;
        let Some(timeline) = swf_movie_clip_timeline(target) else {
            return;
        };
        for command in &commands {
            match command.kind {
                SwfFrameCommandKind::Stop => stop_timeline(&timeline),
                SwfFrameCommandKind::Play => play_timeline(&timeline),
                SwfFrameCommandKind::Next => next_frame_timeline(&timeline),
                SwfFrameCommandKind::Previous => prev_frame_timeline(&timeline),
                SwfFrameCommandKind::Goto => {
                    let target = match &command.label {
                        Some(label) => TimelineFrameArg::Label(label.clone()),
                        None => TimelineFrameArg::Frame(command.frame),
                    };
                    goto_and_play_timeline(&timeline, &target);
                }
            }
        }
    });
}

fn swf_goto_depth_exit() {
    GOTO_DEPTH.with(|depth| depth.set(depth.get().saturating_sub(1)));
}

fn swf_movie_clip_timeline(target: &Node2DRef) -> Option<TimelineRef> {
    let guard = target.read().ok()?;
    let clip = guard.as_any().downcast_ref::<MovieClip>()?;
    return clip.data.timeline.clone();
}

fn swf_read_abc_calls(
    file: &AbcFile,
    constructor: &[AbcInstruction],
    bodies: &HashMap<usize, Vec<AbcInstruction>>,
    methods_by_name: &HashMap<String, usize>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> HashMap<i32, FrameScript> {
    let mut frames = HashMap::new();
    let mut stack = Vec::new();

    for instruction in constructor {
        if instruction.opcode == AbcOpcode::CallPropVoid as u8
            || instruction.opcode == AbcOpcode::CallProperty as u8
        {
            let argument_count = swf_resolve_operand_usize(instruction, 1).unwrap_or(0);
            let start = stack.len().saturating_sub(argument_count);
            let arguments_given: Vec<SwfAbcValue> = stack.drain(start..).collect();
            if swf_resolve_abc_name(file, swf_resolve_operand_usize(instruction, 0).unwrap_or(0))
                != ADD_FRAME_SCRIPT
            {
                continue;
            }
            for pair in arguments_given.chunks_exact(2) {
                let frame = &pair[0];
                let handler = &pair[1];
                if frame.kind != SwfAbcValueKind::Number || handler.kind != SwfAbcValueKind::Method
                {
                    continue;
                }
                let Ok(frame_number) = i32::try_from(frame.value.saturating_add(1)) else {
                    continue;
                };
                let method = usize::try_from(handler.value).ok();
                let body = method.and_then(|method| bodies.get(&method));
                let commands = body.and_then(|body| swf_read_abc_commands(file, body));
                let Some(commands) = commands else {
                    let mut detail = HashMap::new();
                    detail.insert(
                        String::from("frame"),
                        ImportDiagnosticDetailValue::Number(frame_number as f32),
                    );
                    detail.insert(
                        String::from("reason"),
                        ImportDiagnosticDetailValue::String(String::from(if body.is_some() {
                            "commands-declined"
                        } else {
                            "method-body-unreadable"
                        })),
                    );
                    report_import_diagnostic(
                        diagnostics.as_deref_mut(),
                        ImportDiagnosticSeverity::Drop,
                        "swf.abc-frame-script-declined",
                        "readSwfAbcFrameScriptCalls",
                        Some(detail),
                    );
                    continue;
                };
                frames.insert(frame_number, swf_frame_script_create(commands));
            }
            continue;
        }
        if instruction.opcode == AbcOpcode::GetProperty as u8 {
            stack.pop();
            let name =
                swf_resolve_abc_name(file, swf_resolve_operand_usize(instruction, 0).unwrap_or(0));
            stack.push(match methods_by_name.get(name) {
                Some(method) => swf_frame_script_abc_method_value(*method),
                None => swf_frame_script_abc_other_value(),
            });
            continue;
        }
        swf_read_abc_value(file, &mut stack, instruction);
    }
    return frames;
}

fn swf_read_abc_commands(file: &AbcFile, body: &[AbcInstruction]) -> Option<Vec<SwfFrameCommand>> {
    let mut commands = Vec::new();
    let mut stack = Vec::new();

    for instruction in body {
        if instruction.opcode == AbcOpcode::CallPropVoid as u8
            || instruction.opcode == AbcOpcode::CallProperty as u8
        {
            let argument_count = swf_resolve_operand_usize(instruction, 1).unwrap_or(0);
            let start = stack.len().saturating_sub(argument_count);
            let arguments_given: Vec<SwfAbcValue> = stack.drain(start..).collect();
            let command = swf_read_abc_resolve_command(
                swf_resolve_abc_name(file, swf_resolve_operand_usize(instruction, 0).unwrap_or(0)),
                &arguments_given,
            )?;
            commands.push(command);
            continue;
        }
        if swf_resolve_swf_abc_scaffolding(instruction.opcode) {
            continue;
        }
        if !swf_read_abc_value(file, &mut stack, instruction) {
            return None;
        }
    }
    return (!commands.is_empty()).then_some(commands);
}

fn swf_read_abc_resolve_command(
    name: &str,
    arguments_given: &[SwfAbcValue],
) -> Option<SwfFrameCommand> {
    if arguments_given.is_empty() {
        let kind = match name {
            "stop" => SwfFrameCommandKind::Stop,
            "play" => SwfFrameCommandKind::Play,
            "nextFrame" => SwfFrameCommandKind::Next,
            "prevFrame" => SwfFrameCommandKind::Previous,
            _ => return None,
        };
        return Some(swf_frame_command_default(kind));
    }
    if (name != "gotoAndStop" && name != "gotoAndPlay") || arguments_given.len() != 1 {
        return None;
    }
    let target = &arguments_given[0];
    return match target.kind {
        SwfAbcValueKind::Label => Some(SwfFrameCommand {
            frame: 0,
            kind: SwfFrameCommandKind::Goto,
            label: Some(target.label.clone()),
        }),
        SwfAbcValueKind::Number => Some(SwfFrameCommand {
            frame: i32::try_from(target.value).ok()?,
            kind: SwfFrameCommandKind::Goto,
            label: None,
        }),
        _ => None,
    };
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SwfAbcValueKind {
    Label,
    Method,
    Number,
    Other,
}

fn swf_read_abc_value(
    file: &AbcFile,
    stack: &mut Vec<SwfAbcValue>,
    instruction: &AbcInstruction,
) -> bool {
    let operand = instruction.operands.first().copied().unwrap_or(0);
    let index = usize::try_from(operand).unwrap_or(0);
    let value = match instruction.opcode {
        opcode if opcode == AbcOpcode::PushByte as u8 || opcode == AbcOpcode::PushShort as u8 => {
            SwfAbcValue {
                kind: SwfAbcValueKind::Number,
                label: String::new(),
                value: operand,
            }
        }
        opcode if opcode == AbcOpcode::PushInt as u8 => SwfAbcValue {
            kind: SwfAbcValueKind::Number,
            label: String::new(),
            value: i64::from(file.constant_pool.integers.get(index).copied().unwrap_or(0)),
        },
        opcode if opcode == AbcOpcode::PushUint as u8 => SwfAbcValue {
            kind: SwfAbcValueKind::Number,
            label: String::new(),
            value: i64::from(
                file.constant_pool
                    .unsigned_integers
                    .get(index)
                    .copied()
                    .unwrap_or(0),
            ),
        },
        opcode if opcode == AbcOpcode::PushString as u8 => SwfAbcValue {
            kind: SwfAbcValueKind::Label,
            label: file
                .constant_pool
                .strings
                .get(index)
                .cloned()
                .unwrap_or_default(),
            value: 0,
        },
        opcode if opcode == AbcOpcode::NewFunction as u8 => SwfAbcValue {
            kind: SwfAbcValueKind::Method,
            label: String::new(),
            value: operand,
        },
        _ => {
            stack.push(swf_frame_script_abc_other_value());
            return false;
        }
    };
    stack.push(value);
    return true;
}

fn swf_resolve_abc_name(file: &AbcFile, index: usize) -> &str {
    let Some(multiname) = file.constant_pool.multinames.get(index) else {
        return "";
    };
    return file
        .constant_pool
        .strings
        .get(multiname.name)
        .map(String::as_str)
        .unwrap_or("");
}

fn swf_resolve_abc_qualified_name(file: &AbcFile, index: usize) -> String {
    let Some(multiname) = file.constant_pool.multinames.get(index) else {
        return String::new();
    };
    let name = file
        .constant_pool
        .strings
        .get(multiname.name)
        .map(String::as_str)
        .unwrap_or("");
    let package_name = file
        .constant_pool
        .namespaces
        .get(multiname.namespace)
        .and_then(|namespace| file.constant_pool.strings.get(namespace.name))
        .map(String::as_str)
        .unwrap_or("");
    if package_name.is_empty() {
        return name.to_string();
    }
    return format!("{package_name}.{name}");
}

fn swf_resolve_operand_usize(instruction: &AbcInstruction, index: usize) -> Option<usize> {
    return usize::try_from(*instruction.operands.get(index)?).ok();
}

fn swf_resolve_swf_abc_scaffolding(opcode: u8) -> bool {
    return matches!(
        opcode,
        value if value == AbcOpcode::CoerceAny as u8
            || value == AbcOpcode::Debug as u8
            || value == AbcOpcode::DebugFile as u8
            || value == AbcOpcode::DebugLine as u8
            || value == AbcOpcode::FindPropStrict as u8
            || value == AbcOpcode::GetLex as u8
            || value == AbcOpcode::GetLocal0 as u8
            || value == AbcOpcode::Pop as u8
            || value == AbcOpcode::PushScope as u8
            || value == AbcOpcode::ReturnVoid as u8
    );
}

const ACTION_END: u8 = 0x00;

const ACTION_GOTO_FRAME: u8 = 0x81;

const ACTION_GOTO_LABEL: u8 = 0x8c;

const ACTION_HAS_BODY: u8 = 0x80;

const ACTION_NEXT_FRAME: u8 = 0x04;

const ACTION_PLAY: u8 = 0x06;

const ACTION_PREVIOUS_FRAME: u8 = 0x05;

const ACTION_STOP: u8 = 0x07;

const ADD_FRAME_SCRIPT: &str = "addFrameScript";

const MAX_FRAME_ACTIONS: usize = 10_000;

const MAX_GOTO_DEPTH: usize = 8;

#[derive(Clone, Copy)]
enum SwfFrameCommandKind {
    Goto,
    Next,
    Play,
    Previous,
    Stop,
}

// flight-lint: allow(hidden-state) The pinned source uses one module-wide reentrancy depth so mutually recursive frame scripts share the same hard bound; thread-local storage preserves that synchronous call-stack scope safely
thread_local! {
    static GOTO_DEPTH: Cell<usize> = const { Cell::new(0) };
}

impl Drop for SwfGotoDepthGuard {
    fn drop(&mut self) {
        swf_goto_depth_exit();
    }
}
