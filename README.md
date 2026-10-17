# Prompt Enhancer

A Claude Code mod that turns a vague prompt into a clear one, using the project you are working in.

Type a prompt, then click the orange **Enhance prompt** button above the prompt box. Review the result and send it yourself. **Restore original** puts your text back.

You can also type `/enhance <prompt>` and press Enter. Nothing goes to Claude: the result goes in the prompt box.

![Typing a vague draft, then one click on Enhance prompt](docs/demo.gif)

## Install

In a Claude Code terminal session, run:

```
/plugin install prompt-enhancer --marketplace Abdoul-sudo/prompt-enhancer
```

Answer `y`, then pick the user scope. The mod loads in every session, the desktop app included.

### Better results: project-context.md

Add a `project-context.md` file to your project: a short description of the project, its main parts and its key files. The mod reads it to write better prompts.

- **Create it:** click the blue **Create project context** button. It shows when the file is missing.
- **Keep it current:** Claude updates the file after big changes. You can also run `/prompt-enhancer:project-context`.

![The blue Create project context button above the prompt box](docs/create-project-context.png)

## How it works

The AI reads your draft, the end of your conversation and your `project-context.md`. It writes a better prompt for the model of your session and puts it in the prompt box.

## Model

The mod uses `sonnet` at `medium` effort. Each click uses your Claude Code account.

To change it, edit `MODEL` and `EFFORT` at the top of `hooks/register.tsx`, then start a new session. An update replaces your edits, so fork the repository to keep them.

## Update

In your shell:

```
claude plugin marketplace update prompt-enhancer
claude plugin update prompt-enhancer@prompt-enhancer
```

Then start a new session.

To update automatically, run `/plugin` in a terminal session, open **Marketplaces**, select `prompt-enhancer`, then **Enable auto-update**.

## License

[MIT](LICENSE)
