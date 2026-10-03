/**
 * @zegadb/stdio
 *
 * Terminal output formatting for zega tools: consistent lines for errors,
 * warnings, status, next steps, and an ASCII banner.
 *
 * This package only formats text and prints it to the terminal. It reads and
 * writes no files, makes no network calls and has no configuration. Colour is
 * on only when the terminal supports it, and is off for NO_COLOR and for
 * output that is not a terminal.
 *
 * Streams, as in the Rust crate: anything a script would treat as a problem
 * (error, warn, fail, diagnostic, fatal) goes to stderr; everything else (log,
 * info, success, status, hint, detail, next steps, banners) goes to stdout.
 *
 * Format: [action] value
 * - Cyan brackets for identifiers
 * - Green dot for success, red dot for failure
 * - Red text for errors, yellow for warnings
 */

import chalk, { chalkStderr, Chalk, type ChalkInstance } from 'chalk'
import figlet from 'figlet'

import { TERRACE_FONT } from './font.js'

// Zega green, the accent of zega.dev in dark mode.
const ZEGA_GREEN = '#3CCB77'

// Never emits colour; used when NO_COLOR is set.
const plain = new Chalk({ level: 0 })

/**
 * The chalk to paint with right now, for a line going to stdout or stderr.
 * chalk detects whether that stream is a colour-capable terminal (a non-terminal
 * gets no colour); NO_COLOR (https://no-color.org: set and not empty) switches
 * colour off on top of that.
 */
function ink(stream: 'out' | 'err' = 'out'): ChalkInstance {
  if (process.env.NO_COLOR) return plain
  return stream === 'err' ? chalkStderr : chalk
}

/**
 * Write one line to stderr. process.stderr.write rather than console.error,
 * because Bun's console.error adds its own red when colour is forced.
 */
function problem(line: string): void {
  process.stderr.write(`${line}\n`)
}

function green(text: string): string {
  return ink().hex(ZEGA_GREEN)(text)
}

const FONT = 'Terrace'
let fontLoaded = false

/**
 * Generate ASCII art in the Terrace font, in zega green and bold when colour
 * is supported, plain otherwise. The font is the same file the Rust crate
 * uses, so both draw the same glyphs. No leading or trailing blank lines.
 *
 * @example
 * console.log(ascii('my app'))
 */
export function ascii(text: string): string {
  if (!fontLoaded) {
    figlet.parseFont(FONT, TERRACE_FONT)
    fontLoaded = true
  }
  // The font's top rows are blank padding: drop them, keep the glyph rows.
  const art = figlet
    .textSync(text, { font: FONT })
    .replace(/^(?:[ \t]*\n)+/, '')
    .trimEnd()
  return ink().bold(green(art))
}

// The zega logo: four fixed glyphs (z, e, g, a), five rows of block characters,
// drawn in two tones: ▐ is the shaded left edge of a stroke, █ the body. It is
// hand-encoded art, not rendered from a font file, so it cannot draw other text.
const LOGO_ROWS = [
  '▐██████▐██████▐██████▐██████',
  '   ▐██ ▐██    ▐██    ▐██ ▐██',
  '  ▐██  ▐████  ▐██ ▐██▐██████',
  ' ▐██   ▐██    ▐██  ▐█▐██ ▐██',
  '▐██████▐██████▐██████▐██ ▐██',
]

// The logo's two greens, as true colour: the 16-colour VGA green and bright green.
const LOGO_MAIN = '#55FF55'
const LOGO_SHADE = '#00AA00'

/**
 * The zega logo as text: five rows of blocks in two greens ({@link LOGO_MAIN}
 * for the body, {@link LOGO_SHADE} for the shaded edges). True colour where the
 * terminal has it, otherwise ANSI bright green and green (92 and 32), and plain
 * blocks when colour is off (NO_COLOR, or output that is not a terminal).
 */
export function logo(): string {
  const c = ink()
  const trueColor = c.level >= 3
  const main = trueColor ? c.hex(LOGO_MAIN) : c.greenBright
  const shade = trueColor ? c.hex(LOGO_SHADE) : c.green
  return LOGO_ROWS.map((row) =>
    row.replace(/█+|▐+/g, (run) => (run.startsWith('█') ? main(run) : shade(run))),
  ).join('\n')
}

/**
 * Print the zega logo.
 */
export function banner(): void {
  console.log(logo())
}

export interface BannerEntry {
  /** Name shown in bold, followed by a colon: `Local` prints `Local:`. */
  label: string
  /** Address, shown in cyan. */
  url?: string
  /** State in parentheses after the address, or on its own when there is no address: `stopped` prints `(stopped)`. */
  status?: string
  /** A dimmed line under the entry, e.g. how to start it. */
  hint?: string
  /** Show the whole entry dimmed (a secondary address). An entry with no `url` is always dimmed. */
  dim?: boolean
}

export interface StartBannerOptions {
  /** Drawn in the Terrace font, e.g. `my app`. Leave out for the zega logo. */
  title?: string
  /** One grey line under the logo. */
  tagline?: string
  /** What is running where, one line each, labels aligned. */
  urls: BannerEntry[]
  /** Prints `press <key> to <action>` at the bottom. */
  hint?: { key: string; action: string }
  /** Clear the terminal first. Off unless asked for, and ignored when stdout is not a terminal. */
  clear?: boolean
}

