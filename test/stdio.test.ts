import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import chalk, { chalkStderr } from 'chalk'

import out, {
  ascii,
  banner,
  logo,
  blank,
  detail,
  diagnostic,
  error,
  fail,
  fatal,
  header,
  hint,
  info,
  log,
  nextStep,
  nextSteps,
  startBanner,
  status,
  success,
  warn,
} from '../src/index.ts'

// What `ascii('zega')` draws, without colour: the Terrace font, shared with the Rust crate.
const ZEGA = [
  '░█████████  ░███████   ░████████  ░██████   ',
  '     ░███  ░██    ░██ ░██    ░██       ░██  ',
  '   ░███    ░█████████ ░██    ░██  ░███████  ',
  ' ░███      ░██        ░██   ░███ ░██   ░██  ',
  '░█████████  ░███████   ░█████░██  ░█████░██ ',
  '                             ░██            ',
  '                       ░███████',
]

// What `logo()` draws, without colour: four fixed glyphs, five rows, two tones (▐ edge, █ body).
const LOGO = [
  '▐██████▐██████▐██████▐██████',
  '   ▐██ ▐██    ▐██    ▐██ ▐██',
  '  ▐██  ▐████  ▐██ ▐██▐██████',
  ' ▐██   ▐██    ▐██  ▐█▐██ ▐██',
  '▐██████▐██████▐██████▐██ ▐██',
]

const RULE = '━'.repeat(50)
const ESC = '\x1b'

const savedNoColor = process.env.NO_COLOR
const savedLevel = chalk.level
const savedErrLevel = chalkStderr.level

/** Run `fn` and return what it passed to console.log (stdout) and process.stderr.write (stderr), one entry per call. */
function captured(fn: () => void): { out: string[]; err: string[] } {
  const log = spyOn(console, 'log').mockImplementation(() => {})
  const err = spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    fn()
    return {
      out: log.mock.calls.map((args) => args.join(' ')),
      err: err.mock.calls.map((args) => String(args[0]).replace(/\n$/, '')),
    }
  } finally {
    log.mockRestore()
    err.mockRestore()
  }
}

/** The stdout lines of `fn`; fails if it also wrote to stderr. */
function printed(fn: () => void): string[] {
  const { out, err } = captured(fn)
  expect(err).toEqual([])
  return out
}

/** The stderr lines of `fn`; fails if it also wrote to stdout. */
function printedErr(fn: () => void): string[] {
  const { out, err } = captured(fn)
  expect(out).toEqual([])
  return err
}

beforeEach(() => {
  delete process.env.NO_COLOR
  chalk.level = 0
  chalkStderr.level = 0
})

afterEach(() => {
  if (savedNoColor === undefined) delete process.env.NO_COLOR
  else process.env.NO_COLOR = savedNoColor
  chalk.level = savedLevel
  chalkStderr.level = savedErrLevel
})

