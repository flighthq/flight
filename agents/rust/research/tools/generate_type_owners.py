#!/usr/bin/env python3
"""Build the WP9 consolidated type/export ownership artifacts.

This is an out-of-repository generator. It consumes the pinned TypeScript snapshot
and the approved research inputs without modifying repo/.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict, deque
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / "repo" / "agents" / "research"
TS_ROOT = ROOT / "ts-reference" / "flight" / "packages" / "types" / "src"
OUT_DIR = ROOT / "deliverables" / "wp9"

FIRST_PASS_PATH = RESEARCH / "dissolve-types-owners-firstpass.json"
FIXES_PATH = RESEARCH / "dissolve-types-fixes.json"
DISSOLVE_REPORT_PATH = RESEARCH / "dissolve-types.md"
TEXT_HOST_REPORT_PATH = RESEARCH / "text-host-ownership.md"
AMBIGUOUS_PATH = RESEARCH / "text-host-ambiguous-owners.json"


# Rule-(c) ties described by the report are broken toward the lowest referring owner.
# The other rule-(c) assignments are derived below when exactly one referring owner exists.
RULE_C_TIES = {
    "Material2D": "materials",
    "PixelFormat": "texture",
    "Scene3DMetadata": "scene3d",
    "ViewportScaleMode": "node",
}

# Appendix §1 reports 22 prefix-rule files. These are the exact rule-(d) results;
# later, more specific report decisions override AppearanceFlags/Node* as needed.
RULE_D = {
    "AccessibilityDescriptor": "accessibility",
    "AppearanceFlags": "app",
    "CaptureCheckTier": "capture",
    "FontVariationAxis": "font",
    "ImageEncoder": "image",
    "Node2DInteractionSignals": "node",
    "Node3DVisitor": "node",
    "RenderBlendStateEntry": "render",
    "RenderDrawContext": "render",
    "RenderProxyResolver": "render",
    "RenderStateStats": "render",
    "Scene2DAlign": "scene2d",
    "Scene2DDisplayState": "scene2d",
    "Scene2DQuality": "scene2d",
    "Scene2DScaleMode": "scene2d",
    "SpritesheetParseDiagnostic": "spritesheet",
    "TextInputEditRecord": "textinput",
    "TextListMarker": "text",
    "TextSelectionRange": "text",
    "TextureCubeFace": "texture",
    "TextureDimension": "texture",
    "TextureKind": "texture",
}

# Explicit source-backed orphan recommendations/corrections in dissolve-types.md §1.
DISSOLVE_ORPHAN_DECISIONS = {
    "AppearanceFlags": "node",
    "GlCapabilities": "render-gl",
    "GlContextLoss": "render-gl",
    "GlCullFaceKind": "render-gl",
    "GlDepthFuncKind": "render-gl",
    "GlFramebufferStatusKind": "render-gl",
    "GlRenderStats": "render-gl",
    "GlTextureDescriptor": "render-gl",
    "GlTextureFilterKind": "render-gl",
    "GlTextureWrapKind": "render-gl",
    "CurlNoiseForce": "particles",
    "PointGravityWellForce": "particles",
    "ParticleBurstSchedule": "particles",
    "ParticleFormatWarning": "particles",
}

# Principal review ruled every previously unresolved symbol dead. They remain in
# this source-coverage artifact so the decision is traceable, but no package or
# Rust crate owns or ports them.
DROPPED_FILES = {
    "BatchBarrier",
    "CanvasEffectSupport",
    "CdlValues",
    "Group",
    "LodMesh",
    "MouseButton",
    "PlayMode",
    "TextListMarker",
    "TextSelectionRange",
}

HOST_GROUP_OWNERS = {
    "HostAccessibilityCapabilities": "accessibility",
    "HostAppCapabilities": "app",
    "HostAudioCapabilities": "media",
    "HostBitmapCapabilities": "bitmap",
    "HostCanvasCapabilities": "surface",
    "HostClipboardCapabilities": "clipboard",
    "HostCompressCapabilities": "compression",
    "HostConnectivityCapabilities": "connectivity",
    "HostDecompressCapabilities": "compression",
    "HostDeviceCapabilities": "device",
    "HostDialogCapabilities": "dialog",
    "HostFileSystemCapabilities": "filesystem",
    "HostFontCapabilities": "font",
    "HostFullscreenCapabilities": "app",
    "HostGeolocationCapabilities": "geolocation",
    "HostGlCapabilities": "render-gl",
    "HostGlyphCapabilities": "font",
    "HostHapticsCapabilities": "haptics",
    "HostImageCapabilities": "image",
    "HostInputCapabilities": "input",
    "HostIpcCapabilities": "ipc",
    "HostLifecycleCapabilities": "lifecycle",
    "HostMediaSessionCapabilities": "mediasession",
    "HostMenuCapabilities": "menu",
    "HostMidiCapabilities": "midi",
    "HostNetCapabilities": "net",
    "HostNotificationCapabilities": "notification",
    "HostPermissionsCapabilities": "permissions",
    "HostPlatformCapabilities": "platform",
    "HostPowerCapabilities": "power",
    "HostPreferencesCapabilities": "preferences",
    "HostProtocolCapabilities": "protocol",
    "HostScreenCapabilities": "screen",
    "HostSensorsCapabilities": "sensors",
    "HostShareCapabilities": "share",
    "HostShellCapabilities": "shell",
    "HostShortcutCapabilities": "shortcut",
    "HostSocketCapabilities": "socket",
    "HostSoftKeyboardCapabilities": "keyboard",
    "HostStatusBarCapabilities": "statusbar",
    "HostSurfaceCapabilities": "surface",
    "HostTextSegmentCapabilities": "textsegment",
    "HostTextShaperCapabilities": "textshaper",
    "HostTrayCapabilities": "tray",
    "HostUpdaterCapabilities": "updater",
    "HostVideoCapabilities": "video",
    "HostWgpuCapabilities": "render-wgpu",
    "HostWindowCapabilities": "app",
}

ADAPTER_PROFILE_OWNERS = {
    # host-web (16)
    "Host::WebScreenCapabilities": "host-web",
    "Notification::WebNotificationOptions": "host-web",
    "Notification::WebPageNotificationApi": "host-web",
    "Notification::WebPageNotificationCapabilities": "host-web",
    "Notification::WebPageNotificationInstance": "host-web",
    "Notification::WebServiceWorkerNotificationApi": "host-web",
    "Notification::WebServiceWorkerNotificationCapabilities": "host-web",
    "Notification::WebServiceWorkerNotificationEvent": "host-web",
    "Notification::WebServiceWorkerNotificationInstance": "host-web",
    "Notification::WebServiceWorkerNotificationRegistration": "host-web",
    "Power::WebPowerCapabilities": "host-web",
    "Power::WebPowerReadingCapabilities": "host-web",
    "Storage::WebWindowStoragePersistenceApi": "host-web",
    "Storage::WebWindowStoragePersistenceCapabilities": "host-web",
    "Storage::WebWorkerStoragePersistenceApi": "host-web",
    "Storage::WebWorkerStoragePersistenceCapabilities": "host-web",
    # host-electron (4)
    "Menu::ElectronMenuCapabilities": "host-electron",
    "Notification::ElectronNotificationCapabilities": "host-electron",
    "Notification::ElectronMacosNotificationCapabilities": "host-electron",
    "Power::ElectronPowerCapabilities": "host-electron",
    # host-tauri (2)
    "Menu::TauriMenuCapabilities": "host-tauri",
    "Notification::TauriNotificationCapabilities": "host-tauri",
    # host-capacitor (3)
    "Notification::CapacitorNotificationCapabilities": "host-capacitor",
    "Share::CapacitorShareContentOptions": "host-capacitor",
    "Share::HostCapacitorShareContentCapability": "host-capacitor",
}

GLYPH_TO_FONT = {
    "GlyphSource::HostGlyphRasterizerCapability",
    "GlyphSource::GlyphRasterizeOptions",
    "GlyphSource::GlyphRasterizedBitmap",
    "GlyphSource::GlyphMetrics",
    "GlyphSource::GlyphRasterizerOperation",
}

TS_ONLY_EXACT = {
    "host-web",
    "host-electron",
    "host-tauri",
    "host-capacitor",
    "scene2d-dom",
    "scene2d-canvas",
    "effects-canvas",
    "textshaper-canvas",
    "sdk",
    "vite-plugin-manifest",
}


def load_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def parse_markdown_table_mapping(
    text: str, start_heading: str, end_heading: str | None, owner_column: int
) -> dict[str, str]:
    start = text.index(start_heading)
    end = text.index(end_heading, start) if end_heading else len(text)
    result: dict[str, str] = {}
    for line in text[start:end].splitlines():
        if not line.startswith("|"):
            continue
        cells = [cell.strip().replace("`", "") for cell in line.strip().strip("|").split("|")]
        if not cells or cells[0] in {"File", ""} or set(cells[0]) == {"-"}:
            continue
        if len(cells) <= owner_column:
            continue
        owner_match = re.match(r"([a-z0-9-]+)", cells[owner_column])
        if owner_match:
            result[cells[0]] = owner_match.group(1)
    return result


def parse_declaration_kind(text: str, name: str) -> str:
    # The first-pass spans start on the declaration line. Account for exported,
    # declared, and abstract forms plus declaration merging (enum + namespace).
    pattern = re.compile(
        r"\b(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?"
        r"(interface|type|const|enum|class|namespace|function|let|var)\s+"
        + re.escape(name)
        + r"\b"
    )
    match = pattern.search(text)
    return match.group(1) if match else "unknown"


def top_level_heritage(header: str, name: str) -> list[str]:
    """Return outer named bases in an interface/class extends clause.

    Generic constraints such as Type extends Entity on a type alias are not
    heritage and therefore do not make the alias an Entity.
    """
    decl = re.search(r"\b(interface|class)\s+" + re.escape(name) + r"\b", header)
    if not decl:
        return []
    remainder = header[decl.end() :]

    # Stop at the first top-level body opener.
    angle = paren = bracket = 0
    body_at = len(remainder)
    for i, char in enumerate(remainder):
        if char == "<":
            angle += 1
        elif char == ">" and (i == 0 or remainder[i - 1] != "="):
            angle = max(0, angle - 1)
        elif char == "(":
            paren += 1
        elif char == ")":
            paren = max(0, paren - 1)
        elif char == "[":
            bracket += 1
        elif char == "]":
            bracket = max(0, bracket - 1)
        elif char == "{" and angle == paren == bracket == 0:
            body_at = i
            break
    prefix = remainder[:body_at]

    # Find an extends keyword outside generic constraints.
    extends_at = None
    angle = paren = bracket = 0
    i = 0
    while i < len(prefix):
        char = prefix[i]
        if char == "<":
            angle += 1
        elif char == ">" and (i == 0 or prefix[i - 1] != "="):
            angle = max(0, angle - 1)
        elif char == "(":
            paren += 1
        elif char == ")":
            paren = max(0, paren - 1)
        elif char == "[":
            bracket += 1
        elif char == "]":
            bracket = max(0, bracket - 1)
        elif angle == paren == bracket == 0 and prefix.startswith("extends", i):
            before_ok = i == 0 or not (prefix[i - 1].isalnum() or prefix[i - 1] in "_$")
            after = i + len("extends")
            after_ok = after == len(prefix) or not (
                prefix[after].isalnum() or prefix[after] in "_$"
            )
            if before_ok and after_ok:
                extends_at = after
                break
        i += 1
    if extends_at is None:
        return []

    clause = re.split(r"\bimplements\b", prefix[extends_at:])[0]
    parts: list[str] = []
    start = 0
    angle = paren = bracket = 0
    for i, char in enumerate(clause + ","):
        if char == "<":
            angle += 1
        elif char == ">" and (i == 0 or clause[i - 1] != "="):
            angle = max(0, angle - 1)
        elif char == "(":
            paren += 1
        elif char == ")":
            paren = max(0, paren - 1)
        elif char == "[":
            bracket += 1
        elif char == "]":
            bracket = max(0, bracket - 1)
        elif char == "," and angle == paren == bracket == 0:
            parts.append(clause[start:i].strip())
            start = i + 1

    bases: list[str] = []
    for part in parts:
        match = re.match(r"([A-Za-z_$][\w$]*)", part)
        if match:
            bases.append(match.group(1))
    return bases


TypeExpression = tuple[str, object]


def split_top_level_type(text: str, delimiter: str) -> list[str]:
    """Split a type expression without looking through nested type syntax."""
    parts: list[str] = []
    start = 0
    angle = paren = bracket = brace = 0
    quote: str | None = None
    escaped = False
    for i, char in enumerate(text):
        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in {"'", '"', "`"}:
            quote = char
        elif char == "<":
            angle += 1
        elif char == ">" and (i == 0 or text[i - 1] != "="):
            angle = max(0, angle - 1)
        elif char == "(":
            paren += 1
        elif char == ")":
            paren = max(0, paren - 1)
        elif char == "[":
            bracket += 1
        elif char == "]":
            bracket = max(0, bracket - 1)
        elif char == "{":
            brace += 1
        elif char == "}":
            brace = max(0, brace - 1)
        elif char == delimiter and angle == paren == bracket == brace == 0:
            parts.append(text[start:i].strip())
            start = i + 1
    parts.append(text[start:].strip())
    return [part for part in parts if part]


def strip_wrapping_parentheses(text: str) -> str:
    text = text.strip()
    while text.startswith("(") and text.endswith(")"):
        depth = 0
        quote: str | None = None
        escaped = False
        closes_at_end = False
        for i, char in enumerate(text):
            if quote is not None:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == quote:
                    quote = None
                continue
            if char in {"'", '"', "`"}:
                quote = char
            elif char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    closes_at_end = i == len(text) - 1
                    break
        if not closes_at_end:
            break
        text = text[1:-1].strip()
    return text


def type_alias_rhs(text: str, name: str) -> str | None:
    """Return only a type alias RHS, excluding generic constraints."""
    declaration = re.search(r"\btype\s+" + re.escape(name) + r"\b", text)
    if declaration is None:
        return None
    remainder = text[declaration.end() :]
    angle = paren = bracket = brace = 0
    quote: str | None = None
    escaped = False
    equals_at = None
    for i, char in enumerate(remainder):
        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in {"'", '"', "`"}:
            quote = char
        elif char == "<":
            angle += 1
        elif char == ">" and (i == 0 or remainder[i - 1] != "="):
            angle = max(0, angle - 1)
        elif char == "(":
            paren += 1
        elif char == ")":
            paren = max(0, paren - 1)
        elif char == "[":
            bracket += 1
        elif char == "]":
            bracket = max(0, bracket - 1)
        elif char == "{":
            brace += 1
        elif char == "}":
            brace = max(0, brace - 1)
        elif char == "=" and angle == paren == bracket == brace == 0:
            equals_at = i
            break
    if equals_at is None:
        return None
    rhs = remainder[equals_at + 1 :].strip()
    if rhs.endswith(";"):
        rhs = rhs[:-1].rstrip()
    return rhs


def parse_type_expression(text: str) -> TypeExpression:
    """Parse only Entity-relevant top-level alias composition.

    References inside fields, generic arguments, constraints, conditional types,
    arrays, and utility types are deliberately opaque. This prevents a field such
    as ``value: Entity`` or ``T extends Entity`` from creating a false heritage
    edge while still recognizing ``Node<T>`` as a reference to ``Node``.
    """
    text = strip_wrapping_parentheses(text)
    unions = split_top_level_type(text, "|")
    if len(unions) > 1:
        return ("all", tuple(parse_type_expression(part) for part in unions))
    intersections = split_top_level_type(text, "&")
    if len(intersections) > 1:
        return ("any", tuple(parse_type_expression(part) for part in intersections))
    text = strip_wrapping_parentheses(text)
    reference = re.fullmatch(r"([A-Za-z_$][\w$]*)\s*(?:<[\s\S]*>)?", text)
    if reference is not None:
        return ("ref", reference.group(1))
    return ("none", text)


def expression_reference_names(expression: TypeExpression) -> set[str]:
    kind, value = expression
    if kind == "ref":
        return {str(value)}
    if kind in {"all", "any"}:
        names: set[str] = set()
        for child in value:
            names.update(expression_reference_names(child))
        return names
    return set()


def resolve_type_expression(
    expression: TypeExpression,
    references: dict[str, str | None],
    entities: set[str],
) -> bool:
    kind, value = expression
    if kind == "ref":
        target = references.get(str(value))
        return target == "Entity::Entity" or target in entities
    if kind == "any":
        return any(resolve_type_expression(child, references, entities) for child in value)
    if kind == "all":
        children = tuple(value)
        return bool(children) and all(
            resolve_type_expression(child, references, entities) for child in children
        )
    return False


def validate_type_expression_parser() -> None:
    assert type_alias_rhs("type A<T extends Entity> = Node<T> & T;", "A") == "Node<T> & T"
    assert parse_type_expression("Node<T> & NoInfer<T>") == (
        "any",
        (("ref", "Node"), ("ref", "NoInfer")),
    )
    assert expression_reference_names(parse_type_expression("Entity & { value: Entity }")) == {
        "Entity"
    }
    assert not expression_reference_names(parse_type_expression("{ value: Entity }"))
    assert not expression_reference_names(
        parse_type_expression("(value: Entity) => Entity")
    )
    union = parse_type_expression("NodeAny | Sprite")
    assert resolve_type_expression(
        union,
        {"NodeAny": "Node::NodeAny", "Sprite": "Sprite::Sprite"},
        {"Node::NodeAny", "Sprite::Sprite"},
    )
    assert not resolve_type_expression(
        parse_type_expression("NodeAny | null"),
        {"NodeAny": "Node::NodeAny"},
        {"Node::NodeAny"},
    )


def is_ts_only(owner: str | None) -> bool:
    return bool(owner and (owner in TS_ONLY_EXACT or owner.startswith("tool-")))


def rust_crate(owner: str | None) -> str | None:
    if owner is None or is_ts_only(owner):
        return None
    return f"flight-{owner}"


def md_escape(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def main() -> None:
    validate_type_expression_parser()
    first = load_json(FIRST_PASS_PATH)
    fixes = load_json(FIXES_PATH)
    ambiguous = load_json(AMBIGUOUS_PATH)
    dissolve_text = DISSOLVE_REPORT_PATH.read_text(encoding="utf-8")
    text_host_text = TEXT_HOST_REPORT_PATH.read_text(encoding="utf-8")

    decl_files = set(first["decls"])
    assert decl_files == set(first["file_owner"]) == set(first["file_rule"])
    assert len(decl_files) == 1024
    assert len(fixes) == 90
    assert len(ambiguous) == 84

    source_files = {
        path.stem
        for path in TS_ROOT.glob("*.ts")
        if not path.name.endswith(".test.ts") and path.name not in {"index.ts", "contract.ts"}
    }
    assert source_files == decl_files, (len(source_files), len(decl_files), sorted(source_files ^ decl_files))

    # One output record per declared symbol. Declaration merging is retained as
    # multiple spans on that symbol, rather than duplicated owner rows.
    grouped_decls: dict[str, list[dict[str, object]]] = defaultdict(list)
    source_lines: dict[str, list[str]] = {}
    for file_name, declarations in first["decls"].items():
        lines = (TS_ROOT / f"{file_name}.ts").read_text(encoding="utf-8").splitlines()
        source_lines[file_name] = lines
        for name, exported, line_start, line_end in declarations:
            text = "\n".join(lines[line_start - 1 : line_end])
            grouped_decls[f"{file_name}::{name}"].append(
                {
                    "exported": bool(exported),
                    "lineStart": line_start,
                    "lineEnd": line_end,
                    "kind": parse_declaration_kind(text, name),
                }
            )

    symbol_keys = set(grouped_decls)
    assert symbol_keys == set(first["name_owner"]) == set(first["name_rule"])
    assert len(symbol_keys) == 3377
    assert sum(len(spans) for spans in grouped_decls.values()) == 3436
    assert sum(1 for spans in grouped_decls.values() for span in spans if span["exported"]) == 3399
    unknown_kinds = [
        (key, span)
        for key, spans in grouped_decls.items()
        for span in spans
        if span["kind"] == "unknown"
    ]
    assert not unknown_kinds, unknown_kinds[:10]

    # Mutable ownership state plus a trace of each source-backed decision.
    owners: dict[str, str | None] = {}
    traces: dict[str, list[dict[str, object]]] = defaultdict(list)
    unresolved: dict[str, str] = {}
    dropped: dict[str, str] = {}

    def set_owner_key(key: str, to: str | None, source: str, reason: str) -> None:
        assert key in symbol_keys, (source, key)
        old = owners.get(key)
        if old == to and traces[key] and traces[key][-1]["source"] == source:
            return
        owners[key] = to
        traces[key].append({"source": source, "from": old, "to": to, "reason": reason})
        if to is not None:
            unresolved.pop(key, None)

    def set_owner_file(file_name: str, to: str | None, source: str, reason: str) -> None:
        assert file_name in decl_files, (source, file_name)
        for key in sorted(key for key in symbol_keys if key.startswith(file_name + "::")):
            set_owner_key(key, to, source, reason)

    # Start from the first-pass per-symbol owner, preserving name-level rule-(a)
    # splits already present in that input.
    for key in sorted(symbol_keys):
        initial = first["name_owner"][key]
        owners[key] = initial
        traces[key].append(
            {
                "source": f"dissolve-types-owners-firstpass.json:{first['name_rule'][key]}",
                "from": None,
                "to": initial,
                "reason": "first-pass per-symbol ownership",
            }
        )

    # Complete first-pass rule (c): owner of referencing type files. Exclude
    # self-references, which provide no ownership evidence.
    unique_c: dict[str, str] = {}
    for file_name in sorted(decl_files):
        if first["file_owner"][file_name] is not None:
            continue
        names = {item[0] for item in first["decls"][file_name]}
        referring_owners: set[str] = set()
        for source_key, refs in first["refs"].items():
            if source_key.split("::", 1)[0] == file_name:
                continue
            if any(ref_name in names and ref_file == file_name for ref_name, ref_file, _ in refs):
                source_owner = first["name_owner"].get(source_key)
                if source_owner:
                    referring_owners.add(source_owner)
        if len(referring_owners) == 1:
            unique_c[file_name] = next(iter(referring_owners))
    assert len(unique_c) == 24
    for file_name, owner in sorted({**unique_c, **RULE_C_TIES}.items()):
        set_owner_file(
            file_name,
            owner,
            "dissolve-types.md:rule-c",
            "owner of referencing type files; ties choose the lowest referring package",
        )
    assert len({**unique_c, **RULE_C_TIES}) == 28

    for file_name, owner in RULE_D.items():
        set_owner_file(
            file_name,
            owner,
            "dissolve-types.md:rule-d",
            "package-name prefix fallback",
        )

    for file_name, owner in DISSOLVE_ORPHAN_DECISIONS.items():
        set_owner_file(
            file_name,
            owner,
            "dissolve-types.md:orphan-recommendation",
            "explicit orphan placement/correction in the report",
        )

    # Appendix B: automatic dominator re-homing (58 whole files).
    dominators = parse_markdown_table_mapping(
        dissolve_text,
        "## Appendix B",
        "## Appendix C",
        owner_column=2,
    )
    assert len(dominators) == 58, len(dominators)
    for file_name, owner in dominators.items():
        set_owner_file(
            file_name,
            owner,
            "dissolve-types.md:appendix-b",
            "lowest user dominating every other user/referrer",
        )

    # Apply whole-file moves from the 90-fix set before specific name splits.
    file_fixes = [fix for fix in fixes if fix.get("kind") == "file" and fix.get("to")]
    for fix in file_fixes:
        set_owner_file(
            fix["target"],
            fix["to"],
            f"dissolve-types-fixes.json:{fix['class']}",
            fix["why"],
        )

    # The later report's C5 tables contain all 84 reviewed ambiguous-file owners.
    c5_owners = parse_markdown_table_mapping(
        text_host_text,
        "### C5. Full list",
        None,
        owner_column=3,
    )
    assert len(c5_owners) == 84, len(c5_owners)
    c5_owners["BackendOperationExplanation"] = "hostcapability"
    for file_name, owner in c5_owners.items():
        set_owner_file(
            file_name,
            owner,
            "text-host-ownership.md:C5",
            "reviewed ambiguous-type owner",
        )

    # Later whole-file decisions and approved placements.
    for file_name in ("TextFormat", "TextFormatRange", "FontVariation"):
        set_owner_file(
            file_name,
            "textformat",
            "design-decisions.md:D8-textformat",
            "approved textformat foundation ownership",
        )
    for file_name in ("HostInput", "HostInputTarget"):
        set_owner_file(
            file_name,
            "input",
            "text-host-ownership.md:B3",
            "input host contracts consolidate in input",
        )
    set_owner_file(
        "ResourceResolutionState",
        "resource",
        "design-decisions.md:D8-resource",
        "approved resource crate",
    )
    set_owner_file(
        "BackendExplanation",
        "hostcapability",
        "foreman-WP9-approved-placement",
        "approved hostcapability explanation vocabulary",
    )
    set_owner_file(
        "BackendOperationExplanation",
        "hostcapability",
        "foreman-WP9-approved-placement",
        "approved hostcapability explanation vocabulary",
    )

    # Specific-name fixes take precedence over whole-file moves.
    name_fixes = [fix for fix in fixes if fix.get("kind") == "name" and fix.get("to")]
    for fix in name_fixes:
        targets = fix["target"] if isinstance(fix["target"], list) else [fix["target"]]
        for key in targets:
            set_owner_key(
                key,
                fix["to"],
                f"dissolve-types-fixes.json:{fix['class']}",
                fix["why"],
            )

    # Text/host report name-level splits.
    for key in GLYPH_TO_FONT:
        set_owner_key(
            key,
            "font",
            "text-host-ownership.md:A3",
            "glyph rasterizer contract moves to font; atlas types stay in glyphatlas",
        )
    set_owner_key(
        "GlEffectState::EffectStateOptions",
        "effects",
        "text-host-ownership.md:C2",
        "backend-neutral effect vocabulary",
    )
    for name, owner in HOST_GROUP_OWNERS.items():
        set_owner_key(
            f"Host::{name}",
            owner,
            "text-host-ownership.md:B3",
            "each feature owns its Host<Group>Capabilities record",
        )
    for key, owner in ADAPTER_PROFILE_OWNERS.items():
        set_owner_key(
            key,
            owner,
            "text-host-ownership.md:B3",
            "platform-specific profile belongs to its adapter",
        )

    # Rename the geometry-data package after all semantic ownership moves.
    for key in sorted(symbol_keys):
        if owners[key] == "mesh":
            set_owner_key(
                key,
                "meshgeometry",
                "design-decisions.md:D8-meshgeometry",
                "approved mesh package rename; Mesh node itself is owned by scene3d",
            )

    # Principal explicitly dropped all 14 previously unresolved symbols as dead.
    for file_name in sorted(DROPPED_FILES):
        reason = "dropped: unused (principal)"
        set_owner_file(file_name, None, "principal-c58e70ce:dead-code", reason)
        for key in (key for key in symbol_keys if key.startswith(file_name + "::")):
            dropped[key] = reason

    # Entity graph from interface/class heritage plus top-level type-alias
    # composition. Alias parsing never descends into fields, generic arguments,
    # constraints, arrays, conditional types, or utility types.
    parents: dict[str, set[str]] = defaultdict(set)
    heritage_names: dict[str, set[str]] = defaultdict(set)
    alias_reference_names: dict[str, set[str]] = defaultdict(set)
    alias_expressions: dict[str, TypeExpression] = {}
    alias_references: dict[str, dict[str, str | None]] = {}
    unresolved_utility_bases: list[dict[str, str]] = []

    def referenced_symbol(key: str, name: str) -> str | None:
        if name == "Entity":
            return "Entity::Entity"
        candidates = {
            f"{ref_file}::{ref_name}"
            for ref_name, ref_file, _ in first["refs"].get(key, [])
            if ref_name == name
        }
        if len(candidates) == 1:
            return next(iter(candidates))
        if len(candidates) > 1:
            raise AssertionError((key, name, candidates))
        return None

    for key, spans in grouped_decls.items():
        file_name, name = key.split("::", 1)
        lines = source_lines[file_name]
        for span in spans:
            text = "\n".join(lines[span["lineStart"] - 1 : span["lineEnd"]])
            if span["kind"] in {"interface", "class"}:
                for base in top_level_heritage(text, name):
                    heritage_names[key].add(base)
                    target = referenced_symbol(key, base)
                    if target is not None:
                        parents[key].add(target)
                    elif base in {"Partial", "Pick"}:
                        unresolved_utility_bases.append({"symbol": key, "base": base})
                    else:
                        raise AssertionError((key, base, target))
            elif span["kind"] == "type":
                rhs = type_alias_rhs(text, name)
                assert rhs is not None, (key, text)
                expression = parse_type_expression(rhs)
                prior = alias_expressions.get(key)
                assert prior is None or prior == expression, (key, prior, expression)
                alias_expressions[key] = expression
                names = expression_reference_names(expression)
                alias_reference_names[key].update(names)
                references = {ref_name: referenced_symbol(key, ref_name) for ref_name in names}
                alias_references[key] = references
                parents[key].update(target for target in references.values() if target is not None)

    direct_interface = {
        key for key, bases in parents.items() if "Entity::Entity" in bases and key not in alias_expressions
    }
    assert len({key.split("::", 1)[0] for key in direct_interface}) == 234

    entity_kind: dict[str, str] = {}
    changed = True
    while changed:
        changed = False
        known = set(entity_kind)
        for key, bases in parents.items():
            if key in entity_kind or key == "Entity::Entity" or key in alias_expressions:
                continue
            if any(base in known or base == "Entity::Entity" for base in bases):
                entity_kind[key] = (
                    "direct" if "Entity::Entity" in bases else "transitive"
                )
                changed = True
        known = set(entity_kind)
        for key, expression in alias_expressions.items():
            if key in entity_kind or key == "Entity::Entity":
                continue
            references = alias_references[key]
            if resolve_type_expression(expression, references, known):
                entity_kind[key] = (
                    "direct"
                    if "Entity::Entity" in references.values()
                    else "transitive"
                )
                changed = True
    entity_kind["Entity::Entity"] = "root"

    def entity_path(key: str) -> list[str]:
        kind = entity_kind.get(key, "none")
        if kind == "none":
            return []
        if kind == "root":
            return [key]
        queue: deque[tuple[str, list[str]]] = deque([(key, [key])])
        seen = {key}
        while queue:
            current, path = queue.popleft()
            for base in sorted(parents.get(current, set())):
                if base == "Entity::Entity":
                    return path + [base]
                if base not in seen:
                    seen.add(base)
                    queue.append((base, path + [base]))
        raise AssertionError(("missing entity path", key))

    actual_entity_examples = {
        "NodeOf": entity_path("Node::NodeOf"),
        "Node2D": entity_path("Node2D::Node2D"),
        "Node3D": entity_path("Node3D::Node3D"),
        "Sprite": entity_path("Sprite::Sprite"),
        "Mesh": entity_path("Mesh::Mesh"),
        "TrayCreateResult": entity_path("Tray::TrayCreateResult"),
    }
    assert actual_entity_examples["NodeOf"] == [
        "Node::NodeOf",
        "Node::Node",
        "Entity::Entity",
    ]
    assert actual_entity_examples["Node2D"] == [
        "Node2D::Node2D",
        "Node::Node",
        "Entity::Entity",
    ]
    assert actual_entity_examples["Node3D"] == [
        "Node3D::Node3D",
        "Node::Node",
        "Entity::Entity",
    ]
    assert actual_entity_examples["Sprite"] == [
        "Sprite::Sprite",
        "Node2D::Node2D",
        "Node::Node",
        "Entity::Entity",
    ]
    assert actual_entity_examples["Mesh"] == [
        "Mesh::Mesh",
        "Node3D::Node3D",
        "Node::Node",
        "Entity::Entity",
    ]
    assert actual_entity_examples["TrayCreateResult"] == [
        "Tray::TrayCreateResult",
        "Entity::Entity",
    ]
    assert entity_kind.get("Entity::EntityConstruction", "none") == "none"
    assert entity_kind.get("Entity::EntityWithoutRuntime", "none") == "none"
    assert entity_kind.get("NodeInteraction::HitArea", "none") == "none"

    direct_keys = {key for key, kind in entity_kind.items() if kind == "direct"}
    direct_files = {key.split("::", 1)[0] for key in direct_keys}
    closure_keys = {key for key, kind in entity_kind.items() if kind in {"direct", "transitive"}}
    closure_files = {key.split("::", 1)[0] for key in closure_keys}

    # Recompute the superseded interface/class-only closure so the correction
    # delta is generated from the same pinned source, not hand-maintained.
    legacy_entity_kind: dict[str, str] = {key: "direct" for key in direct_interface}
    changed = True
    while changed:
        changed = False
        for key, bases in parents.items():
            if key in legacy_entity_kind or key in alias_expressions or key == "Entity::Entity":
                continue
            if any(base in legacy_entity_kind or base == "Entity::Entity" for base in bases):
                legacy_entity_kind[key] = "transitive"
                changed = True
    legacy_entity_kind["Entity::Entity"] = "root"
    legacy_entity_counts = Counter(
        legacy_entity_kind.get(key, "none") for key in symbol_keys
    )
    current_entity_counts = Counter(entity_kind.get(key, "none") for key in symbol_keys)
    assert dict(legacy_entity_counts) == {
        "direct": 332,
        "none": 2845,
        "root": 1,
        "transitive": 199,
    }
    entity_correction_rows = [
        {
            "id": key,
            "before": legacy_entity_kind.get(key, "none"),
            "after": entity_kind.get(key, "none"),
            "path": entity_path(key),
        }
        for key in sorted(symbol_keys)
        if legacy_entity_kind.get(key, "none") != entity_kind.get(key, "none")
    ]
    assert len(entity_correction_rows) == 51

    # Validate all fix targets and later decision targets were concrete.
    for fix in fixes:
        if fix.get("kind") == "file":
            assert fix["target"] in decl_files
        elif fix.get("kind") == "name":
            targets = fix["target"] if isinstance(fix["target"], list) else [fix["target"]]
            assert set(targets) <= symbol_keys
    assert {row["file"] for row in ambiguous} == set(c5_owners)
    assert set(ADAPTER_PROFILE_OWNERS) <= symbol_keys
    assert {f"Host::{name}" for name in HOST_GROUP_OWNERS} <= symbol_keys

    records: list[dict[str, object]] = []
    for key in sorted(
        symbol_keys,
        key=lambda item: (
            item.split("::", 1)[0].lower(),
            min(span["lineStart"] for span in grouped_decls[item]),
            item.split("::", 1)[1].lower(),
        ),
    ):
        file_name, name = key.split("::", 1)
        spans = sorted(grouped_decls[key], key=lambda span: (span["lineStart"], span["lineEnd"]))
        owner = owners[key]
        entity = entity_kind.get(key, "none")
        ts_only = is_ts_only(owner)
        notes: list[str] = []
        if ts_only:
            notes.append("D11 TS-only owner; no Rust crate is planned")
        if key in unresolved:
            notes.append(unresolved[key])
        if key in dropped:
            notes.append(dropped[key])
        owner_status = (
            "dropped"
            if key in dropped
            else "unresolved"
            if key in unresolved
            else "resolved"
        )
        alias_refs = alias_references.get(key, {})
        records.append(
            {
                "id": key,
                "name": name,
                "sourceFile": f"packages/types/src/{file_name}.ts",
                "sourceLocations": [
                    {
                        "lineStart": span["lineStart"],
                        "lineEnd": span["lineEnd"],
                        "exported": span["exported"],
                        "kind": span["kind"],
                    }
                    for span in spans
                ],
                "exported": any(span["exported"] for span in spans),
                "declarationKinds": sorted({span["kind"] for span in spans}),
                "ownerPackage": owner,
                "owningCrate": rust_crate(owner),
                "ownerStatus": owner_status,
                "ownerResolution": traces[key][-1],
                "ownershipTrace": traces[key],
                "entityClassification": entity,
                "entityDirect": entity == "direct",
                "entityClosure": entity in {"root", "direct", "transitive"},
                "entityPath": entity_path(key),
                "heritage": sorted(heritage_names.get(key, set())),
                "aliasComposition": (
                    {
                        "operator": alias_expressions[key][0],
                        "references": [
                            {"name": ref_name, "target": alias_refs[ref_name]}
                            for ref_name in sorted(alias_refs)
                        ],
                    }
                    if key in alias_expressions
                    else None
                ),
                "tsOnly": ts_only,
                "notes": notes,
                "unresolvedReason": unresolved.get(key),
                "dropReason": dropped.get(key),
            }
        )

    unresolved_records = [record for record in records if record["ownerStatus"] == "unresolved"]
    dropped_records = [record for record in records if record["ownerStatus"] == "dropped"]
    assert len(dropped_records) == 14, [record["id"] for record in dropped_records]
    ts_only_records = [record for record in records if record["tsOnly"]]
    owner_counts = Counter(
        (
            record["ownerPackage"]
            or ("<dropped>" if record["ownerStatus"] == "dropped" else "<unresolved>")
        )
        for record in records
    )
    entity_counts = Counter(record["entityClassification"] for record in records)
    assert entity_counts == current_entity_counts
    declaration_kind_counts = Counter(
        location["kind"] for record in records for location in record["sourceLocations"]
    )

    payload = {
        "schemaVersion": 2,
        "title": "Flight consolidated type/export ownership table",
        "pinnedTypeScriptRevision": "a627849",
        "scope": "@flighthq/types packages/types/src declaration files (tests, index.ts, and contract.ts excluded)",
        "rules": {
            "ownership": "A symbol lives in the lowest package that must name it; later approved decisions override first-pass assignments.",
            "entity": "root = Entity itself; direct = immediate interface/class heritage or top-level alias composition names Entity; transitive = interface/class or alias composition reaches Entity through another declared symbol; intersections require any Entity operand and unions require every operand to be Entity; none = no Entity path.",
            "tsOnly": "D11 owners: host-web/electron/tauri/capacitor, scene2d-dom/canvas, effects-canvas, textshaper-canvas, tool-*, sdk, and vite-plugin-manifest.",
            "declarationMerging": "One row per file::symbol; every source declaration span is retained in sourceLocations.",
        },
        "inputs": [
            "agents/research/dissolve-types-owners-firstpass.json",
            "agents/research/dissolve-types.md",
            "agents/research/dissolve-types-fixes.json",
            "agents/research/text-host-ownership.md",
            "agents/research/text-host-ambiguous-owners.json",
            "agents/design-decisions.md D8/D11/D12",
            "agents/plan.md WP9",
            "pinned TS packages/types/src at a627849",
        ],
        "validation": {
            "sourceFiles": len(decl_files),
            "rawDeclarationSpans": sum(len(spans) for spans in grouped_decls.values()),
            "exportedDeclarationSpans": sum(
                1 for spans in grouped_decls.values() for span in spans if span["exported"]
            ),
            "uniqueSymbols": len(records),
            "firstPassNameKeys": len(first["name_owner"]),
            "fixEntriesApplied": len(fixes),
            "dominatorFileMovesApplied": len(dominators),
            "ambiguousFilesReviewed": len(ambiguous),
            "directEntityFiles": len(direct_files),
            "entityClosureFiles": len(closure_files),
            "typeAliasesAnalyzed": len(alias_expressions),
            "entityAliasAndInterfaceExamples": actual_entity_examples,
            "utilityHeritageBasesIgnored": unresolved_utility_bases,
            "unresolvedSymbols": len(unresolved_records),
            "droppedUnusedSymbols": len(dropped_records),
            "tsOnlySymbols": len(ts_only_records),
            "coverage": "complete",
            "inputConsistency": "pass",
        },
        "counts": {
            "byOwnerPackage": dict(sorted(owner_counts.items())),
            "byEntityClassification": dict(sorted(entity_counts.items())),
            "byDeclarationKind": dict(sorted(declaration_kind_counts.items())),
        },
        "entityCorrection": {
            "reason": "Principal review: follow Entity inheritance through top-level type-alias composition",
            "beforeByEntityClassification": dict(sorted(legacy_entity_counts.items())),
            "afterByEntityClassification": dict(sorted(entity_counts.items())),
            "beforeEntityRows": sum(
                legacy_entity_counts[kind] for kind in ("root", "direct", "transitive")
            ),
            "afterEntityRows": sum(
                entity_counts[kind] for kind in ("root", "direct", "transitive")
            ),
            "changedRows": entity_correction_rows,
        },
        "unresolved": [
            {
                "id": record["id"],
                "sourceFile": record["sourceFile"],
                "sourceLocations": record["sourceLocations"],
                "reason": record["unresolvedReason"],
            }
            for record in unresolved_records
        ],
        "dropped": [
            {
                "id": record["id"],
                "sourceFile": record["sourceFile"],
                "sourceLocations": record["sourceLocations"],
                "reason": record["dropReason"],
            }
            for record in dropped_records
        ],
        "symbols": records,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = OUT_DIR / "type-owners.json"
    md_path = OUT_DIR / "type-owners.md"
    json_path.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")

    lines: list[str] = [
        "# Flight consolidated type/export ownership table",
        "",
        "Pinned TypeScript source: `@flighthq/types` at `a627849` (`packages/types/src`; tests, `index.ts`, and `contract.ts` excluded).",
        "",
        "This is the corrected review artifact for WP9. It applies the first-pass owner data, the 58 dominator re-homes and 90 cycle-breaking fixes, the later text/host decisions, the approved `textformat`, `resource`, `hostcapability`, and `meshgeometry` placements, and Principal's dead-code ruling. It does not create a central types crate.",
        "",
        "## Validation summary",
        "",
        f"- Coverage: **complete** — {len(decl_files)} source files, {sum(len(s) for s in grouped_decls.values())} declaration spans, and {len(records)} unique `file::symbol` rows.",
        f"- Export coverage: {sum(1 for spans in grouped_decls.values() for span in spans if span['exported'])} exported declaration spans; declaration merging is retained as multiple source locations on one row.",
        f"- Ownership inputs: 58 dominator file moves, all {len(fixes)} fix entries, and all {len(ambiguous)} reviewed ambiguous files were applied and target-checked.",
        f"- Entity closure: {entity_counts['direct']} direct, {entity_counts['transitive']} transitive, 1 root, and {entity_counts['none']} non-Entity symbols; {len(alias_expressions)} type aliases were analyzed by top-level composition and direct Entity declarations occur in {len(direct_files)} files.",
        f"- Entity correction delta: {sum(legacy_entity_counts[k] for k in ('root', 'direct', 'transitive'))} Entity rows before, {sum(entity_counts[k] for k in ('root', 'direct', 'transitive'))} after; {len(entity_correction_rows)} rows changed classification.",
        "- Entity validation examples: `Sprite -> Node2D -> Node -> Entity`, `Mesh -> Node3D -> Node -> Entity`, `Node2D -> Node -> Entity`, `Node3D -> Node -> Entity`, `NodeOf -> Node -> Entity`, and the all-Entity union `TrayCreateResult -> Entity`.",
        "- False-positive guards: generic constraints, typed fields, arrays, utility types, and conditional types do not create Entity edges; `EntityConstruction`, `EntityWithoutRuntime`, and the mixed union `HitArea` validate as non-Entity.",
        f"- TS-only: {len(ts_only_records)} symbols are owned by D11 TS-only packages and therefore have no Rust crate.",
        f"- Dropped: **{len(dropped_records)} symbols** are marked `dropped: unused (principal)` and have no owner or Rust crate.",
        f"- Unresolved: **{len(unresolved_records)} symbols** remain; no new ownership guess was made.",
        "- Input consistency: **pass** — declaration/file/name key sets match, the pinned source file set matches the first-pass inventory, all fix targets exist, and all ambiguous-review rows resolve to concrete source files.",
        "",
        "Entity values mean: `root` = `Entity`; `direct` = immediate interface/class heritage or a top-level alias operand names `Entity`; `transitive` = interface/class heritage or top-level alias composition reaches `Entity` through another declared symbol; `none` = no Entity path. Intersections require any Entity operand, while unions require every operand to be Entity. Generic constraints, generic arguments, typed fields, arrays, conditional types, and opaque utility types do not create edges.",
        "",
        "## Dropped declarations",
        "",
        "| Source | Symbol | Reason |",
        "|---|---|---|",
    ]
    for record in dropped_records:
        locs = ", ".join(
            f"{record['sourceFile']}:{loc['lineStart']}-{loc['lineEnd']}" for loc in record["sourceLocations"]
        )
        lines.append(
            f"| `{md_escape(locs)}` | `{md_escape(record['name'])}` | {md_escape(record['dropReason'])} |"
        )

    if unresolved_records:
        lines.extend(
            [
                "",
                "## Unresolved ownership decisions",
                "",
                "| Source | Symbol | Reason |",
                "|---|---|---|",
            ]
        )
        for record in unresolved_records:
            locs = ", ".join(
                f"{record['sourceFile']}:{loc['lineStart']}-{loc['lineEnd']}"
                for loc in record["sourceLocations"]
            )
            lines.append(
                f"| `{md_escape(locs)}` | `{md_escape(record['name'])}` | {md_escape(record['unresolvedReason'])} |"
            )

    lines.extend(
        [
            "",
            "## Entity correction delta",
            "",
            "The prior interface/class-only closure missed these rows. Every path below is regenerated from the pinned source graph; alias references and source spans remain in the JSON companion.",
            "",
            "| Symbol | Before | After | Entity path |",
            "|---|---|---|---|",
        ]
    )
    for correction in entity_correction_rows:
        lines.append(
            "| `{}` | `{}` | `{}` | `{}` |".format(
                md_escape(correction["id"]),
                correction["before"],
                correction["after"],
                md_escape(" -> ".join(correction["path"])),
            )
        )

    lines.extend(
        [
            "",
            "## Complete table",
            "",
            "`Rust crate` is blank for TS-only, dropped, and unresolved symbols. `Owner basis` is the final, highest-precedence decision; the JSON companion retains the complete ownership trace, alias references, and Entity path.",
            "",
            "| Source | Symbol | Kind | Exported | Owner package | Rust crate | Entity | TS-only | Owner basis / notes |",
            "|---|---|---|:---:|---|---|---|:---:|---|",
        ]
    )
    for record in records:
        locs = "; ".join(
            (
                f"{record['sourceFile']}:{loc['lineStart']}"
                if loc["lineStart"] == loc["lineEnd"]
                else f"{record['sourceFile']}:{loc['lineStart']}-{loc['lineEnd']}"
            )
            for loc in record["sourceLocations"]
        )
        kinds = ",".join(record["declarationKinds"])
        owner = (
            record["ownerPackage"]
            or ("DROPPED" if record["ownerStatus"] == "dropped" else "UNRESOLVED")
        )
        crate = record["owningCrate"] or ""
        resolution = record["ownerResolution"]["source"]
        note_parts = [resolution] + record["notes"]
        lines.append(
            "| `{}` | `{}` | `{}` | {} | `{}` | `{}` | `{}` | {} | {} |".format(
                md_escape(locs),
                md_escape(record["name"]),
                md_escape(kinds),
                "yes" if record["exported"] else "no",
                md_escape(owner),
                md_escape(crate),
                record["entityClassification"],
                "yes" if record["tsOnly"] else "no",
                md_escape("; ".join(note_parts)),
            )
        )

    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(json.dumps(payload["validation"], indent=2))
    print(f"wrote {md_path} ({md_path.stat().st_size} bytes)")
    print(f"wrote {json_path} ({json_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
