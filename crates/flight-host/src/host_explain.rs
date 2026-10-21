//! Pull queries over a host (TS `hostExplain.ts`): what it provides, what it does not, and for the
//! slots whose absence is a common and confusing failure, where to get the missing capability.
//! Plain data, no logging; `enable_host_guards` reads these same tables so a warning cannot
//! contradict a query.
//!
//! COVERAGE is the subset `host_query` exposes accessors for: a slot earns a row when a Flight package
//! takes that capability as a function parameter. A slot outside it is reported neither present nor
//! missing; `explain_host`'s `groups` is the half that sees every group.

use crate::types::{
    Host, HostCapabilityBackend, HostCapabilityCoverage, HostCapabilityExplanation,
    HostCapabilityGroupExplanation, HostExplanation,
};

struct CoverageRow {
    capability: &'static str,
    group: &'static str,
    slot: &'static str,
}

struct BackendRow {
    entry_point: &'static str,
    package_name: &'static str,
    platform: &'static str,
}

struct RemedyRow {
    backends: &'static [BackendRow],
    consequence: &'static str,
    fix: &'static str,
    key: &'static str,
}

// The pending `wgpu.context` row arrives with its render-backend owner (Principal 6f61648b tracked delta).
const COVERAGE: &[CoverageRow] = &[
    CoverageRow {
        capability: "HostAudioDeviceCapability",
        group: "audio",
        slot: "device",
    },
    CoverageRow {
        capability: "HostAudioMixerCapability",
        group: "audio",
        slot: "mixer",
    },
    CoverageRow {
        capability: "HostBitmapEncodeCapability",
        group: "bitmap",
        slot: "encode",
    },
    CoverageRow {
        capability: "HostBitmapReadbackCapability",
        group: "bitmap",
        slot: "readback",
    },
    CoverageRow {
        capability: "HostClipboardFormatsCapability",
        group: "clipboard",
        slot: "formats",
    },
    CoverageRow {
        capability: "HostDeviceCapability",
        group: "device",
        slot: "info",
    },
    CoverageRow {
        capability: "HostFileSystemCapability",
        group: "fileSystem",
        slot: "access",
    },
    CoverageRow {
        capability: "HostFontLoadingCapability",
        group: "font",
        slot: "loader",
    },
    CoverageRow {
        capability: "HostGeolocationCapability",
        group: "geolocation",
        slot: "position",
    },
    CoverageRow {
        capability: "HostGlyphRasterizerCapability",
        group: "glyph",
        slot: "rasterizer",
    },
    CoverageRow {
        capability: "HostHapticsCapability",
        group: "haptics",
        slot: "engine",
    },
    CoverageRow {
        capability: "HostImageCapability",
        group: "image",
        slot: "loader",
    },
    CoverageRow {
        capability: "HostInputIngressCapability",
        group: "input",
        slot: "ingress",
    },
    CoverageRow {
        capability: "HostLifecycleCapability",
        group: "lifecycle",
        slot: "state",
    },
    CoverageRow {
        capability: "HostNetCapability",
        group: "net",
        slot: "http",
    },
    CoverageRow {
        capability: "HostNotificationPermissionCapability",
        group: "notification",
        slot: "permission",
    },
    CoverageRow {
        capability: "HostPlatformCapability",
        group: "platform",
        slot: "info",
    },
    CoverageRow {
        capability: "HostPowerKeepAwakeCapability",
        group: "power",
        slot: "keepAwake",
    },
    CoverageRow {
        capability: "HostPreferencesCapability",
        group: "preferences",
        slot: "local",
    },
    CoverageRow {
        capability: "HostPreferencesPersistenceQueryCapability",
        group: "preferences",
        slot: "persistenceQuery",
    },
    CoverageRow {
        capability: "HostScreenQueryCapability",
        group: "screen",
        slot: "query",
    },
    CoverageRow {
        capability: "HostSensorsCapability",
        group: "sensors",
        slot: "query",
    },
    CoverageRow {
        capability: "HostSocketCapability",
        group: "socket",
        slot: "connection",
    },
    CoverageRow {
        capability: "HostSoftKeyboardInfoCapability",
        group: "softKeyboard",
        slot: "info",
    },
    CoverageRow {
        capability: "HostTextSegmenterCapability",
        group: "textSegment",
        slot: "segmenter",
    },
    CoverageRow {
        capability: "HostTextShaperCapability",
        group: "textShaper",
        slot: "shaper",
    },
    CoverageRow {
        capability: "HostVideoCapability",
        group: "video",
        slot: "playback",
    },
];

const WEB_HOST: BackendRow = BackendRow {
    entry_point: "webHost",
    package_name: "@flighthq/host-web",
    platform: "Web",
};

