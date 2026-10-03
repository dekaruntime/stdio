import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import chalk from 'chalk'

import out, {
  ascii,
  banner,
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

const RULE = '━'.repeat(50)
const ESC = '\x1b'

const savedNoColor = process.env.NO_COLOR
const savedLevel = chalk.level

/** Run `fn` and return the lines it passed to console.log, one entry per call. */
function printed(fn: () => void): string[] {
  const spy = spyOn(console, 'log').mockImplementation(() => {})
  try {
    fn()
    return spy.mock.calls.map((args) => args.join(' '))
  } finally {
    spy.mockRestore()
  }
}

beforeEach(() => {
  delete process.env.NO_COLOR
  chalk.level = 0
})

afterEach(() => {
  if (savedNoColor === undefined) delete process.env.NO_COLOR
  else process.env.NO_COLOR = savedNoColor
  chalk.level = savedLevel
})

describe('lines, without colour', () => {
  test('log', () => {
    expect(printed(() => log('build', 'compiling'))).toEqual(['[build] compiling'])
  })

  test('error', () => {
    expect(printed(() => error('build', 'compilation failed'))).toEqual(['[build] compilation failed'])
  })

  test('warn with a name and with a message only', () => {
    expect(printed(() => warn('cache', 'stale entries'))).toEqual(['● [cache] stale entries'])
    expect(printed(() => warn('disk is almost full'))).toEqual(['● disk is almost full'])
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
    expect(printed(() => fail('build failed'))).toEqual(['✗ build failed'])
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
    expect(printed(() => diagnostic('config', 'unknown key "colour"'))).toEqual([
      '⚠ [config] unknown key "colour"',
    ])
  })

  test('fatal prints the error and exits with status 1', () => {
    const exit = spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`)
    }) as never)
    const spy = spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(() => fatal('build', 'cannot continue')).toThrow('exit 1')
      expect(spy.mock.calls).toEqual([['[build] cannot continue']])
      expect(exit).toHaveBeenCalledWith(1)
    } finally {
      spy.mockRestore()
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

describe('lines, with colour', () => {
  beforeEach(() => {
    chalk.level = 3
  })

  test('error is a cyan bracket and a red message', () => {
    expect(printed(() => error('build', 'compilation failed'))).toEqual([
      `${ESC}[36m[build]${ESC}[39m ${ESC}[31mcompilation failed${ESC}[39m`,
    ])
  })

  test('warn is a yellow dot and a cyan name', () => {
    expect(printed(() => warn('cache', 'stale'))).toEqual([
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
  })

  test('switches every function to plain text even when the terminal supports colour', () => {
    process.env.NO_COLOR = '1'
    const lines = printed(() => {
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
    expect(lines.length).toBeGreaterThan(10)
    for (const line of lines) {
      expect(line).not.toContain(ESC)
    }
  })

  test('an empty NO_COLOR does not switch colour off', () => {
    process.env.NO_COLOR = ''
    expect(printed(() => error('a', 'b'))[0]).toContain(ESC)
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
    return result.stdout.toString()
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

  test('banner prints the zega logo', () => {
    expect(printed(() => banner())).toEqual([ZEGA.join('\n')])
  })

  test('the logo colour is zega green and bold when colour is on', () => {
    chalk.level = 3
    expect(printed(() => banner())[0]).toContain(`${ESC}[1m${ESC}[38;2;60;203;119m`)
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
