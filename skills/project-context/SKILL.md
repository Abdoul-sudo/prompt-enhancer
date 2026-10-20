---
name: project-context
description: Updates project-context.md, the short description of this project that the prompt-enhancer mod reads. Use when project-context.md exists and a change adds, removes or renames features or main parts of the project, or changes a product decision or a non-goal. Never create the file on your own; create it only when the user asks, with the mod's Create project context button, by running /prompt-enhancer:project-context, or directly.
---

Keep `project-context.md` true to the project as it is now. The file lives in the folder this Claude Code session was started in, never in a subfolder or a parent folder: that is the only place the mod reads it. The prompt-enhancer mod reads it to understand the project when it rewrites the user's prompts.

When the file does not exist, stop unless the user asked you to create it. The user creates it with the mod's Create project context button, by running `/prompt-enhancer:project-context`, or by asking you directly; each of these counts as asking.

The file describes the project the way its users see it, so the mod can turn a short request into a precise one:
- what the project is, who it is for and the problem it solves, in two or three sentences;
- its core features first, one line each: what people can do and see. Describe the minor ones briefly, by area rather than option by option;
- its main parts and how they fit together, in a few plain lines: what each part does, not how it looks or where it sits on screen;
- the names used for things in this project. When the code calls something differently from its users, give the code name once, in brackets after the users' name, so a request written in either vocabulary is understood;
- the decisions already made, each with its reason;
- the non-goals: what the project deliberately does not do, so a request is not widened into them. List only what no decision above already says: each fact appears once;
- how work is checked, in plain words: what the automated tests cover, and the guides or targets the team follows.

Name no file, folder or command. A name from the code appears only in brackets after the name its users use. The agent that runs the prompts finds the code itself, and the mod writes prompts in terms of features, not code.

Describe; do not repeat the rules or workflows from CLAUDE.md, because Claude already reads them. Base every line on the real project, not on memory. When the project does not show who it is for, the reason for a decision or a non-goal, leave it out rather than guess, and end your message with a short question about each one, so the user can fill them in.

When you update the file, change only what changed and remove what is no longer true. Work that fits the existing features and decisions needs no update. When the file breaks a rule of this skill, fix that too, so an older file comes into line at its next update.

Aim for one or two pages: a long file buries what matters. The mod reads only the first 20,000 characters.

Tell the user in one line what you created or changed, and ask them to read the file and correct it: a file the user has checked describes the project better than one written alone.