// Only the slots whose absence is a common, confusing failure carry prose and a source; the strings
// are the pinned source content (D0). Each `fix` names every `entry_point` in `backends`.
const REMEDIES: &[RemedyRow] = &[
    RemedyRow {
        backends: &[WEB_HOST],
        consequence: "no audio can be decoded or played",
        fix: "build the host from webHost in @flighthq/host-web",
        key: "audio.device",
    },
    RemedyRow {
        backends: &[WEB_HOST],
        consequence: "sound transforms and mixer routing are inert",
        fix: "build the host from webHost in @flighthq/host-web",
        key: "audio.mixer",
    },
    RemedyRow {
        backends: &[WEB_HOST],
        consequence: "nothing can decode an image or read its dimensions",
        fix: "build the host from webHost in @flighthq/host-web",
        key: "image.loader",
    },
    RemedyRow {
        backends: &[WEB_HOST],
        consequence: "no pointer, key, or wheel event reaches the input manager",
        fix: "build the host from webHost in @flighthq/host-web",
        key: "input.ingress",
    },
    RemedyRow {
        backends: &[BackendRow {
            entry_point: "createWebTextSegmenterBackend",
            package_name: "@flighthq/textsegment",
            platform: "Web",
        }],
        consequence: "grapheme, word, and sentence breaking fall back to code-unit boundaries",
        fix: "pass createWebTextSegmenterBackend() from @flighthq/textsegment into createHost's textSegment group",
        key: "textSegment.segmenter",
    },
    RemedyRow {
        backends: &[BackendRow {
            entry_point: "webHostTextShaper",
            package_name: "@flighthq/host-web",
            platform: "Canvas 2D",
        }],
        consequence: "text cannot be measured or shaped and lays out at zero width",
        fix: "pass webHostTextShaper from @flighthq/host-web into createHost's textShaper group",
        key: "textShaper.shaper",
    },
    RemedyRow {
        backends: &[WEB_HOST],
        consequence: "nothing can decode or present video",
        fix: "build the host from webHost in @flighthq/host-web",
        key: "video.playback",
    },
];

/// Reports what a host provides (TS `explainHost`): `groups` lists every group the host carries with
/// its filled slot names, and `capabilities` is the covered-slot census, present and missing alike.
pub fn explain_host(host: &Host) -> HostExplanation {
    let mut groups = Vec::new();
    read_host_groups(&mut groups, host);
    let capabilities = COVERAGE
        .iter()
        .map(|entry| HostCapabilityCoverage {
            capability: entry.capability.to_string(),
            group: entry.group.to_string(),
            is_present: is_slot_present(host, entry.group, entry.slot),
            slot: entry.slot.to_string(),
        })
        .collect();
    return HostExplanation {
        capabilities,
        groups,
    };
}

/// Why `get_host_audio_device` returned `None`, and which package supplies the capability (TS
/// `explainHostAudioDevice`).
pub fn explain_host_audio_device(host: &Host) -> HostCapabilityExplanation {
    return explain_slot(host, "audio", "device");
}

/// TS `explainHostAudioMixer`.
pub fn explain_host_audio_mixer(host: &Host) -> HostCapabilityExplanation {
    return explain_slot(host, "audio", "mixer");
}

/// TS `explainHostImage`.
pub fn explain_host_image(host: &Host) -> HostCapabilityExplanation {
    return explain_slot(host, "image", "loader");
}

/// TS `explainHostInputIngress`.
pub fn explain_host_input_ingress(host: &Host) -> HostCapabilityExplanation {
    return explain_slot(host, "input", "ingress");
}

/// TS `explainHostTextSegmenter`.
pub fn explain_host_text_segmenter(host: &Host) -> HostCapabilityExplanation {
    return explain_slot(host, "textSegment", "segmenter");
}

/// TS `explainHostTextShaper`.
pub fn explain_host_text_shaper(host: &Host) -> HostCapabilityExplanation {
    return explain_slot(host, "textShaper", "shaper");
}

/// TS `explainHostVideo`.
pub fn explain_host_video(host: &Host) -> HostCapabilityExplanation {
    return explain_slot(host, "video", "playback");
}

// The explanation the guard layer emits and the explainers return, built once so both say the same.
fn explain_slot(host: &Host, group: &str, slot: &str) -> HostCapabilityExplanation {
    let coverage = COVERAGE
        .iter()
        .find(|entry| entry.group == group && entry.slot == slot);
    let key = format!("{}.{}", group, slot);
    let remedy = REMEDIES.iter().find(|entry| entry.key == key);
    let is_present = is_slot_present(host, group, slot);
    let capability = coverage.map(|entry| entry.capability).unwrap_or("");
    let accessor = format!(
        "get{}",
        capability.strip_suffix("Capability").unwrap_or(capability)
    );
    let message = if is_present {
        format!("{}: host.{}.{} is present", accessor, group, slot)
    } else {
        format!(
            "{}: host.{}.{} is absent, so {} \u{2014} {}",
            accessor,
            group,
            slot,
            remedy
                .map(|entry| entry.consequence)
                .unwrap_or("the capability is unavailable"),
            remedy
                .map(|entry| entry.fix)
                .unwrap_or("build the host from a @flighthq/host-* package that provides it"),
        )
    };
    let backends = remedy
        .map(|entry| {
            entry
                .backends
                .iter()
                .map(|backend| HostCapabilityBackend {
                    entry_point: backend.entry_point.to_string(),
                    package_name: backend.package_name.to_string(),
                    platform: backend.platform.to_string(),
                })
                .collect()
        })
        .unwrap_or_default();
    return HostCapabilityExplanation {
        backends,
        capability: capability.to_string(),
        group: group.to_string(),
        is_present,
        message,
        slot: slot.to_string(),
    };
}

