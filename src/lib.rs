//! # stdio
//!
//! Terminal output formatting for zega tools.
//! Consistent formatting across CLI, services, and tools.
//!
//! ## Format
//!
//! ```text
//! [action] message
//! ```
//!
//! ## Usage
//!
//! ```rust
//! use stdio::{log, error, warn, success, fail};
//!
//! log("build", "compiling contract...");
//! success("build complete");
//! error("build", "compilation failed");
//! ```
//!

use std::collections::HashMap;
#[cfg(target_arch = "wasm32")]
use std::sync::{Mutex, OnceLock};

mod terrace_font;

#[cfg(target_arch = "wasm32")]
static CAPTURED_OUTPUT: OnceLock<Mutex<Option<String>>> = OnceLock::new();

const BRAND_ORANGE: &str = "\x1b[38;2;224;140;11m";
const BOLD: &str = "\x1b[1m";
const RESET: &str = "\x1b[0m";

// ============================================================
// Line builders — pure formatting, no side effects, unit-testable.
// ============================================================

fn status_line(name: &str, message: &str, ok: bool) -> String {
    let tag = if ok { "ok" } else { "fail" };
    format!("[{}] [{}] {}", tag, name, message)
}

fn info_line(label: &str, value: &str) -> String {
    format!("  {:<10} {}", label, value)
}

fn next_step_line(description: &str, command: &str) -> String {
    format!("  -> {}: {}", description, command)
}

// ============================================================
// Emit core — every formatting call funnels through here.
// ============================================================

/// Emit one line to stderr.
///
/// `display` is the human-formatted line. The (level, component, action, msg)
/// tuple is carried so callers describe *what happened* rather than only how it
/// should look; nothing consumes it yet. Stdout belongs to the program being
/// run, so all output here goes to stderr.
fn emit_structured(level: &str, component: &str, action: &str, msg: &str, display: &str) {
    let _ = (level, component, action, msg);
    #[cfg(target_arch = "wasm32")]
    {
        if let Some(lock) = CAPTURED_OUTPUT.get() {
            if let Ok(mut guard) = lock.lock() {
                if let Some(buf) = guard.as_mut() {
                    buf.push_str(display);
                    buf.push('\n');
                    return;
                }
            }
        }
    }
    eprintln!("{}", display);
}

/// Emit a raw (already-formatted) line with no structured metadata beyond the
/// default component/action.
fn emit_line(line: &str) {
    emit_structured("info", "stdio", "raw", line, line);
}

/// Start capturing output into an in-memory buffer instead of stderr.
///
/// Only available on wasm32, where there is no stderr to write to; embedders
/// use it to collect formatter output in memory. Every line emitted through
/// this crate is appended to the buffer until [`end_capture`] is called.
#[cfg(target_arch = "wasm32")]
pub fn begin_capture() {
    let lock = CAPTURED_OUTPUT.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = lock.lock() {
        *guard = Some(String::new());
    }
}

/// Stop capturing and return everything emitted since [`begin_capture`].
///
/// Returns an empty string if capture was never started.
#[cfg(target_arch = "wasm32")]
pub fn end_capture() -> String {
    let lock = CAPTURED_OUTPUT.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = lock.lock() {
        return guard.take().unwrap_or_default();
    }
    String::new()
}

// ============================================================
// Core logging functions
// ============================================================

/// Log an action with a message
/// Format: `[action] message`
///
/// # Example
/// ```
/// stdio::log("build", "compiling contract...");
/// // Output: [build] compiling contract...
/// ```
pub fn log(action: &str, message: &str) {
    emit_structured(
        "info",
        action,
        action,
        message,
        &format!("[{}] {}", action, message),
    );
}

/// Log an error
/// Format: `[action] message`
///
/// # Example
/// ```
/// stdio::error("build", "compilation failed");
/// // Output: [build] compilation failed
/// ```
pub fn error(action: &str, message: &str) {
    emit_structured(
        "error",
        action,
        action,
        message,
        &format!("[{}] {}", action, message),
    );
}

