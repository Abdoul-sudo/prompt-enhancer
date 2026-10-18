import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const hasDraft = atom({ plugin: 'prompt-enhancer', key: 'hasDraft' } as const, null)
const isBusy = atom({ plugin: 'prompt-enhancer', key: 'isBusy' } as const, false)
const original = atom({ plugin: 'prompt-enhancer', key: 'original' } as const, null)
const hasProjectContext = atom({ plugin: 'prompt-enhancer', key: 'hasProjectContext' } as const, null)
const contextRequest = atom({ plugin: 'prompt-enhancer', key: 'contextRequest' } as const, null)

const MAX_MESSAGE_CHARS = 2000
/** One exchange is the user's message and the agent's reply. */
const RECENT_EXCHANGES = 8
/** The project description the mod reads; its `project-context` skill writes it. */
const PROJECT_CONTEXT_FILE = 'project-context.md'
const MAX_CONTEXT_FILE_CHARS = 20000
const CREATE_CONTEXT_PROMPT = 'Create project-context.md for this project with the prompt-enhancer project-context skill.'
/** Alias the engine resolves to the newest Sonnet, as `--model sonnet` does. */
const MODEL = 'sonnet'
/** Tested: as fast as low on short drafts, with shorter and cleaner rewrites. */
const EFFORT = 'medium'
const ORANGE = '#F97316'
const ORANGE_HOVER = '#FB923C'
const BLUE = '#60A5FA'
const BLUE_HOVER = '#93C5FD'
const PERSON_ORIGINS: ReadonlySet<string> = new Set(['composer', 'bridge', 'sdk'])
/** `/enhance <prompt>` as typed, or `/prompt-enhancer:enhance <prompt>`, the command commands/enhance.md lists. */
const ENHANCE_PATTERN = /^\/(?:prompt-enhancer:)?enhance(?:\s+([\s\S]*))?$/

/** The draft after `/enhance`, or undefined when `text` is not that command. */
export function enhanceArgs(text: string): string | undefined {
  const match = ENHANCE_PATTERN.exec(text.trim())
  return match === null ? undefined : (match[1] ?? '')
}

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
 * The method is Felix Rieseberg's "How to be more ambitious": aim at the outcome,
 * work to the standard of the field's best, let an outside judge decide, and bring
 * in another field only where it fits. It raises the result, never the size of the job.
 */