// Whether `host.<group>.<slot>` is filled, by source names (TS `_isSlotPresent`). An unknown name is
// absent, as a missing property is in the source.
fn is_slot_present(host: &Host, group: &str, slot: &str) -> bool {
    return match (group, slot) {
        ("accessibility", "tree") => host.accessibility.tree.is_some(),
        ("app", "activate") => host.app.activate.is_some(),
        ("app", "activationPolicy") => host.app.activation_policy.is_some(),
        ("app", "allWindowsClosed") => host.app.all_windows_closed.is_some(),
        ("app", "badge") => host.app.badge.is_some(),
        ("app", "dock") => host.app.dock.is_some(),
        ("app", "exit") => host.app.exit.is_some(),
        ("app", "focus") => host.app.focus.is_some(),
        ("app", "hide") => host.app.hide.is_some(),
        ("app", "locale") => host.app.locale.is_some(),
        ("app", "loginItem") => host.app.login_item.is_some(),
        ("app", "loop") => host.app.loop_.is_some(),
        ("app", "name") => host.app.name.is_some(),
        ("app", "nameWrite") => host.app.name_write.is_some(),
        ("app", "openFile") => host.app.open_file.is_some(),
        ("app", "path") => host.app.path.is_some(),
        ("app", "quit") => host.app.quit.is_some(),
        ("app", "quitRequest") => host.app.quit_request.is_some(),
        ("app", "ready") => host.app.ready.is_some(),
        ("app", "recentDocuments") => host.app.recent_documents.is_some(),
        ("app", "relaunch") => host.app.relaunch.is_some(),
        ("app", "secondInstance") => host.app.second_instance.is_some(),
        ("app", "show") => host.app.show.is_some(),
        ("app", "singleInstance") => host.app.single_instance.is_some(),
        ("app", "userModelId") => host.app.user_model_id.is_some(),
        ("app", "version") => host.app.version.is_some(),
        ("audio", "codec") => host.audio.codec.is_some(),
        ("audio", "device") => host.audio.device.is_some(),
        ("audio", "mixer") => host.audio.mixer.is_some(),
        ("audioDecode", "aac") => host.audio_decode.aac.is_some(),
        ("audioDecode", "flac") => host.audio_decode.flac.is_some(),
        ("audioDecode", "mp3") => host.audio_decode.mp3.is_some(),
        ("audioDecode", "mp4") => host.audio_decode.mp4.is_some(),
        ("audioDecode", "ogg") => host.audio_decode.ogg.is_some(),
        ("audioDecode", "wav") => host.audio_decode.wav.is_some(),
        ("audioDecode", "webm") => host.audio_decode.webm.is_some(),
        ("bitmap", "encode") => host.bitmap.encode.is_some(),
        ("bitmap", "readback") => host.bitmap.readback.is_some(),
        ("canvas", "context") => host.canvas.context.is_some(),
        ("clipboard", "bookmark") => host.clipboard.bookmark.is_some(),
        ("clipboard", "change") => host.clipboard.change.is_some(),
        ("clipboard", "formats") => host.clipboard.formats.is_some(),
        ("clipboard", "image") => host.clipboard.image.is_some(),
        ("clipboard", "text") => host.clipboard.text.is_some(),
        ("compress", "deflate") => host.compress.deflate.is_some(),
        ("compress", "lzma") => host.compress.lzma.is_some(),
        ("connectivity", "change") => host.connectivity.change.is_some(),
        ("connectivity", "reachability") => host.connectivity.reachability.is_some(),
        ("connectivity", "status") => host.connectivity.status.is_some(),
        ("decompress", "brotli") => host.decompress.brotli.is_some(),
        ("decompress", "deflate") => host.decompress.deflate.is_some(),
        ("decompress", "lzma") => host.decompress.lzma.is_some(),
        ("device", "info") => host.device.info.is_some(),
        ("dialog", "directoryOpen") => host.dialog.directory_open.is_some(),
        ("dialog", "fileOpen") => host.dialog.file_open.is_some(),
        ("dialog", "fileSave") => host.dialog.file_save.is_some(),
        ("dialog", "imageOpen") => host.dialog.image_open.is_some(),
        ("dialog", "message") => host.dialog.message.is_some(),
        ("dialog", "photoCapture") => host.dialog.photo_capture.is_some(),
        ("dialog", "prompt") => host.dialog.prompt.is_some(),
        ("dialog", "videoCapture") => host.dialog.video_capture.is_some(),
        ("fileSystem", "access") => host.file_system.access.is_some(),
        ("font", "loader") => host.font.loader.is_some(),
        ("fullscreen", "element") => host.fullscreen.element.is_some(),
        ("geolocation", "position") => host.geolocation.position.is_some(),
        ("glyph", "rasterizer") => host.glyph.rasterizer.is_some(),
        ("haptics", "engine") => host.haptics.engine.is_some(),
        ("image", "loader") => host.image.loader.is_some(),
        ("imageDecode", "avif") => host.image_decode.avif.is_some(),
        ("imageDecode", "bmp") => host.image_decode.bmp.is_some(),
        ("imageDecode", "gif") => host.image_decode.gif.is_some(),
        ("imageDecode", "jpeg") => host.image_decode.jpeg.is_some(),
        ("imageDecode", "png") => host.image_decode.png.is_some(),
        ("imageDecode", "webp") => host.image_decode.webp.is_some(),
        ("imageEncode", "jpeg") => host.image_encode.jpeg.is_some(),
        ("imageEncode", "png") => host.image_encode.png.is_some(),
        ("imageEncode", "webp") => host.image_encode.webp.is_some(),
        ("input", "dropFile") => host.input.drop_file.is_some(),
        ("input", "focus") => host.input.focus.is_some(),
        ("input", "ingress") => host.input.ingress.is_some(),
        ("input", "pointerLock") => host.input.pointer_lock.is_some(),
        ("input", "target") => host.input.target.is_some(),
        ("ipc", "handle") => host.ipc.handle.is_some(),
        ("ipc", "invoke") => host.ipc.invoke.is_some(),
        ("ipc", "message") => host.ipc.message.is_some(),
        ("ipc", "send") => host.ipc.send.is_some(),
        ("ipc", "targetedSend") => host.ipc.targeted_send.is_some(),
        ("lifecycle", "state") => host.lifecycle.state.is_some(),
        ("mediaSession", "action") => host.media_session.action.is_some(),
        ("mediaSession", "control") => host.media_session.control.is_some(),
        ("menu", "app") => host.menu.app.is_some(),
        ("menu", "highlight") => host.menu.highlight.is_some(),
        ("menu", "popup") => host.menu.popup.is_some(),
        ("menu", "select") => host.menu.select.is_some(),
        ("midi", "access") => host.midi.access.is_some(),
        ("midi", "permission") => host.midi.permission.is_some(),
        ("net", "http") => host.net.http.is_some(),
        ("notification", "action") => host.notification.action.is_some(),
        ("notification", "activeList") => host.notification.active_list.is_some(),
        ("notification", "click") => host.notification.click.is_some(),
        ("notification", "close") => host.notification.close.is_some(),
        ("notification", "delivery") => host.notification.delivery.is_some(),
        ("notification", "dismiss") => host.notification.dismiss.is_some(),
        ("notification", "lifecycle") => host.notification.lifecycle.is_some(),
        ("notification", "permission") => host.notification.permission.is_some(),
        ("notification", "received") => host.notification.received.is_some(),
        ("notification", "reply") => host.notification.reply.is_some(),
        ("notification", "scheduling") => host.notification.scheduling.is_some(),
        ("permissions", "query") => host.permissions.query.is_some(),
        ("platform", "info") => host.platform.info.is_some(),
        ("power", "batteryHealth") => host.power.battery_health.is_some(),
        ("power", "change") => host.power.change.is_some(),
        ("power", "idle") => host.power.idle.is_some(),
        ("power", "keepAwake") => host.power.keep_awake.is_some(),
        ("power", "sessionLock") => host.power.session_lock.is_some(),
        ("power", "status") => host.power.status.is_some(),
        ("power", "suspension") => host.power.suspension.is_some(),
        ("power", "thermal") => host.power.thermal.is_some(),
        ("preferences", "change") => host.preferences.change.is_some(),
        ("preferences", "local") => host.preferences.local.is_some(),
        ("preferences", "persistenceQuery") => host.preferences.persistence_query.is_some(),
        ("preferences", "persistenceRequest") => host.preferences.persistence_request.is_some(),
        ("protocol", "default") => host.protocol.default.is_some(),
        ("protocol", "launch") => host.protocol.launch.is_some(),
        ("protocol", "open") => host.protocol.open.is_some(),
        ("protocol", "registration") => host.protocol.registration.is_some(),
        ("protocol", "registrationQuery") => host.protocol.registration_query.is_some(),
        ("protocol", "unregistration") => host.protocol.unregistration.is_some(),
        ("screen", "change") => host.screen.change.is_some(),
        ("screen", "details") => host.screen.details.is_some(),
        ("screen", "permissionChange") => host.screen.permission_change.is_some(),
        ("screen", "query") => host.screen.query.is_some(),
        ("sensors", "query") => host.sensors.query.is_some(),
        ("share", "content") => host.share.content.is_some(),
        ("share", "files") => host.share.files.is_some(),
        ("shell", "beep") => host.shell.beep.is_some(),
        ("shell", "external") => host.shell.external.is_some(),
        ("shell", "pathOpen") => host.shell.path_open.is_some(),
        ("shell", "pathReveal") => host.shell.path_reveal.is_some(),
        ("shell", "process") => host.shell.process.is_some(),
        ("shell", "shortcutLink") => host.shell.shortcut_link.is_some(),
        ("shell", "trash") => host.shell.trash.is_some(),
        ("shortcut", "query") => host.shortcut.query.is_some(),
        ("shortcut", "trigger") => host.shortcut.trigger.is_some(),
        ("socket", "connection") => host.socket.connection.is_some(),
        ("softKeyboard", "accessoryBar") => host.soft_keyboard.accessory_bar.is_some(),
        ("softKeyboard", "change") => host.soft_keyboard.change.is_some(),
        ("softKeyboard", "info") => host.soft_keyboard.info.is_some(),
        ("softKeyboard", "resizeModeWrite") => host.soft_keyboard.resize_mode_write.is_some(),
        ("softKeyboard", "scrollAssist") => host.soft_keyboard.scroll_assist.is_some(),
        ("softKeyboard", "style") => host.soft_keyboard.style.is_some(),
        ("softKeyboard", "visibility") => host.soft_keyboard.visibility.is_some(),
        ("statusBar", "change") => host.status_bar.change.is_some(),
        ("statusBar", "color") => host.status_bar.color.is_some(),
        ("statusBar", "info") => host.status_bar.info.is_some(),
        ("statusBar", "overlays") => host.status_bar.overlays.is_some(),
        ("statusBar", "style") => host.status_bar.style.is_some(),
        ("statusBar", "visibility") => host.status_bar.visibility.is_some(),
        ("surface", "display") => host.surface.display.is_some(),
        ("surface", "resize") => host.surface.resize.is_some(),
        ("textSegment", "segmenter") => host.text_segment.segmenter.is_some(),
        ("textShaper", "shaper") => host.text_shaper.shaper.is_some(),
        ("tray", "balloon") => host.tray.balloon.is_some(),
        ("tray", "balloonEvents") => host.tray.balloon_events.is_some(),
        ("tray", "bounds") => host.tray.bounds.is_some(),
        ("tray", "doubleClickPolicy") => host.tray.double_click_policy.is_some(),
        ("tray", "dropEvents") => host.tray.drop_events.is_some(),
        ("tray", "image") => host.tray.image.is_some(),
        ("tray", "interactionEvents") => host.tray.interaction_events.is_some(),
        ("tray", "lifecycle") => host.tray.lifecycle.is_some(),
        ("tray", "menu") => host.tray.menu.is_some(),
        ("tray", "menuSelectionEvents") => host.tray.menu_selection_events.is_some(),
        ("tray", "popupMenu") => host.tray.popup_menu.is_some(),
        ("tray", "pressedImage") => host.tray.pressed_image.is_some(),
        ("tray", "templateImage") => host.tray.template_image.is_some(),
        ("tray", "title") => host.tray.title.is_some(),
        ("tray", "tooltip") => host.tray.tooltip.is_some(),
        ("updater", "command") => host.updater.command.is_some(),
        ("video", "playback") => host.video.playback.is_some(),
        ("window", "appearance") => host.window.appearance.is_some(),
        ("window", "attach") => host.window.attach.is_some(),
        ("window", "attention") => host.window.attention.is_some(),
        ("window", "contentProtection") => host.window.content_protection.is_some(),
        ("window", "focus") => host.window.focus.is_some(),
        ("window", "fullscreen") => host.window.fullscreen.is_some(),
        ("window", "geometry") => host.window.geometry.is_some(),
        ("window", "hierarchy") => host.window.hierarchy.is_some(),
        ("window", "lifecycle") => host.window.lifecycle.is_some(),
        ("window", "progress") => host.window.progress.is_some(),
        ("window", "shadow") => host.window.shadow.is_some(),
        ("window", "shell") => host.window.shell.is_some(),
        ("window", "sizeConstraints") => host.window.size_constraints.is_some(),
        ("window", "state") => host.window.state.is_some(),
        ("window", "visibility") => host.window.visibility.is_some(),
        ("window", "zOrder") => host.window.z_order.is_some(),
        _ => false,
    };
}