/// Log a warning
/// Format: `[warn] message` or `[name] message`
///
/// # Example
/// ```
/// stdio::warn("cache", "stale entries detected");
/// // Output: [warn] [cache] stale entries detected
/// ```
pub fn warn(name: &str, message: &str) {
    emit_structured(
        "warn",
        name,
        "warn",
        message,
        &format!("[warn] [{}] {}", name, message),
    );
}

/// Log a simple warning without component name
/// Format: `[warn] message`
pub fn warn_simple(message: &str) {
    emit_structured(
        "warn",
        "stdio",
        "warn",
        message,
        &format!("[warn] {}", message),
    );
}

/// Log a status line with success/failure indicator
/// Format: `[ok] message` or `[fail] message`
///
/// # Example
/// ```
/// stdio::status("database", "connected", true);
/// // Output: [ok] [database] connected
/// ```
pub fn status(name: &str, message: &str, ok: bool) {
    let action = if ok { "ok" } else { "fail" };
    emit_structured(
        "status",
        name,
        action,
        message,
        &status_line(name, message, ok),
    );
}

/// Print a section header
///
/// # Example
/// ```
/// stdio::header("configuration");
/// // Output:
/// //
/// // configuration
/// // ----------------------------------------
/// ```
pub fn header(title: &str) {
    emit_line("");
    emit_line(title);
    emit_line(&"-".repeat(40));
}

/// Print a blank line
pub fn blank() {
    emit_line("");
}

/// Success message
/// Format: `[ok] message`
///
/// # Example
/// ```
/// stdio::success("build complete");
/// // Output: [ok] build complete
/// ```
pub fn success(message: &str) {
    emit_structured(
        "status",
        "stdio",
        "ok",
        message,
        &format!("[ok] {}", message),
    );
}

/// Failure message
/// Format: `[fail] message`
///
/// # Example
/// ```
/// stdio::fail("build failed");
/// // Output: [fail] build failed
/// ```
pub fn fail(message: &str) {
    emit_structured(
        "error",
        "stdio",
        "fail",
        message,
        &format!("[fail] {}", message),
    );
}

/// Info line with label
/// Format: `  label     value`
///
/// # Example
/// ```
/// stdio::info("port", "8506");
/// // Output:   port       8506
/// ```
pub fn info(label: &str, value: &str) {
    emit_structured("info", label, "info", value, &info_line(label, value));
}

/// Hint in subdued format
/// Format: `  message`
pub fn hint(message: &str) {
    emit_line(&format!("  {}", message));
}

/// Detail line with arrow
/// Format: `    -> message`
pub fn detail(message: &str) {
    emit_line(&format!("    -> {}", message));
}

/// Suggest a next step
/// Format: `  -> description: command`
///
/// # Example
/// ```
/// stdio::next_step("start the server", "npm run dev");
/// // Output:   -> start the server: npm run dev
/// ```
pub fn next_step(description: &str, command: &str) {
    emit_line(&next_step_line(description, command));
}

/// Diagnostic warning
/// Format: `[warn] [component] message`
pub fn diagnostic(component: &str, message: &str) {
    emit_structured(
        "warn",
        component,
        "diagnostic",
        message,
        &format!("[warn] [{}] {}", component, message),
    );
}

/// Print a raw line (no extra formatting).
pub fn raw(message: &str) {
    emit_line(message);
}

/// Advisory note (severity vocabulary: `[error]` / `[warning]` / `[note]`).
/// Notes are for situations, not failures — a supported path that works
/// correctly but deserves a nudge (e.g. "no config file found"). Like every
/// other line here this goes to stderr; stdout belongs to the program.
/// Format: `[note] message`
pub fn note(message: &str) {
    emit_structured(
        "note",
        "stdio",
        "note",
        message,
        &format!("[note] {}", message),
    );
}

// ============================================================
// ASCII art (Terrace figlet font)
// ============================================================

