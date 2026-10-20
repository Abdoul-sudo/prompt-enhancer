import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

const hasDraft = atom(
  { plugin: "prompt-enhancer", key: "hasDraft" } as const,
  null,
);
const isBusy = atom(
  { plugin: "prompt-enhancer", key: "isBusy" } as const,
  false,
);
const original = atom(
  { plugin: "prompt-enhancer", key: "original" } as const,
  null,
);
const hasProjectContext = atom(
  { plugin: "prompt-enhancer", key: "hasProjectContext" } as const,
  null,
);
const contextRequest = atom(
  { plugin: "prompt-enhancer", key: "contextRequest" } as const,
  null,
);

const MAX_MESSAGE_CHARS = 2000;
/** One exchange is the user's message and the agent's reply. */
const RECENT_EXCHANGES = 8;
/** The project description the mod reads; its `create-project-context` and `project-context` skills write it. */
const PROJECT_CONTEXT_FILE = "project-context.md";
const LIVE_AGENT: ReadonlySet<string> = new Set(["pending", "running", "waiting"]);
/** The mod's own skill as a slash command: the button runs it as if the person typed it. */
const PROJECT_CONTEXT_COMMAND = "prompt-enhancer:create-project-context";
const MAX_CONTEXT_FILE_CHARS = 20000;
/** Alias the engine resolves to the newest Sonnet, as `--model sonnet` does. */
const MODEL = "sonnet";
/** Tested: as fast as low on short drafts, with shorter and cleaner rewrites. */
const EFFORT = "medium";
const ORANGE = "#F97316";
const ORANGE_HOVER = "#FB923C";
const BLUE = "#60A5FA";
const BLUE_HOVER = "#93C5FD";
const PERSON_ORIGINS: ReadonlySet<string> = new Set([
  "composer",
  "bridge",
  "sdk",
]);
/** `/enhance <prompt>` as typed, or `/prompt-enhancer:enhance <prompt>`, the command commands/enhance.md lists. */
const ENHANCE_PATTERN = /^\/(?:prompt-enhancer:)?enhance(?:\s+([\s\S]*))?$/;

/** The draft after `/enhance`, or undefined when `text` is not that command. */
export function enhanceArgs(text: string): string | undefined {
  const match = ENHANCE_PATTERN.exec(text.trim());
  return match === null ? undefined : (match[1] ?? "");
}

/**
 * Turns a model id into the name people use: `claude-opus-5-5` into "Claude Opus 5.5".
 * Anything that is not a `claude-` id, such as an alias, comes back as given.
 */
export function modelName(id: string): string {
  const match = /^claude-([a-z]+)-(\d+(?:-\d+)*)/.exec(id);
  if (match === null) return id;
  const [, family = "", version = ""] = match;
  return `Claude ${family.charAt(0).toUpperCase()}${family.slice(1)} ${version.replace(/-/g, ".")}`;
}

