# Prompt Enhancer

A Claude Code mod that turns a rough prompt into one that gets a better result: aimed at what you actually want, held to the standard of the best expert in the field, and checked by more than Claude's word. It uses the project you are working in.

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

The AI reads your draft, the end of your conversation and your `project-context.md`. Before it writes, it works out:

- **The goal behind the task**: what should be true once it's done, so Claude aims at that and not only at your words.
- **What the best expert would do**: start from the real code, logs or data, and use the method that decides the result, such as reproducing a bug before fixing it or measuring before optimizing.
- **How to prove it worked**: a test that fails before and passes after, a measurement against a target, a run of the real app. Not Claude saying "done".
- **Another field's eye**, only when the result has to land with people: a UX writer for error messages, a copywriter for a launch email.

Then it writes the prompt for the model of your session and puts it in the prompt box. It raises the standard, never the size of the job: no extra features, nothing you didn't allow (like pushing or deploying), and a routine request such as "commit and push" stays short. It never does the task itself.

The method comes from Felix Rieseberg's [How to be more ambitious](https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/).

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

**Claude desktop app:** it doesn't update plugins automatically, even with auto-update on. Run the two commands above from time to time to get the latest version.

## License

[MIT](LICENSE)
