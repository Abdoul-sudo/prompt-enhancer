# Prompt Enhancer

A Claude Code mod that turns a vague prompt into a clear one, using the project you are working in.

Type a prompt, click the orange **Enhance prompt** button above the prompt box, review the result, then send it yourself. **Restore original** puts your text back.

## Install

In a Claude Code terminal session, run:

```
/plugin install prompt-enhancer --marketplace Abdoul-sudo/prompt-enhancer
```

Answer `y` to add the marketplace, then pick the user scope. The mod then loads in every session, the desktop app's Code tab included.

## How it works

- Reads the draft in your prompt box. Nothing is sent.
- Makes one model call. It sends the text in your prompt box together with your `CLAUDE.md` files, your skills and commands, the tool names and the last few messages of the conversation.
- Writes the prompt for the model your session uses (for example Claude Opus 5.5), following Anthropic's prompting advice for current Claude models.
- Adds structure only when the draft needs it: pasted errors or logs go in their own tag, ordered steps become a numbered list, a large feature gets short sections. A short task stays a few plain sentences.
- Puts the rewrite in the prompt box. A clear prompt comes back unchanged.
- `/enhance <prompt>` does the same from the keyboard.

## Model

| Setting | Value | Why |
| --- | --- | --- |
| Model | `sonnet` (the newest Claude Sonnet) | Good judgment about what to keep and what to add, at a fraction of Opus's cost and wait. |
| Effort | `medium` | As fast as `low` on short drafts in testing (a few seconds), with shorter and cleaner rewrites. |

Each click uses your Claude Code account, like any other request.

### Change the model or effort

1. Open `hooks/register.tsx` and edit the two lines at the top:

   ```ts
   const MODEL = 'sonnet'
   const EFFORT = 'medium'
   ```

   - `MODEL`: an alias (`haiku`, `sonnet`, `opus`) or a full model id such as `claude-opus-5-5`.
   - `EFFORT`: `low`, `medium`, `high`, `xhigh` or `max`. Higher is slower and costs more.

2. Start a new session, or run `/reload-plugins` in a terminal session.
