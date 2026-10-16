---
name: project-context
description: Updates project-context.md, the short description of this project that the prompt-enhancer mod reads. Use when project-context.md exists and a change adds, removes or renames features, main parts, key files or folders. Never create the file on your own; create it only when the user asks, with the mod's Create project context button, by running /prompt-enhancer:project-context, or directly.
---

Keep `project-context.md` true to the project as it is now. The file lives in the folder this Claude Code session was started in, never in a subfolder or a parent folder: that is the only place the mod reads it. The prompt-enhancer mod reads it to understand the project when it rewrites the user's prompts.

When the file does not exist, stop unless the user asked you to create it. The user creates it with the mod's Create project context button, by running `/prompt-enhancer:project-context`, or by asking you directly; each of these counts as asking.

The file describes:
- what the project is, in two or three sentences;
- its main features and parts;
- the key files and folders, one line each;
- the names used for things in this project.

Describe; do not repeat the rules or workflows from CLAUDE.md, because Claude already reads them. Base every line on the real files, not on memory.

When you update the file, change only what changed and remove what is no longer true.

Keep the whole file under 20,000 characters: the mod reads only the first 20,000. Prefer short lines over detail.

Tell the user in one line what you created or changed.
