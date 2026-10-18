import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { enhanceArgs, enhanceRequest, enhancerSystem, extractPrompt, modelName, recentMessages } from '../hooks/register'

const VOID = { value: undefined } as never
const ok = (value: unknown) => ({ value }) as never

type Opts = {
  box?: string
  reply?: string
  boxAfter?: string
  noProjectContext?: boolean
}

function world(on: On, opts: Opts = {}) {
  mock.store(on, {})
  mock.env(on, { USERPROFILE: '/home/u' })
  const box = { text: opts.box ?? '' }
  const filled: string[] = []
  const toasts: string[] = []
  const forks: string[] = []
  const systems: string[] = []
  let reads = 0
  const asks: { model: string; effort?: string }[] = []
  on('model.complete', async ($, e) => {
    forks.push(e.prompt)
    systems.push(e.system ?? '')
    asks.push({ model: e.model, effort: e.effort })
    return ok({ isAnswered: true, text: opts.reply ?? '', usage: {} })
  })
  on('session.messages', async () =>
    ok([
      { role: 'user', text: 'the robot lands one cell short', toolUses: [] },
      { role: 'assistant', text: '', toolUses: [] },
    ]),
  )
  on('session.model', async () => ok('claude-opus-5-5'))
  on('session.cwd', async () => ok('/repo/sub'))
  on('session.root', async () => ok('/repo'))
  // Files on disk: the project's own context file (unless the case has none), a context
  // file from a parent folder that must never be read, and a CLAUDE.md that must not be sent.
  const files: Record<string, string> = {
    '/home/u/.claude/CLAUDE.md': '# Commits\nCommit with `git commit` and a short message.',
    '/repo/CLAUDE.md': '# Code\nTyped GDScript, entry scene `refonte/main.tscn`.',
    '/project-context.md': 'Another project in a parent folder.',
    ...(opts.noProjectContext ? {} : { '/repo/project-context.md': 'A puzzle game where the player programs a robot.' }),
  }
  const posix = (path: string) => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  on('fs.read', async ($, e) => ok(files[posix(e.path)] ?? ''))
  on('fs.exists', async ($, e) => ok(posix(e.path) in files))
  on('fs.ancestors', async () =>
    ok([
      { dir: '/', name: 'project-context.md', content: files['/project-context.md'], parts: [] },
      { dir: '/repo', name: 'CLAUDE.md', content: files['/repo/CLAUDE.md'], parts: [] },
    ]),
  )
  on('command.list', async () => ok([{ name: 'verify-game', description: 'Check levels in the real engine', source: 'user' }]))
  on('tool.list', async () => ok([{ name: 'Bash', description: 'Shell', mcp: false }]))
  on('prompt.read', async () => {
    reads += 1
    if (reads > 1 && opts.boxAfter !== undefined) box.text = opts.boxAfter
    return ok({ text: box.text, cursor: box.text.length })
  })
  on('prompt.fill', async ($, e) => {
    filled.push(e.text)
    box.text = e.text
    return { isFilled: true } as never
  })
  on('command.register', async ($, e) => ok({ command: e.name }))
  on('ui.toast', async ($, e) => {
    toasts.push(String((e as { text?: string }).text ?? ''))
    return VOID
  })
  on('ui.render', async () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  const submitted: string[] = []
  on('prompt.submit', async ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('turn.start', async ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', async ($, e) => ({ text: e.answer }))
  return { box, filled, toasts, forks, systems, asks, submitted }
}

const start = ($: Engine) => $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } as never } as const

async function buttons($: Engine, surface: 'terminal' | 'desktop') {
  const ui = await $.ui.mount({ plugin: 'prompt-enhancer', surface, ...BAND })
  const keys = [...(await ui.findAll({ type: 'Client' })), ...(await ui.findAll({ type: 'Button' }))].map(b => b.key)
  await ui.unmount()
  return keys
}

async function press($: Engine, surface: 'terminal' | 'desktop', key: string) {
  const ui = await $.ui.mount({ plugin: 'prompt-enhancer', surface, ...BAND })
  if (key === 'enhance') await ui.key({ key: 'return', in: key })
  else await ui.press({ key })
  await ui.unmount()
}

test('helpers: the reply is read from its tags, the request names the target model', () => {
  expect(extractPrompt('Sure.\n<prompt>\nFix the jump in refonte/board.gd\n</prompt>')).toBe('Fix the jump in refonte/board.gd')
  expect(extractPrompt('Fix it')).toBe('Fix it')
  expect(extractPrompt('<prompt>  </prompt>')).toBeUndefined()
  // The plan is the enhancer's own notes and never reaches the prompt box.
  expect(extractPrompt('<plan>\n1. Mode: change\n</plan>\n<prompt>\nFix the jump.\n</prompt>')).toBe('Fix the jump.')
  expect(extractPrompt('<plan>Mode: change</plan>\nFix the jump.')).toBe('Fix the jump.')
  expect(extractPrompt('<plan>Mode: change, the reply was cut')).toBeUndefined()
  expect(extractPrompt('<plan>x</plan><prompt>Fix the jump, then run')).toBe('Fix the jump, then run')
  expect(enhanceRequest('fix it', 'claude-opus-5-5')).toContain('<draft_prompt>\nfix it\n</draft_prompt>')
  expect(enhanceRequest('fix it', 'claude-opus-5-5')).toContain('goes to Claude Opus 5.5, an AI coding agent')
  expect(modelName('claude-opus-5-5')).toBe('Claude Opus 5.5')
  expect(modelName('claude-sonnet-5')).toBe('Claude Sonnet 5')
  expect(modelName('claude-fable-5-1[1m]')).toBe('Claude Fable 5.1')
  expect(modelName('opus')).toBe('opus')
})

test('the request plans the outcome, the expert standard and an outside judge, and keeps the job its size', () => {
  const request = enhanceRequest('fix it', 'claude-opus-5-5')
  for (const part of ['<plan></plan>', 'Outcome:', 'Depth:', 'Judge:', 'Range,', 'Size:', '<prompt></prompt>']) {
    expect(request).toContain(part)
  }
  expect(request).toContain('Make the result better, not the job bigger')
  expect(request).toContain('Raise the standard, never the scope or the permissions')
  expect(request).toContain('a question never becomes a change')
})

test('the system prompt carries project-context.md and the latest messages, and leaves out an empty context file', () => {
  const messages = [{ role: 'user', text: 'the robot lands one cell short' }]
  const system = enhancerSystem({ cwd: '/repo', contextFile: { path: '/repo/project-context.md', text: 'A puzzle game.' }, messages })
  expect(system).toMatch(/^You are a prompt enhancer\./)
  expect(system).toContain('Working directory: /repo')
  expect(system).toContain('<project_context path="/repo/project-context.md">\nA puzzle game.\n</project_context>')
  expect(system).toContain('<user>\nthe robot lands one cell short\n</user>')
  const bare = enhancerSystem({ cwd: '/repo', contextFile: { path: '/repo/project-context.md', text: '  ' }, messages: [] })
  expect(bare).not.toContain('<project_context')
  expect(bare).not.toContain('The conversation so far')
})

test('Enhance replaces the draft without sending it, and Restore brings the original back', async ($, on) => {
  const w = world(on, { box: 'fix the jump', reply: '<plan>Mode: change.</plan>\n<prompt>Fix the Jump landing in refonte/board.gd.</prompt>' })
  await start($)
  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await buttons($, surface)).toEqual(['enhance'])
    await press($, surface, 'enhance')
    expect(w.forks.at(-1)).toContain('fix the jump')
    expect(w.filled.at(-1)).toBe('Fix the Jump landing in refonte/board.gd.')
    expect(w.toasts.at(-1)).toBe('Prompt enhanced. Review it, then send.')
    expect(await buttons($, surface)).toEqual(['enhance', 'restore'])
    await press($, surface, 'restore')
    expect(w.box.text).toBe('fix the jump')
    expect(await buttons($, surface)).toEqual(['enhance'])
  }
})