const RULE = '━'.repeat(50)
const CLEAR_SCREEN = '\x1b[2J\x1b[H'

/**
 * Print a server start-up banner, in the style of Vite's:
 *
 * ```
 *
 * <the zega logo, or an ASCII title>
 *
 *   tagline
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   ➜  Local:    http://localhost:5173/
 *   ➜  Explorer: (stopped)
 *      zega start --explorer
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *   press h to show help
 * ```
 */
export function startBanner(options: StartBannerOptions): void {
  const c = ink()
  const { title, tagline, urls, hint, clear = false } = options

  if (clear && process.stdout.isTTY) {
    process.stdout.write(CLEAR_SCREEN)
  }

  const labelWidth = Math.max(0, ...urls.map((entry) => entry.label.length + 1)) + 1

  const lines: string[] = ['', title === undefined ? logo() : ascii(title), '']
  if (tagline !== undefined) {
    lines.push(c.gray(`  ${tagline}`), '')
  }
  lines.push(c.gray(RULE), '')

  for (const entry of urls) {
    const dim = entry.dim === true
    const quiet = dim || entry.url === undefined
    const arrow = quiet ? c.dim('➜') : green('➜')
    const name = `${entry.label}:`.padEnd(labelWidth)
    const label = dim ? c.dim(name) : c.bold(name)
    const parts: string[] = []
    if (entry.url !== undefined) {
      parts.push(dim ? c.dim(entry.url) : c.cyan(entry.url))
    }
    if (entry.status !== undefined) {
      parts.push(dim ? c.dim(`(${entry.status})`) : c.gray(`(${entry.status})`))
    }
    lines.push(`  ${arrow}  ${label}${parts.join(' ')}`.trimEnd())
    if (entry.hint !== undefined) {
      lines.push(`     ${c.dim(entry.hint)}`)
    }
  }

  lines.push('', c.gray(RULE), '')
  if (hint !== undefined) {
    lines.push(`  ${c.gray('press')} ${c.bold(hint.key)} ${c.gray(`to ${hint.action}`)}`, '')
  }

  console.log(lines.join('\n'))
}

/**
 * Log an action with a value
 * [action] value
 */
export function log(action: string, value: string): void {
  console.log(`${ink().cyan(`[${action}]`)} ${value}`)
}

/**
 * Log an error
 * [action] message (cyan bracket, red message)
 */
export function error(action: string, message: string): void {
  const c = ink('err')
  problem(`${c.cyan(`[${action}]`)} ${c.red(message)}`)
}

/**
 * Log a warning
 * ● [name] message - if message provided
 * ● message - if only one arg
 */
export function warn(name: string, message?: string): void {
  const c = ink('err')
  if (message !== undefined) {
    problem(`${c.yellow('●')} ${c.cyan(`[${name}]`)} ${message}`)
  } else {
    problem(`${c.yellow('●')} ${name}`)
  }
}

/**
 * Log a status line with indicator
 * ● [name] message (dot indicates status)
 */
export function status(name: string, message: string, ok: boolean): void {
  const c = ink()
  const dot = ok ? c.green('●') : c.red('○')
  console.log(`${dot} ${c.cyan(`[${name}]`)} ${ok ? c.gray(message) : c.red(message)}`)
}

/**
 * Print a section header
 */
export function header(title: string): void {
  const c = ink()
  console.log()
  console.log(c.bold(title))
  console.log(c.gray('─'.repeat(40)))
}

/**
 * Print a blank line
 */
export function blank(): void {
  console.log()
}

/**
 * Success message
 * ✓ message
 */
export function success(message: string): void {
  console.log(`${ink().green('✓')} ${message}`)
}

/**
 * Failure message
 * ✗ message
 */
export function fail(message: string): void {
  problem(`${ink('err').red('✗')} ${message}`)
}

/**
 * Info line with label
 * label     value
 */
export function info(label: string, value: string): void {
  console.log(`  ${label.padEnd(10)} ${ink().cyan(value)}`)
}

/**
 * Hint in gray
 */
export function hint(message: string): void {
  console.log(ink().gray(`  ${message}`))
}

/**
 * Detail line with arrow
 */
export function detail(message: string): void {
  console.log(`    ${ink().gray('→')} ${message}`)
}

/**
 * Fatal error - logs and exits
 */
export function fatal(action: string, message: string): never {
  error(action, message)
  return process.exit(1)
}

/**
 * Suggest a next step
 *   → description: command
 */
export function nextStep(description: string, command: string): void {
  const c = ink()
  console.log(`  ${c.gray('→')} ${description}: ${c.cyan(command)}`)
}

/**
 * Suggest multiple next steps
 */
export function nextSteps(steps: Array<{ description: string; command: string }>): void {
  for (const step of steps) {
    nextStep(step.description, step.command)
  }
}

/**
 * Diagnostic warning - yellow indicator with issue description
 * ⚠ [component] message
 */
export function diagnostic(component: string, message: string): void {
  const c = ink('err')
  problem(`${c.yellow('⚠')} ${c.cyan(`[${component}]`)} ${c.yellow(message)}`)
}

// Namespace export for cleaner imports
export const out = {
  ascii,
  logo,
  banner,
  startBanner,
  log,
  error,
  warn,
  status,
  header,
  blank,
  success,
  fail,
  info,
  hint,
  detail,
  fatal,
  nextStep,
  nextSteps,
  diagnostic,
}

// Default export
export default out
