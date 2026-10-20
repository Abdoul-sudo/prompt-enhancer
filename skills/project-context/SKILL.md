---
name: project-context
description: Updates project-context.md, the short description of this project that the prompt-enhancer mod reads. Use when project-context.md exists and a change adds, removes or renames features or main parts of the project, or changes a product decision or a non-goal. When the file does not exist, use it only when the user asks for the file.
---

When `project-context.md` does not exist, stop unless the user asked for it. When they did, by running `/prompt-enhancer:project-context` or by asking you directly, use the `prompt-enhancer:create-project-context` skill to create it, and stop here.

Otherwise, keep the file true to the project as it is now, by the rules in `rules.md` in this skill's folder. Change only what changed and remove what is no longer true. Work that fits the existing features and decisions needs no update. When the file breaks one of those rules, fix that too, so an older file comes into line at its next update.