test('a press always fills the box, even when the rewrite matches the draft', async ($, on) => {
  const w = world(on, { box: 'Run refonte/tests/run_tests.gd', reply: '<prompt>Run refonte/tests/run_tests.gd</prompt>' })
  await start($)
  await press($, 'terminal', 'enhance')
  expect(w.filled).toEqual(['Run refonte/tests/run_tests.gd'])
  expect(w.toasts.at(-1)).toBe('Prompt enhanced. Review it, then send.')
})

test('an empty box asks for a prompt and calls no model', async ($, on) => {
  const w = world(on, { box: '   ' })
  await start($)
  await press($, 'terminal', 'enhance')
  expect(w.forks).toEqual([])
  expect(w.toasts.at(-1)).toBe('Type a prompt first, then enhance it.')
})

test('edits made while enhancing are never overwritten', async ($, on) => {
  const w = world(on, { box: 'fix it', boxAfter: 'fix it now', reply: '<prompt>Fix the crash.</prompt>' })
  await start($)
  await press($, 'terminal', 'enhance')
  expect(w.filled).toEqual([])
  expect(w.box.text).toBe('fix it now')
})

test('one Sonnet call at medium effort carries project-context.md and the recent conversation, not CLAUDE.md, skills or tools', async ($, on) => {
  const w = world(on, { box: 'check level 3', reply: '<prompt>Check level 3 with the verify-game skill.</prompt>' })
  await start($)
  await press($, 'terminal', 'enhance')
  expect(w.asks).toEqual([{ model: 'sonnet', effort: 'medium' }])
  expect(w.forks[0]).toContain('goes to Claude Opus 5.5')
  expect(w.systems[0]).toMatch(/^You are a prompt enhancer\./)
  expect(w.systems[0]).toContain('<project_context path="/repo/project-context.md">\nA puzzle game where the player programs a robot.\n</project_context>')
  for (const left of ['git commit', 'refonte/main.tscn', 'Typed GDScript', 'verify-game', 'Tools: Bash', 'Another project']) {
    expect(w.systems[0]).not.toContain(left)
  }
  expect(w.systems[0]).toContain('<user>\nthe robot lands one cell short\n</user>')
  expect(w.systems[0]).not.toContain('<assistant>')
  expect(w.filled).toEqual(['Check level 3 with the verify-game skill.'])
})

