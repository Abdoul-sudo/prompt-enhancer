import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { enhanceRequest, extractPrompt, isSamePrompt } from './register'

const VOID = { value: undefined } as never
const ok = (value: unknown) => ({ value }) as never

type Opts = {
  box?: string
  reply?: string
  boxAfter?: string
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
  on('session.cwd', async () => ok('/repo'))
  on('fs.read', async ($, e) => (e.path.replace(/\\/g, '/').includes('/home/u/.claude/CLAUDE.md') ? ok('Global rule: answer briefly.') : ok('')))
  on('fs.ancestors', async () => ok([{ dir: '/repo', name: 'CLAUDE.md', content: 'Project rule: typed GDScript.', parts: [] }]))
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
  on('prompt.submit', async ($, e) => ({ text: e.text }))
  return { box, filled, toasts, forks, systems, asks }
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

test('helpers: the reply is read from its tags, whitespace-only rewrites count as unchanged', () => {
  expect(extractPrompt('Sure.\n<prompt>\nFix the jump in refonte/board.gd\n</prompt>')).toBe('Fix the jump in refonte/board.gd')
  expect(extractPrompt('Fix it')).toBe('Fix it')
  expect(extractPrompt('<prompt>  </prompt>')).toBeUndefined()
  expect(isSamePrompt('fix  the\nbug', 'fix the bug ')).toBe(true)
  expect(isSamePrompt('fix the bug', 'Fix the jump bug')).toBe(false)
  expect(enhanceRequest('fix it')).toContain('<draft_prompt>\nfix it\n</draft_prompt>')
})

test('Enhance replaces the draft without sending it, and Restore brings the original back', async ($, on) => {
  const w = world(on, { box: 'fix the jump', reply: '<prompt>Fix the Jump landing in refonte/board.gd.</prompt>' })
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

test('a clear prompt is left alone', async ($, on) => {
  const w = world(on, { box: 'Run refonte/tests/run_tests.gd', reply: '<prompt>Run refonte/tests/run_tests.gd</prompt>' })
  await start($)
  await press($, 'terminal', 'enhance')
  expect(w.filled).toEqual([])
  expect(w.toasts.at(-1)).toBe('The prompt is already clear.')
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

test('one Sonnet call at medium effort carries the project files, skills, tools and recent conversation', async ($, on) => {
  const w = world(on, { box: 'check level 3', reply: '<prompt>Check level 3 with the verify-game skill.</prompt>' })
  await start($)
  await press($, 'terminal', 'enhance')
  expect(w.asks).toEqual([{ model: 'sonnet', effort: 'medium' }])
  expect(w.systems[0]).toContain('Global rule: answer briefly.')
  expect(w.systems[0]).toContain('Project rule: typed GDScript.')
  expect(w.systems[0]).toContain('- verify-game: Check levels in the real engine')
  expect(w.systems[0]).toContain('Tools: Bash')
  expect(w.systems[0]).toContain('<user>\nthe robot lands one cell short\n</user>')
  expect(w.systems[0]).not.toContain('<assistant>')
  expect(w.filled).toEqual(['Check level 3 with the verify-game skill.'])
})

test('/enhance <prompt> fills the box from its argument', async ($, on) => {
  const w = world(on, { reply: '<prompt>Explain the stack limit in refonte/main.gd.</prompt>' })
  await start($)
  const r = await $.command.run({ command: 'enhance', args: 'explain stack limit' } as never)
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
  expect(w.filled).toEqual(['Fix the Jump landing.'])
  expect(w.toasts).toEqual(['Prompt enhanced. Review it, then send.', 'The prompt is already clear.'])
})

test('a background task notice does not hide the button or drop the restore', async ($, on) => {
  world(on, { box: 'fix the jump', reply: '<prompt>Fix the Jump landing.</prompt>' })
  await start($)
  await press($, 'terminal', 'enhance')
  await $.prompt.submit({ text: '<task-notification/>', origin: { kind: 'task-notification' }, wait: false } as never)
  expect(await buttons($, 'terminal')).toEqual(['enhance', 'restore'])
})