/** The draft's first words, quoted next to the language rule so the conversation's language does not win. */
function draftOpening(draft: string): string {
  return draft.trim().split(/\s+/).slice(0, 12).join(" ");
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

Rewrite the user's draft above into a better prompt for ${modelName(targetModel)}, an AI agent working in the user's project through Claude Code. The agent can explore, run and change the project, and it follows its own project instructions. Your job is to improve the prompt, not to do the task or answer it.

<principles>
Improve the outcome, not the instructions. Turn the draft into a clearer, more precise and more effective request. Understand what the user actually wants to achieve, raise the quality of the expected result, and keep their intent, scope and permissions. The user pressed Enhance, so always add real value, even when the draft is already clear.

Better, not bigger. Understand the goal behind the task, raise the standard of the result to what the best expert in the field would expect, and bring in perspectives from other fields when they would make the result better. Add that expertise without widening the scope, adding unrelated work or making the prompt more complex than it needs to be.

Focus on the outcome, not the process. Say what the problem is, what result the user wants and what matters about it. Leave the investigation, technical decisions, implementation and verification strategy to the agent. Don't anticipate its reasoning with lists of possible causes, hypothetical scenarios, technical approaches or steps; include such details only when the user's request contains them or when they change the expected result.

Keep the nature of the request. A draft that asks why, how, what or whether is a question, even when it points at a bug: the prompt asks the agent to find out and explain, and to change nothing, because the user decides what to change once they have the answer. An investigation stays an investigation, and a request for changes clearly says to make them. When the user asks for a problem to be fixed, ask for the underlying cause to be fixed, not the symptom. For creative work, describe the intended experience and the quality bar, and leave room for exploration and original solutions.

Use context intelligently. Bring in what the conversation and the project context make clear when it adds real precision, such as the feature, screen or decision in question, and keep the decisions and constraints already settled. Invent no files, commands, technical details, causes or facts. Add no hypothetical limitation, uncertainty or fallback ("if the feature doesn't exist, tell me") unless the conversation or the project context shows it applies: it pulls the agent away from the real problem. When a word in the draft is vague and the context doesn't explain it, keep it open and let the agent find what it refers to, rather than guessing a meaning. Leave out what the agent can find better on its own.

Define what success looks like. Make the expected result clear and, where it helps, say how success will be recognized. Prefer outcomes and evidence over a prescribed testing procedure, and impose no tool, test, metric or deliverable the user didn't ask for.

Be selective. Every addition should improve the agent's understanding or the quality of its result. Leave out explanations, speculative diagnoses, exhaustive checklists, repetition and generic advice. The goal is not the most detailed prompt but the most effective one.
</principles>

<output>
Write the improved prompt in the first person, as natural, clearly separated paragraphs, without fixed headings or templates. Fit the structure, length and depth to the task: a simple request stays short, a complex one gets the detail it needs. Use headings or lists only when they make it clearer.

Keep the code, paths, commands, identifiers, error messages and quotes the user wrote exactly as written, and improve the prose around them freely.

Write the prompt in the same language as the draft, which begins: "${draftOpening(draft)}". The user picks the language of each message on purpose, so the language of the conversation or of the project context says nothing about this one.

Return only the improved prompt inside <prompt></prompt> tags, with no analysis, commentary or explanation.
</output>`;
}

/**
 * Takes the rewritten prompt out of the model's reply; undefined when nothing usable came back.
 * A <plan> block, if the model writes one, is its own notes and never reaches the prompt box.
 */
export function extractPrompt(reply: string): string | undefined {
  const withoutPlan = reply.replace(/<plan>[\s\S]*?<\/plan>/g, "");
  // The last <prompt> block; one cut short by the token cap runs to the end of the reply.
  const tagged = [
    ...withoutPlan.matchAll(/<prompt>([\s\S]*?)(?:<\/prompt>|$)/g),
  ].at(-1)?.[1];
  const text = (
    tagged ?? (withoutPlan.includes("<plan>") ? "" : withoutPlan)
  ).trim();
  return text === "" ? undefined : text;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[...cut]` : text;
}

/**
 * The latest exchanges of the conversation, the user's messages and the agent's
 * replies alike. User rows that are machine text (task notices, reminders) start
 * with a tag and are left out.
 */
export function recentMessages<M extends { role: string; text: string }>(
  messages: readonly M[],
): M[] {
  return messages
    .filter(
      (m) =>
        m.text.trim() !== "" &&
        !(m.role === "user" && m.text.trimStart().startsWith("<")),
    )
    .slice(-2 * RECENT_EXCHANGES);
}

/** What the enhancer knows of the project: where it runs, its project-context.md and the latest messages. */
export type ProjectContext = {
  cwd: string;
  contextFile?: { path: string; text: string };
  messages: readonly { role: string; text: string }[];
};

/** The system prompt: the enhancer's job, then the project's context. */
export function enhancerSystem(context: ProjectContext): string {
  const parts: string[] = [`Working directory: ${context.cwd}`];
  // project-context.md describes the project itself (what it is, its features, its parts), so it is sent whole.
  if (
    context.contextFile !== undefined &&
    context.contextFile.text.trim() !== ""
  ) {
    const { path, text } = context.contextFile;
    parts.push(
      `<project_context path="${path}">\n${clip(text, MAX_CONTEXT_FILE_CHARS)}\n</project_context>`,
    );
  }
  const recent = recentMessages(context.messages);
  if (recent.length > 0) {
    const lines = recent.map(
      (m) => `<${m.role}>\n${clip(m.text, MAX_MESSAGE_CHARS)}\n</${m.role}>`,
    );
    parts.push(
      `The conversation so far (latest messages, for context only; the prompt keeps the draft's language, not theirs):\n${lines.join("\n")}`,
    );
  }
  return `You are a prompt enhancer. You turn a developer's draft into the prompt they send to their AI coding agent in this project. You write that prompt; you never do the task or answer the draft. The project's context:\n\n${parts.join("\n\n")}`;
}