test('/enhance <prompt> typed in full fills the box and is never sent', async ($, on) => {
  const w = world(on, { reply: '<prompt>Explain the stack limit in refonte/main.gd.</prompt>' })
  await start($)
  const r = await $.prompt.submit({ text: '/enhance explain stack limit', origin: { kind: 'composer' } } as never)
  expect(r).toEqual({ drop: 'Prompt enhanced. Review it, then send.' })
  expect(w.filled).toEqual(['Explain the stack limit in refonte/main.gd.'])
})

test('enhanceArgs reads the draft after either name of the command', () => {
  expect(enhanceArgs('/enhance fix it')).toBe('fix it')
  expect(enhanceArgs('/prompt-enhancer:enhance fix it\nnow')).toBe('fix it\nnow')
  expect(enhanceArgs('/enhancer fix it')).toBeUndefined()
  expect(enhanceArgs('please /enhance fix it')).toBeUndefined()
})

test('/prompt-enhancer:enhance, listed before the session starts, fills the box', async ($, on) => {
  const w = world(on, { reply: '<prompt>Explain the stack limit in refonte/main.gd.</prompt>' })
  await start($)
  const r = await $.command.run({ command: 'prompt-enhancer:enhance', args: 'explain stack limit' } as never)
  expect(r.text).toBe('Prompt enhanced. Review it, then send.')
  expect(w.filled).toEqual(['Explain the stack limit in refonte/main.gd.'])
})

test('sending the prompt drops the restore button', async ($, on) => {
  world(on, { box: 'fix the jump', reply: '<prompt>Fix the Jump landing.</prompt>' })
  await start($)
  await press($, 'terminal', 'enhance')
  await $.prompt.submit({ text: 'Fix the Jump landing.', origin: { kind: 'composer' }, wait: false } as never)
  expect(await buttons($, 'terminal')).toEqual([])
})

