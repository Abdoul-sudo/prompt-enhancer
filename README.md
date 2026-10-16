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

An update replaces the installed files, so edits made there are lost when you update. To keep your own settings, fork the repository and install from your fork.

## Update

Claude Code does not update this mod on its own by default: background auto-update is off for every marketplace you add yourself, and a marketplace cannot turn it on for you.

### Turn on automatic updates (recommended)

Do this once:

1. In a Claude Code terminal session, run `/plugin`.
2. Open **Marketplaces** and select `prompt-enhancer`.
3. Select **Enable auto-update**.

Claude Code then checks for a new version in the background after a session starts. A new version applies from the next session.

### Update by hand

In your shell:

```
claude plugin marketplace update prompt-enhancer
claude plugin update prompt-enhancer@prompt-enhancer
```

Then start a new session.

### How new versions are detected

`plugin.json` has no `version` field on purpose: every commit pushed to `main` is a new version, so updates reach you without a release step.

## Files

| Path | What it holds |
| --- | --- |
| `.claude-plugin/plugin.json` | The mod's manifest. |
| `.claude-plugin/marketplace.json` | Makes this repository its own marketplace, so it installs with one line. |
| `hooks/register.tsx` | The mod: the button, the rewrite instructions and the model call. |
| `hooks/orange_button.tsx` | The orange button, drawn as its own region so the desktop app keeps its color. |
| `types/index.d.ts` | The types of the values the mod keeps for the session. |
| `tests/enhance.test.tsx` | Tests, run with `claude plugin test .` |

## License

[MIT](LICENSE)