/**
 * The project's context, read live: project-context.md and the end of the conversation.
 * CLAUDE.md, skills and tools are left out: the agent that runs the prompt already has them.
 */
async function projectContext($: EngineInterface): Promise<ProjectContext> {
  const path = await projectContextPath($);
  const text = await $.fs.read(path).catch(() => "");
  const messages = await $.session.messages().catch(() => []);
  return {
    cwd: await $.session.cwd(),
    contextFile: { path, text },
    messages: Array.isArray(messages) ? messages : [],
  };
}

/** Rewrites the draft with one Sonnet call at medium effort, fed the project's context. */
async function rewrite(
  $: EngineInterface,
  draft: string,
): Promise<{ text: string } | { reason: string }> {
  const reply = await $.model.complete({
    model: MODEL,
    effort: EFFORT,
    system: enhancerSystem(await projectContext($)),
    prompt: enhanceRequest(draft, await $.session.model()),
    maxTokens: 16000,
    timeoutMs: 120000,
  });
  if (!reply.isAnswered) return { reason: reply.reason };
  const text = extractPrompt(reply.text);
  return text === undefined ? { reason: "empty-reply" } : { text };
}

/**
 * Enhances `draft`, or the prompt box's draft when none is given, and puts the
 * result in the box without sending it. Answers a line for the caller to show.
 */
async function enhance($: EngineInterface, draft?: string): Promise<string> {
  if (await read($, isBusy)) return "Already enhancing.";
  const source = draft ?? (await $.prompt.read()).text;
  if (source.trim() === "") return "Type a prompt first, then enhance it.";
  await update($, isBusy, () => true);
  try {
    const result = await rewrite($, source);
    if ("reason" in result)
      return `Could not enhance the prompt (${result.reason}).`;
    const box = await $.prompt.read();
    const isOverwritingEdits =
      draft === undefined ? box.text !== source : box.text.trim() !== "";
    if (isOverwritingEdits)
      return "The prompt box changed while enhancing. Your text was kept.";
    const filled = await $.prompt.fill({ text: result.text });
    if (!filled.isFilled) {
      const copied = await $.ui.copy({ text: result.text });
      return copied.isCopied
        ? "The prompt box is busy. The enhanced prompt is on the clipboard."
        : "The prompt box is busy. Try again.";
    }
    await update($, original, () => source);
    await update($, hasDraft, () => true);
    return "Prompt enhanced. Review it, then send.";
  } finally {
    await update($, isBusy, () => false);
  }
}

async function restore($: EngineInterface): Promise<void> {
  const text = await read($, original);
  if (text === null) return;
  const filled = await $.prompt.fill({ text });
  if (!filled.isFilled) {
    $.ui.toast("The prompt box is busy. Try again.");
    return;
  }
  await update($, original, () => null);
}

/**
 * Where the project's project-context.md lives: the folder the session started in,
 * never a parent folder, so a file from another project is never read.
 */
async function projectContextPath($: EngineInterface): Promise<string> {
  return `${await $.session.root()}/${PROJECT_CONTEXT_FILE}`;
}

/** Whether the project has a project-context.md, so the band offers to create one only when it is missing. */
async function refreshProjectContext($: EngineInterface): Promise<void> {
  // A check that fails says nothing about the file: the button shows only when the file is known to be missing.
  const exists = await $.fs
    .exists(await projectContextPath($))
    .catch(() => null);
  await update($, hasProjectContext, () => exists);
}

/** Asks Claude to write project-context.md with the mod's skill, as a turn the user watches. */
async function createProjectContext($: EngineInterface): Promise<void> {
  // One request at a time: the button hides until the turn that answers it ends.
  if ((await read($, contextRequest)) !== null) return;
  await update($, contextRequest, () => "queued");
  // The skill holds the rules; the button only runs it. The command waits for the session to be idle.
  void $.command.run({ command: PROJECT_CONTEXT_COMMAND }).catch(async (error: unknown) => {
    await update($, contextRequest, () => null);
    $.ui.toast(`Could not run /${PROJECT_CONTEXT_COMMAND} (${String(error)}).`);
  });
}

