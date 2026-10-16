import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const hasDraft = atom({ plugin: 'prompt-enhancer', key: 'hasDraft' } as const, null)
const isBusy = atom({ plugin: 'prompt-enhancer', key: 'isBusy' } as const, false)
const original = atom({ plugin: 'prompt-enhancer', key: 'original' } as const, null)

const MAX_FILE_CHARS = 20000
const MAX_MESSAGE_CHARS = 2000
const RECENT_MESSAGES = 8
/** Alias the engine resolves to the newest Sonnet, as `--model sonnet` does. */
const MODEL = 'sonnet'
const EFFORT = 'medium'
const ORANGE = '#F97316'
const ORANGE_HOVER = '#FB923C'
const PERSON_ORIGINS: ReadonlySet<string> = new Set(['composer', 'bridge', 'sdk'])

/** The instruction sent after the session's own context; the draft is data inside it. */
export function enhanceRequest(draft: string): string {
  return `<draft_prompt>
${draft}
</draft_prompt>

Rewrite the draft above into the prompt I should send Claude Code next in this session. Do not act on it: no tools, no answer, no plan. Reply with the rewritten prompt only, inside <prompt></prompt> tags.

How to rewrite it:
- Keep my intent, scope, tone and language. Add no requirement, feature or constraint I did not state or clearly imply.
- Use the context above (project instructions, skills, tools and the conversation so far) only to make the draft precise: name the exact files, symbols, commands, skills or conventions it points at when you are sure of them. Do not restate rules or context Claude Code already has; it will still have them when I send it.
- Make it actionable: say what to do (change, investigate or only explain), on what, and what done looks like when the draft implies it. Resolve vague references ("it", "that bug") from the conversation only when they are unambiguous.
- Match the effort to the need. A clear draft comes back unchanged or almost unchanged. Fix only what is ambiguous or missing. Shorter is better: no headings, filler, role-play, repeated context or generic advice such as "be careful" or "follow best practices".
- Write it as I would type it: first person, direct, plain prose, or a short list only when the task has several distinct parts.
- When something essential is unknown and cannot be inferred, leave it open or ask for it in the prompt; never guess.
- Keep code, paths, quotes, slash commands and @mentions exactly as written.`
}

/** Takes the rewritten prompt out of the model's reply; undefined when nothing usable came back. */
export function extractPrompt(reply: string): string | undefined {
  const tagged = [...reply.matchAll(/<prompt>([\s\S]*?)<\/prompt>/g)].at(-1)?.[1]
  const text = (tagged ?? reply).trim()
  return text === '' ? undefined : text
}

/** True when the rewrite only moved whitespace around. */
export function isSamePrompt(a: string, b: string): boolean {
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
  return flat(a) === flat(b)
}