test('the Enhance button is an orange Client region, clickable with the mouse', async ($, on) => {
  const w = world(on, { box: 'fix the jump', reply: '<prompt>Fix the Jump landing.</prompt>' })
  await start($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'prompt-enhancer', surface, ...BAND })
    expect(await ui.drawn({ in: 'enhance' })).toMatchObject({ type: 'Box', props: { backgroundColor: '#F97316' } })
    await ui.post('press', { in: 'enhance' })
    await ui.unmount()
  }
  expect(w.filled).toEqual(['Fix the Jump landing.', 'Fix the Jump landing.'])
})

test('a background task notice does not hide the button or drop the restore', async ($, on) => {
  world(on, { box: 'fix the jump', reply: '<prompt>Fix the Jump landing.</prompt>' })
  await start($)
  await press($, 'terminal', 'enhance')
  await $.prompt.submit({ text: '<task-notification/>', origin: { kind: 'task-notification' }, wait: false } as never)
  expect(await buttons($, 'terminal')).toEqual(['enhance', 'restore'])
})

test('recent messages keep both sides of the last 8 exchanges, without machine text', () => {
  const m = (role: string, text: string) => ({ role, text })
  const picked = recentMessages([
    m('user', 'fix the jump'),
    m('assistant', 'Jump lands short because of the floor check.'),
    m('user', '<task-notification>done</task-notification>'),
    m('user', 'and the docs?'),
    m('assistant', ''),
    m('assistant', 'Docs are updated.'),
  ]).map(x => x.text)
  expect(picked).toEqual(['fix the jump', 'Jump lands short because of the floor check.', 'and the docs?', 'Docs are updated.'])
  const long = Array.from({ length: 20 }, (_, i) => m(i % 2 === 0 ? 'user' : 'assistant', `message ${i}`))
  expect(recentMessages(long).map(x => x.text)).toEqual(long.slice(4).map(x => x.text))
})

test('a project without project-context.md gets a blue Create button left of Enhance, which asks Claude to write it', async ($, on) => {
  const w = world(on, { box: 'fix the jump', noProjectContext: true })
  const ask = 'Create project-context.md for this project with the prompt-enhancer project-context skill.'
  await start($)
  for (const surface of ['terminal', 'desktop'] as const) {
    expect(await buttons($, surface)).toEqual(['create-context', 'enhance'])
    const ui = await $.ui.mount({ plugin: 'prompt-enhancer', surface, ...BAND })
    expect(await ui.drawn({ in: 'create-context' })).toMatchObject({ type: 'Box', props: { backgroundColor: '#60A5FA' } })
    await ui.post('press', { in: 'create-context' })
    // The button is gone at once, so a second press has nothing to land on.
    expect(await ui.find({ key: 'create-context' })).toBeUndefined()
    await ui.unmount()
    // One request only, and the button stays hidden until its turn ends.
    expect(w.submitted).toEqual([ask])
    expect(await buttons($, surface)).toEqual(['enhance'])
    await $.turn.start({ text: 'An unrelated prompt', turnId: 'other' } as never)
    await $.turn.complete({ turnId: 'other', answer: '', durationMs: 0, isAborted: false, reason: 'completed' } as never)
    expect(await buttons($, surface)).toEqual(['enhance'])
    await $.turn.start({ text: ask, turnId: 'context' } as never)
    await $.turn.complete({ turnId: 'context', answer: '', durationMs: 0, isAborted: false, reason: 'completed' } as never)
    // The file is still missing after that turn, so the button comes back.
    expect(await buttons($, surface)).toEqual(['create-context', 'enhance'])
    w.submitted.length = 0
  }
})

test('a project with project-context.md shows no Create button', async ($, on) => {
  world(on, { box: 'fix the jump' })
  await start($)
  expect(await buttons($, 'terminal')).toEqual(['enhance'])
})

test('a project-context.md in a parent folder does not hide the Create button', async ($, on) => {
  world(on, { box: 'fix the jump', noProjectContext: true })
  await start($)
  expect(await buttons($, 'terminal')).toEqual(['create-context', 'enhance'])
})
