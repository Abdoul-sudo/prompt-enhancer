---
name: create-project-context
description: Creates project-context.md, the short description of this project that the prompt-enhancer mod reads. Never create the file on your own. Use only when the user asks for the file, with the mod's Create project context button or by running /prompt-enhancer:create-project-context, or when the project-context skill hands over because the file does not exist yet.
model: opus
effort: high
---

When the user did not ask for the file, stop: they decide whether their project has one.

Create `project-context.md` from the real project, by the rules in `../project-context/rules.md` from this skill's folder. Read the project well before you write: this file shapes every prompt the mod rewrites. If the file already exists, use the `prompt-enhancer:project-context` skill to update it instead.