export function enhanceRequest(draft: string, targetModel: string): string {
  return `<draft_prompt>
${draft}
</draft_prompt>

Rewrite the user's draft above into the prompt they will send next. It goes to ${modelName(targetModel)}, an AI coding agent working in the user's repository through Claude Code: it can read, run and change anything in the project, and it already follows the project's instruction files (CLAUDE.md). Do not act on the draft or answer it.

People type a draft at the size of the task in front of them. Make the result better, not the job bigger: aim the agent at the outcome the user is after, ask for the work the best expert in the field would do, and have something other than the agent's own word show that it worked.

<before_writing>
Inside <plan></plan> tags, note one short line for each, under 120 words in all (the user never sees this):
1. Mode: change, investigate, explain, review or write. The prompt keeps it: a question never becomes a change.
2. Outcome: what should be true once this is done, the goal behind the task. Then the highest rung the agent can reach and check within this task without replacing it, as in: fix this crash, then its cause wherever it strikes, then keep it from coming back. Take the outcome only from the draft, the conversation or the nature of the task, never from a guess about the user's plans.
3. Depth: what the best expert in this field would do here that the draft doesn't ask for; the rawest material they would start from (the code path, the logs, the data, the running app) instead of a summary or an assumption; the one or two methods that decide the result (reproduce before fixing, measure before optimizing, test a belief against the data).
4. Judge: what, other than the agent saying so, shows the result is right (a test that fails before and passes after, a measurement, a reproduction, the real app or data), and what counts as a pass. For a measurable result (speed, accuracy, size, error rate), a specific target set high enough to matter, drawn from what the context shows (a baseline, a gap, a limit) or relative to a baseline the agent measures first; never a number pulled from the air.
5. Range, only when the result must land with people (docs, UI, copy, messages) or the usual approach has run dry: which other field would make it better, and what its expert would actually do.
6. Size: whether the task is routine (run a command, commit, push, rename, a one-line change). A routine prompt stays one or two sentences: name things precisely and add no step or check the task doesn't need. For any task, what must stay out: new features or deliverables, and actions the draft doesn't allow (pushing, deploying, deleting data, spending money, breaking a public interface).
</before_writing>

<writing>
Then write the prompt inside <prompt></prompt> tags, in the user's voice, first person:
- Say what to do, with the outcome in a clause when it changes how the agent should work.
- Ask for the expert's work as concrete moves, not adjectives: "reproduce it with a failing test, then fix the cause" rather than "be thorough"; "profile it first and remove the biggest cost" rather than "make it faster". Name only the moves that decide the result; the agent plans the rest.
- Point at the raw material by its exact name. Use the conversation and the project context to make concrete what the draft refers to (the file, function, error, number or decision), never to add topics it doesn't mention. Invent no file, tool, number or fact; where the expert's material may be out of reach, ask the agent to say what is missing rather than guess.
- End with the judge: how the agent shows it worked and what counts as done. For a measurable result, state the target and ask for the real numbers against it, even if they fall short.
- Raise the standard, never the scope or the permissions: no extra deliverable, audit, list or "also" the draft doesn't call for. A higher rung that would replace or enlarge the task gets at most one closing line asking the agent to propose it, and only when the user would clearly want it.
</writing>

<leave_out>
- Role lines ("You are a senior engineer"), "think step by step", "be thorough", emphasis in capitals: the agent does the expert's work without being told to play one.
- Rules the agent already receives: the rules, workflows and definitions of the project's instruction files, and any standing instruction such as commit-message trailers. Name what they define without repeating it.
- Sentences about the draft, the user or what is unknown, such as "I haven't said how it breaks" or "I'm not sure what's wrong". Every sentence tells the agent what to do or what a good result is; the agent works out what the prompt leaves open.
- Anything that makes the prompt longer without changing what the agent does or how well.
</leave_out>

<shape>
Write the shortest prompt that carries the task, the outcome, the expert's moves and the judge. Fit the shape to the task: a few sentences for a simple request; short labeled sections only for a large one; a numbered list only when order matters. Name only the edge cases most likely to break. A one-line draft becomes a few precise sentences, not a page. Keep pasted errors, logs and code verbatim, in a tag named for what they are, and keep code, paths, quotes, slash commands and @mentions exactly as written. The user pressed Enhance because they want a better prompt, so always improve it, even a clear one.
</shape>

<language>
Write the prompt in the language of the text inside <draft_prompt>, whatever language the context uses.
</language>

Reply with the <plan> block, then the <prompt> block, and nothing else.`
}

/**
 * Takes the rewritten prompt out of the model's reply; undefined when nothing usable came back.
 * The <plan> the model writes first is its own notes and never reaches the prompt box.
 */