/// Generate ASCII art banner in brand style using the Terrace font.
///
/// Returns the rendered banner wrapped in the brand color and bold escape
/// sequences; pass it to [`raw`] or print it yourself.
pub fn ascii(text: &str) -> String {
    let font = FigFont::parse(terrace_font::TERRACE_FONT);
    let art = font
        .render(text)
        .unwrap_or_else(|| text.to_string())
        .trim_end()
        .to_string();
    format!("{BRAND_ORANGE}{BOLD}{art}{RESET}")
}

struct FigFont {
    height: usize,
    glyphs: HashMap<char, Vec<String>>,
}

impl FigFont {
    fn parse(source: &str) -> Self {
        let mut lines = source.lines();
        let header = lines.next().unwrap_or_default();
        let mut header_parts = header.split_whitespace();
        let signature = header_parts.next().unwrap_or_default();
        let hardblank = signature.chars().last().unwrap_or('$');
        let height = header_parts
            .next()
            .and_then(|part| part.parse::<usize>().ok())
            .unwrap_or(1);
        let comment_lines = header_parts
            .nth(3)
            .and_then(|part| part.parse::<usize>().ok())
            .unwrap_or(0);

        for _ in 0..comment_lines {
            lines.next();
        }

        let mut glyphs = HashMap::new();
        let mut endmark = '@';
        for codepoint in 32u8..=126u8 {
            let mut glyph = Vec::with_capacity(height);
            for i in 0..height {
                if let Some(line) = lines.next() {
                    let mut line = line.trim_end_matches('\r').to_string();
                    if i == 0 && !line.is_empty() {
                        if let Some(last) = line.chars().last() {
                            endmark = last;
                        }
                    }
                    while line.ends_with(endmark) {
                        line.pop();
                    }
                    if hardblank != ' ' {
                        line = line.replace(hardblank, " ");
                    }
                    glyph.push(line);
                } else {
                    glyph.push(String::new());
                }
            }
            glyphs.insert(codepoint as char, glyph);
        }

        Self { height, glyphs }
    }

    fn render(&self, text: &str) -> Option<String> {
        let mut lines = vec![String::new(); self.height];
        for ch in text.chars() {
            let glyph = self.glyphs.get(&ch).or_else(|| self.glyphs.get(&'?'));
            let glyph = glyph?;
            for (idx, line) in lines.iter_mut().enumerate() {
                if let Some(part) = glyph.get(idx) {
                    line.push_str(part);
                }
            }
        }
        Some(lines.join("\n"))
    }
}

// ============================================================
// Macros for convenient formatting
// ============================================================

/// Log with format string support
///
/// # Example
/// ```
/// stdio::logf!("build", "compiled {} files in {}ms", 42, 150);
/// ```
#[macro_export]
macro_rules! logf {
    ($action:expr, $($arg:tt)*) => {
        $crate::log($action, &format!($($arg)*));
    };
}

/// Error with format string support
#[macro_export]
macro_rules! errorf {
    ($action:expr, $($arg:tt)*) => {
        $crate::error($action, &format!($($arg)*));
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_renders_both_outcomes() {
        assert_eq!(
            status_line("database", "connected", true),
            "[ok] [database] connected"
        );
        assert_eq!(
            status_line("database", "refused", false),
            "[fail] [database] refused"
        );
    }

    #[test]
    fn info_pads_the_label_to_a_fixed_column() {
        assert_eq!(info_line("port", "8506"), "  port       8506");
        assert_eq!(info_line("a-very-long-label", "x"), "  a-very-long-label x");
    }

    #[test]
    fn next_step_renders_description_and_command() {
        assert_eq!(
            next_step_line("deploy it", "deka build"),
            "  -> deploy it: deka build"
        );
    }

    #[test]
    fn ascii_wraps_rendered_banner_in_brand_escapes() {
        let art = ascii("deka");
        assert!(art.starts_with(BRAND_ORANGE));
        assert!(art.ends_with(RESET));
        assert!(art.contains('\n'));
    }

    #[test]
    fn figfont_replaces_unknown_chars_with_fallback() {
        let font = FigFont::parse(terrace_font::TERRACE_FONT);
        let rendered = font.render("a~b").expect("render");
        assert_eq!(rendered.lines().count(), font.height);
    }
}