// The groups a host carries and their filled slots, in the source property order (TS
// `Object.entries(host)` over each group object). Rust has no reflection, so the table is written out.
fn read_host_groups(out: &mut Vec<HostCapabilityGroupExplanation>, host: &Host) {
    out.clear();
    let mut slots = Vec::new();
    if host.accessibility.tree.is_some() {
        slots.push("tree".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "accessibility".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.app.activate.is_some() {
        slots.push("activate".to_string());
    }
    if host.app.activation_policy.is_some() {
        slots.push("activationPolicy".to_string());
    }
    if host.app.all_windows_closed.is_some() {
        slots.push("allWindowsClosed".to_string());
    }
    if host.app.badge.is_some() {
        slots.push("badge".to_string());
    }
    if host.app.dock.is_some() {
        slots.push("dock".to_string());
    }
    if host.app.exit.is_some() {
        slots.push("exit".to_string());
    }
    if host.app.focus.is_some() {
        slots.push("focus".to_string());
    }
    if host.app.hide.is_some() {
        slots.push("hide".to_string());
    }
    if host.app.locale.is_some() {
        slots.push("locale".to_string());
    }
    if host.app.login_item.is_some() {
        slots.push("loginItem".to_string());
    }
    if host.app.loop_.is_some() {
        slots.push("loop".to_string());
    }
    if host.app.name.is_some() {
        slots.push("name".to_string());
    }
    if host.app.name_write.is_some() {
        slots.push("nameWrite".to_string());
    }
    if host.app.open_file.is_some() {
        slots.push("openFile".to_string());
    }
    if host.app.path.is_some() {
        slots.push("path".to_string());
    }
    if host.app.quit.is_some() {
        slots.push("quit".to_string());
    }
    if host.app.quit_request.is_some() {
        slots.push("quitRequest".to_string());
    }
    if host.app.ready.is_some() {
        slots.push("ready".to_string());
    }
    if host.app.recent_documents.is_some() {
        slots.push("recentDocuments".to_string());
    }
    if host.app.relaunch.is_some() {
        slots.push("relaunch".to_string());
    }
    if host.app.second_instance.is_some() {
        slots.push("secondInstance".to_string());
    }
    if host.app.show.is_some() {
        slots.push("show".to_string());
    }
    if host.app.single_instance.is_some() {
        slots.push("singleInstance".to_string());
    }
    if host.app.user_model_id.is_some() {
        slots.push("userModelId".to_string());
    }
    if host.app.version.is_some() {
        slots.push("version".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "app".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.audio.codec.is_some() {
        slots.push("codec".to_string());
    }
    if host.audio.device.is_some() {
        slots.push("device".to_string());
    }
    if host.audio.mixer.is_some() {
        slots.push("mixer".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "audio".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.audio_decode.aac.is_some() {
        slots.push("aac".to_string());
    }
    if host.audio_decode.flac.is_some() {
        slots.push("flac".to_string());
    }
    if host.audio_decode.mp3.is_some() {
        slots.push("mp3".to_string());
    }
    if host.audio_decode.mp4.is_some() {
        slots.push("mp4".to_string());
    }
    if host.audio_decode.ogg.is_some() {
        slots.push("ogg".to_string());
    }
    if host.audio_decode.wav.is_some() {
        slots.push("wav".to_string());
    }
    if host.audio_decode.webm.is_some() {
        slots.push("webm".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "audioDecode".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.bitmap.encode.is_some() {
        slots.push("encode".to_string());
    }
    if host.bitmap.readback.is_some() {
        slots.push("readback".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "bitmap".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.canvas.context.is_some() {
        slots.push("context".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "canvas".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.clipboard.bookmark.is_some() {
        slots.push("bookmark".to_string());
    }
    if host.clipboard.change.is_some() {
        slots.push("change".to_string());
    }
    if host.clipboard.formats.is_some() {
        slots.push("formats".to_string());
    }
    if host.clipboard.image.is_some() {
        slots.push("image".to_string());
    }
    if host.clipboard.text.is_some() {
        slots.push("text".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "clipboard".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.compress.deflate.is_some() {
        slots.push("deflate".to_string());
    }
    if host.compress.lzma.is_some() {
        slots.push("lzma".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "compress".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.connectivity.change.is_some() {
        slots.push("change".to_string());
    }
    if host.connectivity.reachability.is_some() {
        slots.push("reachability".to_string());
    }
    if host.connectivity.status.is_some() {
        slots.push("status".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "connectivity".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.decompress.brotli.is_some() {
        slots.push("brotli".to_string());
    }
    if host.decompress.deflate.is_some() {
        slots.push("deflate".to_string());
    }
    if host.decompress.lzma.is_some() {
        slots.push("lzma".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "decompress".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.device.info.is_some() {
        slots.push("info".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "device".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.dialog.directory_open.is_some() {
        slots.push("directoryOpen".to_string());
    }
    if host.dialog.file_open.is_some() {
        slots.push("fileOpen".to_string());
    }
    if host.dialog.file_save.is_some() {
        slots.push("fileSave".to_string());
    }
    if host.dialog.image_open.is_some() {
        slots.push("imageOpen".to_string());
    }
    if host.dialog.message.is_some() {
        slots.push("message".to_string());
    }
    if host.dialog.photo_capture.is_some() {
        slots.push("photoCapture".to_string());
    }
    if host.dialog.prompt.is_some() {
        slots.push("prompt".to_string());
    }
    if host.dialog.video_capture.is_some() {
        slots.push("videoCapture".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "dialog".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.file_system.access.is_some() {
        slots.push("access".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "fileSystem".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.font.loader.is_some() {
        slots.push("loader".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "font".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.fullscreen.element.is_some() {
        slots.push("element".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "fullscreen".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.geolocation.position.is_some() {
        slots.push("position".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "geolocation".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.glyph.rasterizer.is_some() {
        slots.push("rasterizer".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "glyph".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.haptics.engine.is_some() {
        slots.push("engine".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "haptics".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.image.loader.is_some() {
        slots.push("loader".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "image".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.image_decode.avif.is_some() {
        slots.push("avif".to_string());
    }
    if host.image_decode.bmp.is_some() {
        slots.push("bmp".to_string());
    }
    if host.image_decode.gif.is_some() {
        slots.push("gif".to_string());
    }
    if host.image_decode.jpeg.is_some() {
        slots.push("jpeg".to_string());
    }
    if host.image_decode.png.is_some() {
        slots.push("png".to_string());
    }
    if host.image_decode.webp.is_some() {
        slots.push("webp".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "imageDecode".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.image_encode.jpeg.is_some() {
        slots.push("jpeg".to_string());
    }
    if host.image_encode.png.is_some() {
        slots.push("png".to_string());
    }
    if host.image_encode.webp.is_some() {
        slots.push("webp".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "imageEncode".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.input.drop_file.is_some() {
        slots.push("dropFile".to_string());
    }
    if host.input.focus.is_some() {
        slots.push("focus".to_string());
    }
    if host.input.ingress.is_some() {
        slots.push("ingress".to_string());
    }
    if host.input.pointer_lock.is_some() {
        slots.push("pointerLock".to_string());
    }
    if host.input.target.is_some() {
        slots.push("target".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "input".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.ipc.handle.is_some() {
        slots.push("handle".to_string());
    }
    if host.ipc.invoke.is_some() {
        slots.push("invoke".to_string());
    }
    if host.ipc.message.is_some() {
        slots.push("message".to_string());
    }
    if host.ipc.send.is_some() {
        slots.push("send".to_string());
    }
    if host.ipc.targeted_send.is_some() {
        slots.push("targetedSend".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "ipc".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.lifecycle.state.is_some() {
        slots.push("state".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "lifecycle".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.media_session.action.is_some() {
        slots.push("action".to_string());
    }
    if host.media_session.control.is_some() {
        slots.push("control".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "mediaSession".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.menu.app.is_some() {
        slots.push("app".to_string());
    }
    if host.menu.highlight.is_some() {
        slots.push("highlight".to_string());
    }
    if host.menu.popup.is_some() {
        slots.push("popup".to_string());
    }
    if host.menu.select.is_some() {
        slots.push("select".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "menu".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.midi.access.is_some() {
        slots.push("access".to_string());
    }
    if host.midi.permission.is_some() {
        slots.push("permission".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "midi".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.net.http.is_some() {
        slots.push("http".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "net".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.notification.action.is_some() {
        slots.push("action".to_string());
    }
    if host.notification.active_list.is_some() {
        slots.push("activeList".to_string());
    }
    if host.notification.click.is_some() {
        slots.push("click".to_string());
    }
    if host.notification.close.is_some() {
        slots.push("close".to_string());
    }
    if host.notification.delivery.is_some() {
        slots.push("delivery".to_string());
    }
    if host.notification.dismiss.is_some() {
        slots.push("dismiss".to_string());
    }
    if host.notification.lifecycle.is_some() {
        slots.push("lifecycle".to_string());
    }
    if host.notification.permission.is_some() {
        slots.push("permission".to_string());
    }
    if host.notification.received.is_some() {
        slots.push("received".to_string());
    }
    if host.notification.reply.is_some() {
        slots.push("reply".to_string());
    }
    if host.notification.scheduling.is_some() {
        slots.push("scheduling".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "notification".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.permissions.query.is_some() {
        slots.push("query".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "permissions".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.platform.info.is_some() {
        slots.push("info".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "platform".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.power.battery_health.is_some() {
        slots.push("batteryHealth".to_string());
    }
    if host.power.change.is_some() {
        slots.push("change".to_string());
    }
    if host.power.idle.is_some() {
        slots.push("idle".to_string());
    }
    if host.power.keep_awake.is_some() {
        slots.push("keepAwake".to_string());
    }
    if host.power.session_lock.is_some() {
        slots.push("sessionLock".to_string());
    }
    if host.power.status.is_some() {
        slots.push("status".to_string());
    }
    if host.power.suspension.is_some() {
        slots.push("suspension".to_string());
    }
    if host.power.thermal.is_some() {
        slots.push("thermal".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "power".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.preferences.change.is_some() {
        slots.push("change".to_string());
    }
    if host.preferences.local.is_some() {
        slots.push("local".to_string());
    }
    if host.preferences.persistence_query.is_some() {
        slots.push("persistenceQuery".to_string());
    }
    if host.preferences.persistence_request.is_some() {
        slots.push("persistenceRequest".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "preferences".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.protocol.default.is_some() {
        slots.push("default".to_string());
    }
    if host.protocol.launch.is_some() {
        slots.push("launch".to_string());
    }
    if host.protocol.open.is_some() {
        slots.push("open".to_string());
    }
    if host.protocol.registration.is_some() {
        slots.push("registration".to_string());
    }
    if host.protocol.registration_query.is_some() {
        slots.push("registrationQuery".to_string());
    }
    if host.protocol.unregistration.is_some() {
        slots.push("unregistration".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "protocol".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.screen.change.is_some() {
        slots.push("change".to_string());
    }
    if host.screen.details.is_some() {
        slots.push("details".to_string());
    }
    if host.screen.permission_change.is_some() {
        slots.push("permissionChange".to_string());
    }
    if host.screen.query.is_some() {
        slots.push("query".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "screen".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.sensors.query.is_some() {
        slots.push("query".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "sensors".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.share.content.is_some() {
        slots.push("content".to_string());
    }
    if host.share.files.is_some() {
        slots.push("files".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "share".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.shell.beep.is_some() {
        slots.push("beep".to_string());
    }
    if host.shell.external.is_some() {
        slots.push("external".to_string());
    }
    if host.shell.path_open.is_some() {
        slots.push("pathOpen".to_string());
    }
    if host.shell.path_reveal.is_some() {
        slots.push("pathReveal".to_string());
    }
    if host.shell.process.is_some() {
        slots.push("process".to_string());
    }
    if host.shell.shortcut_link.is_some() {
        slots.push("shortcutLink".to_string());
    }
    if host.shell.trash.is_some() {
        slots.push("trash".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "shell".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.shortcut.query.is_some() {
        slots.push("query".to_string());
    }
    if host.shortcut.trigger.is_some() {
        slots.push("trigger".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "shortcut".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.socket.connection.is_some() {
        slots.push("connection".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "socket".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.soft_keyboard.accessory_bar.is_some() {
        slots.push("accessoryBar".to_string());
    }
    if host.soft_keyboard.change.is_some() {
        slots.push("change".to_string());
    }
    if host.soft_keyboard.info.is_some() {
        slots.push("info".to_string());
    }
    if host.soft_keyboard.resize_mode_write.is_some() {
        slots.push("resizeModeWrite".to_string());
    }
    if host.soft_keyboard.scroll_assist.is_some() {
        slots.push("scrollAssist".to_string());
    }
    if host.soft_keyboard.style.is_some() {
        slots.push("style".to_string());
    }
    if host.soft_keyboard.visibility.is_some() {
        slots.push("visibility".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "softKeyboard".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.status_bar.change.is_some() {
        slots.push("change".to_string());
    }
    if host.status_bar.color.is_some() {
        slots.push("color".to_string());
    }
    if host.status_bar.info.is_some() {
        slots.push("info".to_string());
    }
    if host.status_bar.overlays.is_some() {
        slots.push("overlays".to_string());
    }
    if host.status_bar.style.is_some() {
        slots.push("style".to_string());
    }
    if host.status_bar.visibility.is_some() {
        slots.push("visibility".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "statusBar".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.surface.display.is_some() {
        slots.push("display".to_string());
    }
    if host.surface.resize.is_some() {
        slots.push("resize".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "surface".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.text_segment.segmenter.is_some() {
        slots.push("segmenter".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "textSegment".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.text_shaper.shaper.is_some() {
        slots.push("shaper".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "textShaper".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.tray.balloon.is_some() {
        slots.push("balloon".to_string());
    }
    if host.tray.balloon_events.is_some() {
        slots.push("balloonEvents".to_string());
    }
    if host.tray.bounds.is_some() {
        slots.push("bounds".to_string());
    }
    if host.tray.double_click_policy.is_some() {
        slots.push("doubleClickPolicy".to_string());
    }
    if host.tray.drop_events.is_some() {
        slots.push("dropEvents".to_string());
    }
    if host.tray.image.is_some() {
        slots.push("image".to_string());
    }
    if host.tray.interaction_events.is_some() {
        slots.push("interactionEvents".to_string());
    }
    if host.tray.lifecycle.is_some() {
        slots.push("lifecycle".to_string());
    }
    if host.tray.menu.is_some() {
        slots.push("menu".to_string());
    }
    if host.tray.menu_selection_events.is_some() {
        slots.push("menuSelectionEvents".to_string());
    }
    if host.tray.popup_menu.is_some() {
        slots.push("popupMenu".to_string());
    }
    if host.tray.pressed_image.is_some() {
        slots.push("pressedImage".to_string());
    }
    if host.tray.template_image.is_some() {
        slots.push("templateImage".to_string());
    }
    if host.tray.title.is_some() {
        slots.push("title".to_string());
    }
    if host.tray.tooltip.is_some() {
        slots.push("tooltip".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "tray".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.updater.command.is_some() {
        slots.push("command".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "updater".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.video.playback.is_some() {
        slots.push("playback".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "video".to_string(),
        slots,
    });
    let mut slots = Vec::new();
    if host.window.appearance.is_some() {
        slots.push("appearance".to_string());
    }
    if host.window.attach.is_some() {
        slots.push("attach".to_string());
    }
    if host.window.attention.is_some() {
        slots.push("attention".to_string());
    }
    if host.window.content_protection.is_some() {
        slots.push("contentProtection".to_string());
    }
    if host.window.focus.is_some() {
        slots.push("focus".to_string());
    }
    if host.window.fullscreen.is_some() {
        slots.push("fullscreen".to_string());
    }
    if host.window.geometry.is_some() {
        slots.push("geometry".to_string());
    }
    if host.window.hierarchy.is_some() {
        slots.push("hierarchy".to_string());
    }
    if host.window.lifecycle.is_some() {
        slots.push("lifecycle".to_string());
    }
    if host.window.progress.is_some() {
        slots.push("progress".to_string());
    }
    if host.window.shadow.is_some() {
        slots.push("shadow".to_string());
    }
    if host.window.shell.is_some() {
        slots.push("shell".to_string());
    }
    if host.window.size_constraints.is_some() {
        slots.push("sizeConstraints".to_string());
    }
    if host.window.state.is_some() {
        slots.push("state".to_string());
    }
    if host.window.visibility.is_some() {
        slots.push("visibility".to_string());
    }
    if host.window.z_order.is_some() {
        slots.push("zOrder".to_string());
    }
    out.push(HostCapabilityGroupExplanation {
        group: "window".to_string(),
        slots,
    });
}
