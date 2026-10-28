//! flight-compiler: target-native
//!
//! The console write is a host API: natively stdout/stderr, in TS `console[method]`. Everything the
//! sink formats stays in the generated log module; only the write itself is target-native.

use std::io::{self, Write};
use std::sync::Arc;

use crate::log::{
    LogEntry, LogFormatter, LogLevel, LogSink, LogStateRef, TextLogFormatterOptions,
    create_text_log_formatter,
};

#[cfg(test)]
mod console_tests {
    use super::*;
    use std::sync::Mutex;

    use crate::log::{LogData, create_log_state};

    fn entry(level: LogLevel, channel: Option<&str>, data: &str) -> LogEntry {
        return LogEntry {
            level,
            channel: channel.map(|channel| channel.to_string()),
            data: LogData::Message(data.to_string()),
            timestamp_ms: 0.0,
        };
    }

    // The test hook (Principal 2d987bb9): the sink's console write is captured here instead of on
    // the real stdout and stderr, as the console method it routes to.
    fn written(entry: &LogEntry, formatter: &LogFormatter) -> Vec<(ConsoleMethod, String)> {
        let lines = Mutex::new(Vec::new());
        write_console_log_entry(entry, formatter, &|level, text| {
            lines
                .lock()
                .unwrap()
                .push((console_method(level), text.to_string()));
        });
        return lines.into_inner().unwrap();
    }

    // log.test.ts: "writes the formatted entry to the console method matching its level".
    #[test]
    fn writes_the_formatted_entry_to_the_console_method_matching_its_level() {
        let formatter: LogFormatter = Arc::new(|_entry: &LogEntry| "formatted warning".to_string());
        assert_eq!(
            written(
                &entry(LogLevel::Warn, Some("render"), "ignored"),
                &formatter
            ),
            vec![(ConsoleMethod::Warn, "formatted warning".to_string())]
        );
    }

    // log.test.ts: "uses a level-prefixed text formatter by default".
    #[test]
    fn uses_a_level_prefixed_text_formatter_by_default() {
        let state: LogStateRef = Arc::new(std::sync::RwLock::new(create_log_state()));
        let formatter = default_console_log_formatter(&state);
        assert_eq!(
            written(&entry(LogLevel::Error, None, "failed"), &formatter),
            vec![(ConsoleMethod::Error, "error [flight] failed".to_string())]
        );
    }

    // The source `_consoleMethods` table: None and Verbose use `log`.
    #[test]
    fn routes_every_level_to_its_source_console_method() {
        assert_eq!(console_method(LogLevel::None), ConsoleMethod::Log);
        assert_eq!(console_method(LogLevel::Error), ConsoleMethod::Error);
        assert_eq!(console_method(LogLevel::Warn), ConsoleMethod::Warn);
        assert_eq!(console_method(LogLevel::Info), ConsoleMethod::Info);
        assert_eq!(console_method(LogLevel::Debug), ConsoleMethod::Debug);
        assert_eq!(console_method(LogLevel::Verbose), ConsoleMethod::Log);
    }
}

/// Options for create_console_log_sink (TS `{ formatter?: LogFormatter }`).
#[derive(Clone, Default)]
pub struct ConsoleLogSinkOptions {
    pub formatter: Option<LogFormatter>,
}

// The console method an entry is written with (TS `_consoleMethods`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ConsoleMethod {
    Debug,
    Error,
    Info,
    Log,
    Warn,
}

/// Creates a sink that writes each entry, formatted, to the console method matching its level (TS
/// `createConsoleLogSink`): Error to `error`, Warn to `warn`, Info to `info`, Debug to `debug`, and
/// None and Verbose to `log`. The default formatter is the level-prefixed text formatter. The console
/// is a language-runtime built-in (Principal 2d987bb9), written through `write_console`. There is no
/// console-level threshold here; that belongs to the capture sink.
// flight-lint: allow(conform-params) D5: caller-owned LogState for the default text formatter replaces the hidden singleton
pub fn create_console_log_sink(
    state: &LogStateRef,
    options: Option<&ConsoleLogSinkOptions>,
) -> LogSink {
    let formatter = options
        .and_then(|options| options.formatter.clone())
        .unwrap_or_else(|| default_console_log_formatter(state));
    return Arc::new(move |entry: &LogEntry| {
        write_console_log_entry(entry, &formatter, &write_console);
    });
}

// The source `_consoleMethods` table: the console method an entry of `level` is written with.
fn console_method(level: LogLevel) -> ConsoleMethod {
    return match level {
        LogLevel::None => ConsoleMethod::Log,
        LogLevel::Error => ConsoleMethod::Error,
        LogLevel::Warn => ConsoleMethod::Warn,
        LogLevel::Info => ConsoleMethod::Info,
        LogLevel::Debug => ConsoleMethod::Debug,
        LogLevel::Verbose => ConsoleMethod::Log,
    };
}

// The console sink's default formatter (TS `createTextLogFormatter({ levelPrefix: true })`).
fn default_console_log_formatter(state: &LogStateRef) -> LogFormatter {
    return create_text_log_formatter(
        state,
        Some(&TextLogFormatterOptions {
            indent_groups: None,
            level_prefix: Some(true),
            timestamp: None,
        }),
    );
}

// The console vocabulary operation `write_console(level, text)` (ir-vocabulary; Principal 2d987bb9):
// the console is a language-runtime built-in, and this is the SDK's single sanctioned print site.
// Natively the `log`, `info` and `debug` methods write stdout and `warn` and `error` write stderr; TS
// lowers it to `console[method](text)`. An I/O error on the stream is ignored, as any native console
// write's would be.
fn write_console(level: LogLevel, text: &str) {
    let _ = match console_method(level) {
        ConsoleMethod::Error | ConsoleMethod::Warn => writeln!(io::stderr().lock(), "{}", text),
        ConsoleMethod::Debug | ConsoleMethod::Info | ConsoleMethod::Log => {
            writeln!(io::stdout().lock(), "{}", text)
        }
    };
}

// The source `_writeConsoleLogEntry`: formats the entry, then writes it at its level. `write` is
// `write_console`, or the test hook. No lock is held while the formatter or the write runs.
fn write_console_log_entry(
    entry: &LogEntry,
    formatter: &LogFormatter,
    write: &dyn Fn(LogLevel, &str),
) {
    let line = formatter(entry);
    write(entry.level, &line);
}
