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
/** Tested: as fast as low on short drafts, with shorter and cleaner rewrites. */
const EFFORT = 'medium'
const ORANGE = '#F97316'
const ORANGE_HOVER = '#FB923C'
const PERSON_ORIGINS: ReadonlySet<string> = new Set(['composer', 'bridge', 'sdk'])

/**
 * Turns a model id into the name people use: `claude-opus-5-5` into "Claude Opus 5.5".
 * Anything that is not a `claude-` id, such as an alias, comes back as given.
 */
export function modelName(id: string): string {
  const match = /^claude-([a-z]+)-(\d+(?:-\d+)*)/.exec(id)
  if (match === null) return id
  const [, family = '', version = ''] = match
  return `Claude ${family.charAt(0).toUpperCase()}${family.slice(1)} ${version.replace(/-/g, '.')}`
}

/**
 * The instruction sent after the project's context; the draft is data inside it.
 * `targetModel` is the model the session runs, the one that will read the prompt.
 * The guidance follows Anthropic's prompting advice for current Claude models.
 */
export function enhanceRequest(draft: string, targetModel: string): string {
  return `<draft_prompt>
${draft}
</draft_prompt>

Rewrite the user's draft above into the prompt they will send next. The rewritten prompt goes to ${modelName(targetModel)}, an AI coding agent working in the user's repository through Claude Code, so write the prompt that model will follow best. Do not act on the draft: no tools, no answer, no plan. Reply with the rewritten prompt only, inside <prompt></prompt> tags.

<intent>
Keep the user's intent, scope and tone. Add no requirement, feature or constraint they did not state or clearly imply; when something essential is unknown, leave it open or ask for it in the prompt rather than guessing. Keep code, paths, quotes, slash commands and @mentions exactly as written. Write in the user's voice, first person, as they would type it.
</intent>

<context_use>
Use the context above only to make the draft precise: name the exact files, symbols, commands or skills it points at when you are sure of them, and resolve vague references ("it", "that bug") only when the conversation makes them unambiguous.

The agent reads the instruction files above with every prompt, so the prompt restates nothing they already say: their workflows (how to test, verify, commit or push, which skill to load when), their design rules, their conventions. When the draft names something those files define, such as a feature or a mechanic, name it and leave its definition out. A repeated rule adds length and no information, and the agent over-weights what it reads twice. Mention such a rule only when the draft asks to depart from it. Add only what the agent cannot know without the user: the concrete task, the goal and the reason behind it, and details from the conversation.
</context_use>

<how_the_agent_reads>
Current Claude models follow prompts closely and literally:
- Say plainly what to do: change, investigate, or only explain. "Can you look at X" gets a look, not a fix.
- Give the goal, the constraints that matter and how to check the result, rather than a method. The agent plans well on its own, and a hand-written script of steps usually makes the work worse.
- Write at a normal volume, with no capitals or "CRITICAL", "MUST", "IMPORTANT" emphasis, which the agent over-applies. Put the reason beside a constraint instead.
- State the wanted behavior positively; a needless prohibition can pull the agent toward the very thing it forbids.
- Leave out what the agent does by default or that its settings control: "think step by step", "be thorough", generic virtues, role lines, word limits.
- For visual or frontend design work, name the specific styles to avoid rather than asking for a non-generic look.
</how_the_agent_reads>

<shape>
Fit the shape to the draft, since the prompt's shape carries into the agent's reply:
- A single, short task: a few sentences of plain prose.
- Pasted material (an error, a log, a stack trace, code, data): keep it verbatim in a tag named for what it is, such as <error> or <log>, apart from the instruction.
- Several steps whose order matters: a short numbered list.
- A large feature or a change across many parts: short labeled sections, such as goal, scope, out of scope and how to verify.
Add no other headings, tags or formatting.
</shape>

<length>
Match the effort to the need. A clear draft comes back unchanged or almost unchanged; fix only what is ambiguous or missing. A better prompt is usually a more precise one, not a longer one. Before you answer, reread your prompt sentence by sentence and delete each one the agent could already learn from the instruction files.
</length>

<language>
Write the prompt in the language of the text inside <draft_prompt>, whatever language the conversation or the instruction files use: an English draft gets an English prompt, a French draft a French one.
</language>`
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
  const parts: string[] = [
    `Working directory: ${await $.session.cwd()}`,
    'The instruction files below are loaded by Claude Code with every prompt. They are here so you know what not to repeat.',
  ]
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
  return `You rewrite prompts for a developer working with Claude Code in this project. The project's context:\n\n${parts.join('\n\n')}`
}

/** Rewrites the draft with one Sonnet call at medium effort, fed the project's context. */
async function rewrite($: EngineInterface, draft: string): Promise<{ text: string } | { reason: string }> {
  const reply = await $.model.complete({
    model: MODEL,
    effort: EFFORT,
    system: await projectContext($),
    prompt: enhanceRequest(draft, await $.session.model()),
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