export const register: Register = (on) => {
  let knownDraft: boolean | null = null;

  on("session.start", async ($, e, next) => {
    await update($, isBusy, () => false);
    await update($, contextRequest, () => null);
    await refreshProjectContext($);
    return next(e);
  });

  // Tracks only whether the box is empty, so the band shows when there is something to enhance.
  on("prompt.edit", async ($, e, next) => {
    const box = await next(e);
    const hasText = box.text.trim() !== "";
    if (hasText !== knownDraft) {
      knownDraft = hasText;
      await update($, hasDraft, () => hasText);
    }
    return box;
  }).catch(($, e, next) => next(e));

  // Only a prompt the person sends empties their box; task notices, schedules and peers leave it as it is.
  on("prompt.submit", async ($, e, next) => {
    if (!PERSON_ORIGINS.has(e.origin.kind)) return next(e);
    // `/enhance <prompt>` typed in full, which no command answers: rewritten into the box, never sent.
    const draft = enhanceArgs(e.text);
    if (draft !== undefined) return { drop: await enhance($, draft) };
    knownDraft = false;
    await update($, hasDraft, () => false);
    await update($, original, () => null);
    return next(e);
  });

  // commands/enhance.md lists /prompt-enhancer:enhance, even before the session exists; the mod answers it, never the model.
  on("command.run", { command: "prompt-enhancer:enhance" }, async ($, e) => ({
    text: await enhance($, e.args),
  }));

  // The queued command starts as the next main-loop turn. Each main-loop turn also checks the file again.
  on("turn.start", async ($, e, next) => {
    if (e.agentId === undefined) {
      if ((await read($, contextRequest)) === "queued")
        await update($, contextRequest, () => "running");
      await refreshProjectContext($).catch(() => undefined);
    }
    return next(e);
  });

  // The desktop app prepares a session before the person picks its folder, so session.start may have
  // checked another folder; the app attaching to the session is the first sign of the real one.
  on("session.attach", async ($, e, next) => {
    await refreshProjectContext($).catch(() => undefined);
    return next(e);
  });

  // A turn may have created or removed project-context.md. The request outlives the turn that ran the
  // command while its subagents still work, since a later turn picks up their results.
  on("turn.complete", async ($, e, next) => {
    if (e.agentId === undefined) {
      await refreshProjectContext($).catch(() => undefined);
      if ((await read($, contextRequest)) === "running") {
        const agents = await $.agent.list().catch(() => []);
        const isWorking = agents.some((agent) => LIVE_AGENT.has(agent.status));
        if ((await read($, hasProjectContext)) || !isWorking)
          await update($, contextRequest, () => null);
      }
    }
    return next(e);
  });

  on("ui.message", { element: "create-context" }, async ($, e, next) => {
    if (e.data === "press") await createProjectContext($);
    return next(e);
  });

  // The orange Client button posts 'press' when clicked or when Enter reaches it.
  on("ui.message", { element: "enhance" }, async ($, e, next) => {
    if (e.data === "press") $.ui.toast(await enhance($));
    return next(e);
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const busy = await read($, isBusy);
    const draft = await read($, hasDraft);
    const before = await read($, original);
    const canEnhance = !busy && draft !== false;
    // The last check may have looked at another folder (see session.attach): look again before offering.
    const canCreateContext =
      !busy &&
      (await read($, contextRequest)) === null &&
      (await read($, hasProjectContext)) === false &&
      (await $.fs.exists(await projectContextPath($)).catch(() => true)) === false;
    if (!busy && !canEnhance && before === null && !canCreateContext)
      return next(e);
    const elements = $.ui.resolve(e);
    const { Box, Button, Text } = elements;
    const Client = "Client" in elements ? elements.Client : undefined;
    const below = await next(e);
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="flex-end" width="100%" gap={1}>
          {canCreateContext &&
            (Client !== undefined ? (
              <Client
                key="create-context"
                module="./color_button.tsx"
                props={{
                  label: "Create project context",
                  color: BLUE,
                  hoverColor: BLUE_HOVER,
                }}
              />
            ) : (
              <Button
                key="create-context"
                onPress={() => createProjectContext($)}
              >
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
                props={{
                  label: "Enhance prompt",
                  color: ORANGE,
                  hoverColor: ORANGE_HOVER,
                }}
              />
            ) : (
              <Button
                key="enhance"
                hotkey="e"
                onPress={async () => $.ui.toast(await enhance($))}
              >
                <Text color={ORANGE} bold>
                  Enhance prompt
                </Text>
              </Button>
            ))}
          {!busy && before !== null && (
            <Button
              key="restore"
              label="↶ Restore original"
              hotkey="r"
              dimColor
              onPress={() => restore($)}
            />
          )}
        </Box>
        {below}
      </Box>
    );
  });
};