describe('lines, without colour', () => {
  test('log', () => {
    expect(printed(() => log('build', 'compiling'))).toEqual(['[build] compiling'])
  })

  test('error', () => {
    expect(printedErr(() => error('build', 'compilation failed'))).toEqual(['[build] compilation failed'])
  })

  test('warn with a name and with a message only', () => {
    expect(printedErr(() => warn('cache', 'stale entries'))).toEqual(['● [cache] stale entries'])
    expect(printedErr(() => warn('disk is almost full'))).toEqual(['● disk is almost full'])
  })

  test('status', () => {
    expect(printed(() => status('database', 'connected', true))).toEqual(['● [database] connected'])
    expect(printed(() => status('database', 'refused', false))).toEqual(['○ [database] refused'])
  })

  test('header', () => {
    expect(printed(() => header('configuration'))).toEqual(['', 'configuration', '─'.repeat(40)])
  })

  test('blank', () => {
    expect(printed(() => blank())).toEqual([''])
  })

  test('success and fail', () => {
    expect(printed(() => success('build complete'))).toEqual(['✓ build complete'])
    expect(printedErr(() => fail('build failed'))).toEqual(['✗ build failed'])
  })

  test('info pads the label to a fixed column', () => {
    expect(printed(() => info('port', '8506'))).toEqual(['  port       8506'])
    expect(printed(() => info('a-very-long-label', 'x'))).toEqual(['  a-very-long-label x'])
  })

  test('hint and detail', () => {
    expect(printed(() => hint('try again'))).toEqual(['  try again'])
    expect(printed(() => detail('see the log'))).toEqual(['    → see the log'])
  })

  test('nextStep and nextSteps', () => {
    expect(printed(() => nextStep('start the server', 'npx zega dev'))).toEqual([
      '  → start the server: npx zega dev',
    ])
    expect(
      printed(() =>
        nextSteps([
          { description: 'start the server', command: 'npx zega dev' },
          { description: 'open the explorer', command: 'npx zega explorer' },
        ]),
      ),
    ).toEqual(['  → start the server: npx zega dev', '  → open the explorer: npx zega explorer'])
  })

  test('diagnostic', () => {
    expect(printedErr(() => diagnostic('config', 'unknown key "colour"'))).toEqual([
      '⚠ [config] unknown key "colour"',
    ])
  })

  test('fatal prints the error to stderr and exits with status 1', () => {
    const exit = spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`)
    }) as never)
    try {
      const { out, err } = captured(() => {
        expect(() => fatal('build', 'cannot continue')).toThrow('exit 1')
      })
      expect(err).toEqual(['[build] cannot continue'])
      expect(out).toEqual([])
      expect(exit).toHaveBeenCalledWith(1)
    } finally {
      exit.mockRestore()
    }
  })

  test('the default export and `out` carry every function', () => {
    for (const name of [
      'ascii', 'banner', 'startBanner', 'log', 'error', 'warn', 'status', 'header', 'blank',
      'success', 'fail', 'info', 'hint', 'detail', 'fatal', 'nextStep', 'nextSteps', 'diagnostic',
    ] as const) {
      expect(typeof out[name]).toBe('function')
    }
    expect(out.error).toBe(error)
    expect(out.startBanner).toBe(startBanner)
  })
})

describe('streams', () => {
  test('problems go to stderr and nothing else does', () => {
    const { out, err } = captured(() => {
      error('a', 'b')
      warn('a', 'b')
      warn('a')
      fail('a')
      diagnostic('a', 'b')
    })
    expect(out).toEqual([])
    expect(err).toHaveLength(5)
  })

  test('everything else goes to stdout and nothing to stderr', () => {
    const { out, err } = captured(() => {
      log('a', 'b')
      info('a', 'b')
      success('a')
      status('a', 'b', true)
      status('a', 'b', false)
      hint('a')
      detail('a')
      nextStep('a', 'b')
      nextSteps([{ description: 'a', command: 'b' }])
      header('a')
      blank()
      banner()
      startBanner({ title: 'zega', urls: [] })
    })
    expect(err).toEqual([])
    expect(out.length).toBeGreaterThan(10)
  })

  test('in a real process, an error is on stderr and a log line on stdout', () => {
    const entry = new URL('../src/index.ts', import.meta.url).pathname
    const script = `import { error, log } from ${JSON.stringify(entry)}; log('build', 'started'); error('build', 'failed')`
    const result = Bun.spawnSync([process.execPath, '-e', script])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toBe('[build] started\n')
    expect(result.stderr.toString()).toBe('[build] failed\n')
  })
})

describe('lines, with colour', () => {
  beforeEach(() => {
    chalk.level = 3
    chalkStderr.level = 3
  })

  test('error is a cyan bracket and a red message', () => {
    expect(printedErr(() => error('build', 'compilation failed'))).toEqual([
      `${ESC}[36m[build]${ESC}[39m ${ESC}[31mcompilation failed${ESC}[39m`,
    ])
  })

  test('warn is a yellow dot and a cyan name', () => {
    expect(printedErr(() => warn('cache', 'stale'))).toEqual([
      `${ESC}[33m●${ESC}[39m ${ESC}[36m[cache]${ESC}[39m stale`,
    ])
  })

  test('status is green when ok and red when not', () => {
    expect(printed(() => status('db', 'up', true))).toEqual([
      `${ESC}[32m●${ESC}[39m ${ESC}[36m[db]${ESC}[39m ${ESC}[90mup${ESC}[39m`,
    ])
    expect(printed(() => status('db', 'down', false))).toEqual([
      `${ESC}[31m○${ESC}[39m ${ESC}[36m[db]${ESC}[39m ${ESC}[31mdown${ESC}[39m`,
    ])
  })

  test('nextStep has a grey arrow and a cyan command', () => {
    expect(printed(() => nextStep('start', 'npx zega dev'))).toEqual([
      `  ${ESC}[90m→${ESC}[39m start: ${ESC}[36mnpx zega dev${ESC}[39m`,
    ])
  })

  test('the logo is bold zega green on every row', () => {
    const rows = ascii('zega').split('\n')
    expect(rows).toHaveLength(ZEGA.length)
    for (const row of rows) {
      expect(row.startsWith(`${ESC}[1m${ESC}[38;2;60;203;119m`)).toBe(true)
      expect(row.endsWith(`${ESC}[39m${ESC}[22m`)).toBe(true)
    }
  })
})

describe('NO_COLOR', () => {
  beforeEach(() => {
    chalk.level = 3
    chalkStderr.level = 3
  })

  test('switches every function to plain text even when the terminal supports colour', () => {
    process.env.NO_COLOR = '1'
    const { out, err } = captured(() => {
      banner()
      startBanner({ title: 'zega', urls: [{ label: 'Local', url: 'http://localhost:1/' }], hint: { key: 'h', action: 'show help' } })
      log('a', 'b')
      error('a', 'b')
      warn('a', 'b')
      warn('a')
      status('a', 'b', true)
      status('a', 'b', false)
      header('a')
      success('a')
      fail('a')
      info('a', 'b')
      hint('a')
      detail('a')
      nextStep('a', 'b')
      diagnostic('a', 'b')
    })
    const lines = [...out, ...err]
    expect(lines.length).toBeGreaterThan(10)
    for (const line of lines) {
      expect(line).not.toContain(ESC)
    }
  })

  test('an empty NO_COLOR does not switch colour off', () => {
    process.env.NO_COLOR = ''
    expect(printedErr(() => error('a', 'b'))[0]).toContain(ESC)
  })
})

describe('colour detection in a real process', () => {
  const script = `import { error } from ${JSON.stringify(new URL('../src/index.ts', import.meta.url).pathname)}; error('build', 'failed')`

  function run(env: Record<string, string>): string {
    const base = { ...process.env }
    delete base.NO_COLOR
    delete base.FORCE_COLOR
    const result = Bun.spawnSync([process.execPath, '-e', script], { env: { ...base, ...env } })
    expect(result.exitCode).toBe(0)
    return result.stderr.toString()
  }

  test('output that is not a terminal has no colour', () => {
    expect(run({})).toBe('[build] failed\n')
  })

  test('a colour terminal gets colour (proves the cases below are not vacuous)', () => {
    expect(run({ FORCE_COLOR: '3' })).toContain(ESC)
  })

  test('NO_COLOR wins over a colour terminal', () => {
    expect(run({ FORCE_COLOR: '3', NO_COLOR: '1' })).toBe('[build] failed\n')
  })
})

describe('banners', () => {
  test('ascii draws the logo in the terrace font', () => {
    expect(ascii('zega').split('\n')).toEqual(ZEGA)
  })

  test('banner prints the zega logo: five rows of blocks', () => {
    expect(printed(() => banner())).toEqual([LOGO.join('\n')])
    expect(logo()).toBe(LOGO.join('\n'))
  })

  test('the logo is drawn in two true colour greens: #55FF55 body, #00AA00 edges', () => {
    chalk.level = 3
    const main = (text: string) => `${ESC}[38;2;85;255;85m${text}${ESC}[39m`
    const shade = (text: string) => `${ESC}[38;2;0;170;0m${text}${ESC}[39m`
    const rows = logo().split('\n')
    expect(rows[0]).toBe(`${shade('▐')}${main('██████')}`.repeat(4))
    expect(rows[1]).toBe(
      `   ${shade('▐')}${main('██')} ${shade('▐')}${main('██')}    ${shade('▐')}${main('██')}    ${shade('▐')}${main('██')} ${shade('▐')}${main('██')}`,
    )
  })

  test('without true colour the logo falls back to ANSI bright green (92) and green (32)', () => {
    for (const level of [1, 2] as const) {
      chalk.level = level
      expect(logo().split('\n')[0]).toBe(`${ESC}[32m▐${ESC}[39m${ESC}[92m██████${ESC}[39m`.repeat(4))
    }
  })

  test('with colour off the logo is plain blocks', () => {
    chalk.level = 3
    process.env.NO_COLOR = '1'
    expect(logo()).toBe(LOGO.join('\n'))
  })

  test('in a real process, piped output gets plain blocks and a colour terminal gets true colour', () => {
    const entry = new URL('../src/index.ts', import.meta.url).pathname
    const script = `import { banner } from ${JSON.stringify(entry)}; banner()`
    const base = { ...process.env }
    delete base.NO_COLOR
    delete base.FORCE_COLOR
    const piped = Bun.spawnSync([process.execPath, '-e', script], { env: base })
    expect(piped.stdout.toString()).toBe(`${LOGO.join('\n')}\n`)
    const colour = Bun.spawnSync([process.execPath, '-e', script], { env: { ...base, FORCE_COLOR: '3' } })
    expect(colour.stdout.toString()).toContain(`${ESC}[38;2;85;255;85m██████${ESC}[39m`)
  })

  test('startBanner draws the zega logo when no title is given', () => {
    const [text] = printed(() => startBanner({ urls: [] }))
    expect(text!.split('\n').slice(0, LOGO.length + 2)).toEqual(['', ...LOGO, ''])
  })

  test('startBanner prints title, tagline, rules, aligned entries and the hint', () => {
    const lines = printed(() =>
      startBanner({
        title: 'zega',
        tagline: 'The graph database',
        urls: [
          { label: 'Local', url: 'http://localhost:5173/' },
          { label: 'Network', url: 'http://192.168.1.4:5173/', dim: true },
          { label: 'Explorer', url: 'http://localhost:5174/', status: 'starting' },
        ],
        hint: { key: 'h', action: 'show help' },
      }),
    )
    expect(lines).toEqual([
      [
        '',
        ...ZEGA,
        '',
        '  The graph database',
        '',
        RULE,
        '',
        '  ➜  Local:    http://localhost:5173/',
        '  ➜  Network:  http://192.168.1.4:5173/',
        '  ➜  Explorer: http://localhost:5174/ (starting)',
        '',
        RULE,
        '',
        '  press h to show help',
        '',
      ].join('\n'),
    ])
  })

  test('a service with no address shows its status, and its hint underneath', () => {
    const [text] = printed(() =>
      startBanner({
        title: 'zega',
        urls: [
          { label: 'Server', url: 'http://localhost:8506/' },
          { label: 'Explorer', status: 'stopped', hint: 'zega start --explorer' },
        ],
      }),
    )
    expect(text!.split('\n').slice(ZEGA.length + 1)).toEqual([
      '',
      RULE,
      '',
      '  ➜  Server:   http://localhost:8506/',
      '  ➜  Explorer: (stopped)',
      '     zega start --explorer',
      '',
      RULE,
      '',
    ])
  })

  test('the tagline and the hint are optional', () => {
    const [text] = printed(() => startBanner({ title: 'zega', urls: [] }))
    expect(text).toBe(['', ...ZEGA, '', RULE, '', '', RULE, ''].join('\n'))
  })

  test('with colour: green arrow, bold label, cyan address; dim and address-less entries are dim', () => {
    chalk.level = 3
    chalkStderr.level = 3
    const [text] = printed(() =>
      startBanner({
        title: 'zega',
        urls: [
          { label: 'Local', url: 'http://localhost:1/' },
          { label: 'Network', url: 'http://10.0.0.2:1/', dim: true },
          { label: 'Explorer', status: 'stopped', hint: 'zega start --explorer' },
        ],
        hint: { key: 'h', action: 'show help' },
      }),
    )
    const lines = text!.split('\n')
    expect(lines).toContain(
      `  ${ESC}[38;2;60;203;119m➜${ESC}[39m  ${ESC}[1mLocal:    ${ESC}[22m${ESC}[36mhttp://localhost:1/${ESC}[39m`,
    )
    expect(lines).toContain(
      `  ${ESC}[2m➜${ESC}[22m  ${ESC}[2mNetwork:  ${ESC}[22m${ESC}[2mhttp://10.0.0.2:1/${ESC}[22m`,
    )
    expect(lines).toContain(
      `  ${ESC}[2m➜${ESC}[22m  ${ESC}[1mExplorer: ${ESC}[22m${ESC}[90m(stopped)${ESC}[39m`,
    )
    expect(lines).toContain(`     ${ESC}[2mzega start --explorer${ESC}[22m`)
    expect(lines).toContain(
      `  ${ESC}[90mpress${ESC}[39m ${ESC}[1mh${ESC}[22m ${ESC}[90mto show help${ESC}[39m`,
    )
    expect(lines).toContain(`${ESC}[90m${RULE}${ESC}[39m`)
  })

  test('it does not clear the screen unless asked, and never when not a terminal', () => {
    const write = spyOn(process.stdout, 'write').mockImplementation(() => true)
    const isTTY = process.stdout.isTTY
    try {
      printed(() => startBanner({ title: 'zega', urls: [] }))
      expect(write).not.toHaveBeenCalled()

      process.stdout.isTTY = false
      printed(() => startBanner({ title: 'zega', urls: [], clear: true }))
      expect(write).not.toHaveBeenCalled()

      process.stdout.isTTY = true
      printed(() => startBanner({ title: 'zega', urls: [], clear: true }))
      expect(write).toHaveBeenCalledWith(`${ESC}[2J${ESC}[H`)
    } finally {
      process.stdout.isTTY = isTTY
      write.mockRestore()
    }
  })
})