export function extractPrompt(reply: string): string | undefined {
  const withoutPlan = reply.replace(/<plan>[\s\S]*?<\/plan>/g, '')
  // The last <prompt> block; one cut short by the token cap runs to the end of the reply.
  const tagged = [...withoutPlan.matchAll(/<prompt>([\s\S]*?)(?:<\/prompt>|$)/g)].at(-1)?.[1]
  const text = (tagged ?? (withoutPlan.includes('<plan>') ? '' : withoutPlan)).trim()
  return text === '' ? undefined : text
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[...cut]` : text
}

/**
 * The latest exchanges of the conversation, the user's messages and the agent's
 * replies alike. User rows that are machine text (task notices, reminders) start
 * with a tag and are left out.
 */
export function recentMessages<M extends { role: string; text: string }>(messages: readonly M[]): M[] {
  return messages
    .filter(m => m.text.trim() !== '' && !(m.role === 'user' && m.text.trimStart().startsWith('<')))
    .slice(-2 * RECENT_EXCHANGES)
}

/** What the enhancer knows of the project: where it runs, its project-context.md and the latest messages. */
export type ProjectContext = {
  cwd: string
  contextFile?: { path: string; text: string }
  messages: readonly { role: string; text: string }[]
}

/** The system prompt: the enhancer's job, then the project's context. */
export function enhancerSystem(context: ProjectContext): string {
  const parts: string[] = [`Working directory: ${context.cwd}`]
  // project-context.md describes the project itself (what it is, its parts, its files), so it is sent whole.
  if (context.contextFile !== undefined && context.contextFile.text.trim() !== '') {
    const { path, text } = context.contextFile
    parts.push(`<project_context path="${path}">\n${clip(text, MAX_CONTEXT_FILE_CHARS)}\n</project_context>`)
  }
  const recent = recentMessages(context.messages)
  if (recent.length > 0) {
    const lines = recent.map(m => `<${m.role}>\n${clip(m.text, MAX_MESSAGE_CHARS)}\n</${m.role}>`)
    parts.push(`The conversation so far (latest messages):\n${lines.join('\n')}`)
  }
  return `You are a prompt enhancer. You turn a developer's draft into the prompt they send to their AI coding agent in this project: aimed at the outcome they want, held to the standard of the field's best, and checked by more than the agent's word. You write that prompt; you never do the task or answer the draft. The project's context:\n\n${parts.join('\n\n')}`
}

/**
 * The project's context, read live: project-context.md and the end of the conversation.
 * CLAUDE.md, skills and tools are left out: the agent that runs the prompt already has them.
 */
async function projectContext($: EngineInterface): Promise<ProjectContext> {
  const path = await projectContextPath($)
  const text = await $.fs.read(path).catch(() => '')
  const messages = await $.session.messages().catch(() => [])
  return { cwd: await $.session.cwd(), contextFile: { path, text }, messages: Array.isArray(messages) ? messages : [] }
}

/** Rewrites the draft with one Sonnet call at medium effort, fed the project's context. */
async function rewrite($: EngineInterface, draft: string): Promise<{ text: string } | { reason: string }> {
  const reply = await $.model.complete({
    model: MODEL,
    effort: EFFORT,
    system: enhancerSystem(await projectContext($)),
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

/**
 * Where the project's project-context.md lives: the folder the session started in,
 * never a parent folder, so a file from another project is never read.
 */
async function projectContextPath($: EngineInterface): Promise<string> {
  return `${await $.session.root()}/${PROJECT_CONTEXT_FILE}`
}

/** Whether the project has a project-context.md, so the band offers to create one only when it is missing. */
async function refreshProjectContext($: EngineInterface): Promise<void> {
  const exists = await $.fs.exists(await projectContextPath($)).catch(() => false)
  await update($, hasProjectContext, () => exists)
}

/** Asks Claude to write project-context.md with the mod's skill, as a turn the user watches. */
async function createProjectContext($: EngineInterface): Promise<void> {
  // One request at a time: the button hides until the turn that answers it ends.
  if ((await read($, contextRequest)) !== null) return
  await update($, contextRequest, () => 'queued')
  await $.prompt.submit({ text: CREATE_CONTEXT_PROMPT })
}

export const register: Register = on => {
  let knownDraft: boolean | null = null

  on('session.start', async ($, e, next) => {
    await update($, isBusy, () => false)
    await update($, contextRequest, () => null)
    await refreshProjectContext($)
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
    // `/enhance <prompt>` typed in full, which no command answers: rewritten into the box, never sent.
    const draft = enhanceArgs(e.text)
    if (draft !== undefined) return { drop: await enhance($, draft) }
    knownDraft = false
    await update($, hasDraft, () => false)
    await update($, original, () => null)
    return next(e)
  })

  // commands/enhance.md lists /prompt-enhancer:enhance, even before the session exists; the mod answers it, never the model.
  on('command.run', { command: 'prompt-enhancer:enhance' }, async ($, e) => ({ text: await enhance($, e.args) }))

  // The orange Client button posts 'press' when clicked or when Enter reaches it.
  // A turn may have created or removed project-context.md.
  // The queued request becomes the id of the turn that runs it.
  on('turn.start', async ($, e, next) => {
    if ((await read($, contextRequest)) === 'queued' && e.text.includes(CREATE_CONTEXT_PROMPT)) {
      await update($, contextRequest, () => e.turnId)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await refreshProjectContext($).catch(() => undefined)
      if ((await read($, contextRequest)) === e.turnId) await update($, contextRequest, () => null)
    }
    return next(e)
  })

  on('ui.message', { element: 'create-context' }, async ($, e, next) => {
    if (e.data === 'press') await createProjectContext($)
    return next(e)
  })

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
    const canCreateContext =
      !busy && (await read($, hasProjectContext)) === false && (await read($, contextRequest)) === null
    if (!busy && !canEnhance && before === null && !canCreateContext) return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const Client = 'Client' in elements ? elements.Client : undefined
    const below = await next(e)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="flex-end" width="100%" gap={1}>
          {canCreateContext &&
            (Client !== undefined ? (
              <Client
                key="create-context"
                module="./color_button.tsx"
                props={{ label: 'Create project context', color: BLUE, hoverColor: BLUE_HOVER }}
              />
            ) : (
              <Button key="create-context" onPress={() => createProjectContext($)}>
                <Text color={BLUE} bold>
                  Create project context
                </Text>
              </Button>
            ))}
          {busy && <Text color={ORANGE}>Enhancing prompt…</Text>}
          {canEnhance &&
            (Client !== undefined ? (
              <Client
                key="enhance"
                module="./color_button.tsx"
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