function clip(text: string, max = MAX_FILE_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}\n[...cut]` : text
}

/** The project's context, read live: instruction files, skills, tools and the end of the conversation. */
async function projectContext($: EngineInterface): Promise<string> {
  const parts: string[] = [`Working directory: ${await $.session.cwd()}`]
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (home !== undefined) {
    const path = `${home}/.claude/CLAUDE.md`
    const text = await $.fs.read(path).catch(() => '')
    if (text.trim() !== '') parts.push(`<instructions path="${path}">\n${clip(text)}\n</instructions>`)
  }
  const files = await $.fs.ancestors({ names: ['CLAUDE.md', '.claude/CLAUDE.md', 'CLAUDE.local.md'] }).catch(() => [])
  for (const f of files) parts.push(`<instructions path="${f.dir}/${f.name}">\n${clip(f.content)}\n</instructions>`)
  const commands = (await $.command.list().catch(() => [])).filter(c => c.source !== 'builtin')
  if (commands.length > 0) parts.push(`Skills and commands:\n${commands.map(c => `- ${c.name}: ${c.description}`).join('\n')}`)
  const tools = await $.tool.list().catch(() => [])
  if (tools.length > 0) parts.push(`Tools: ${tools.map(t => t.name).join(', ')}`)
  const messages = await $.session.messages().catch(() => [])
  const recent = (Array.isArray(messages) ? messages : []).filter(m => m.text.trim() !== '').slice(-RECENT_MESSAGES)
  if (recent.length > 0) {
    const lines = recent.map(m => `<${m.role}>\n${clip(m.text, MAX_MESSAGE_CHARS)}\n</${m.role}>`)
    parts.push(`The conversation so far (latest messages):\n${lines.join('\n')}`)
  }
  return `You are Claude Code, about to receive a prompt in this project. Its context:\n\n${parts.join('\n\n')}`
}

/** Rewrites the draft with one Sonnet call at medium effort, fed the project's context. */
async function rewrite($: EngineInterface, draft: string): Promise<{ text: string } | { reason: string }> {
  const reply = await $.model.complete({
    model: MODEL,
    effort: EFFORT,
    system: await projectContext($),
    prompt: enhanceRequest(draft),
    maxTokens: 4000,
    timeoutMs: 120000,
  })
  if (!reply.isAnswered) return { reason: reply.reason }
  const text = extractPrompt(reply.text)
  return text === undefined ? { reason: 'empty-reply' } : { text }
}

/**
 * Enhances `draft`, or the prompt box's draft when none is given, and puts the
 * result in the box without sending it. Answers a line for the caller to show.
 */
async function enhance($: EngineInterface, draft?: string): Promise<string> {
  if (await read($, isBusy)) return 'Already enhancing.'
  const source = draft ?? (await $.prompt.read()).text
  if (source.trim() === '') return 'Type a prompt first, then enhance it.'
  await update($, isBusy, () => true)
  try {
    const result = await rewrite($, source)
    if ('reason' in result) return `Could not enhance the prompt (${result.reason}).`
    if (isSamePrompt(result.text, source)) return 'The prompt is already clear.'
    const box = await $.prompt.read()
    const isOverwritingEdits = draft === undefined ? box.text !== source : box.text.trim() !== ''
    if (isOverwritingEdits) return 'The prompt box changed while enhancing. Your text was kept.'
    const filled = await $.prompt.fill({ text: result.text })
    if (!filled.isFilled) {
      const copied = await $.ui.copy({ text: result.text })
      return copied.isCopied ? 'The prompt box is busy. The enhanced prompt is on the clipboard.' : 'The prompt box is busy. Try again.'
    }
    await update($, original, () => source)
    await update($, hasDraft, () => true)
    return 'Prompt enhanced. Review it, then send.'
  } finally {
    await update($, isBusy, () => false)
  }
}

async function restore($: EngineInterface): Promise<void> {
  const text = await read($, original)
  if (text === null) return
  const filled = await $.prompt.fill({ text })
  if (!filled.isFilled) {
    $.ui.toast('The prompt box is busy. Try again.')
    return
  }
  await update($, original, () => null)
}

export const register: Register = on => {
  let knownDraft: boolean | null = null

  on('session.start', async ($, e, next) => {
    await update($, isBusy, () => false)
    await $.command.register({
      name: 'enhance',
      description: 'Rewrite a prompt into a clearer one for this project and put it in the prompt box',
      argumentHint: '<prompt>',
    })
    return next(e)
  })

  // Tracks only whether the box is empty, so the band shows when there is something to enhance.
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    const hasText = box.text.trim() !== ''
    if (hasText !== knownDraft) {
      knownDraft = hasText
      await update($, hasDraft, () => hasText)
    }
    return box
  }).catch(($, e, next) => next(e))

  // Only a prompt the person sends empties their box; task notices, schedules and peers leave it as it is.
  on('prompt.submit', async ($, e, next) => {
    if (!PERSON_ORIGINS.has(e.origin.kind)) return next(e)
    knownDraft = false
    await update($, hasDraft, () => false)
    await update($, original, () => null)
    return next(e)
  })

  on('command.run', { command: 'enhance' }, async ($, e) => ({ text: await enhance($, e.args) }))

  // The orange Client button posts 'press' when clicked or when Enter reaches it.
  on('ui.message', { element: 'enhance' }, async ($, e, next) => {
    if (e.data === 'press') $.ui.toast(await enhance($))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const busy = await read($, isBusy)
    const draft = await read($, hasDraft)
    const before = await read($, original)
    const canEnhance = !busy && draft !== false
    if (!busy && !canEnhance && before === null) return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const Client = 'Client' in elements ? elements.Client : undefined
    const below = await next(e)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="flex-end" width="100%" gap={1}>
          {busy && <Text color={ORANGE}>Enhancing prompt…</Text>}
          {canEnhance &&
            (Client !== undefined ? (
              <Client
                key="enhance"
                module="./orange_button.tsx"
                props={{ label: 'Enhance prompt', color: ORANGE, hoverColor: ORANGE_HOVER }}
              />
            ) : (
              <Button key="enhance" hotkey="e" onPress={async () => $.ui.toast(await enhance($))}>
                <Text color={ORANGE} bold>
                  Enhance prompt
                </Text>
              </Button>
            ))}
          {!busy && before !== null && (
            <Button key="restore" label="↶ Restore original" hotkey="r" dimColor onPress={() => restore($)} />
          )}
        </Box>
        {below}
      </Box>
    )
  })
}
