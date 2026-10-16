---
name: project-context
description: Creates or updates project-context.md, the short description of this project that the prompt-enhancer mod reads. Use when the user asks for it, when the project has no project-context.md yet, or after a change that adds, removes or renames features, main parts, key files or folders.
---

Write or update `project-context.md` at the root of this project. The prompt-enhancer mod reads it to understand the project when it rewrites the user's prompts.

Describe the project as it is now:
- what the project is, in two or three sentences;
- its main features and parts;
- the key files and folders, one line each;
- the names used for things in this project.

Describe; do not repeat the rules or workflows from CLAUDE.md, because Claude already reads them. Base every line on the real files, not on memory.

Keep the whole file under 20,000 characters: the mod reads only the first 20,000. Prefer short lines over detail.

When the file exists, update only what changed and remove what is no longer true. Tell the user in one line what you created or changed.
