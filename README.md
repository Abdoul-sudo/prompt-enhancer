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
- Makes one call to the newest **Sonnet** at **medium** effort. It gives it your `CLAUDE.md` files, your skills and commands, the tool names and the last few messages of the conversation.
- Puts the rewrite in the prompt box. A clear prompt comes back unchanged.
- `/enhance <prompt>` does the same from the keyboard.

To change the model or effort, edit `MODEL` and `EFFORT` at the top of `hooks/register.tsx`.

## Develop

```
claude plugin validate .
claude plugin test .
```
