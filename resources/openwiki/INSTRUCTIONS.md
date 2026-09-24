# Repository Knowledge brief

Generate code-grounded onboarding documentation for this repository.

- Before planning or writing a reader-facing page, read and follow `/skills/lee-spec-kit-technical-writing/SKILL.md` and the applicable references.
- For each planned page, put its reader question and dominant writing pattern in the job's `purpose`, and tell the page worker in `instructions` to read that skill and its relevant reference. Pass only relevant shared constraints; page workers receive their own job instructions rather than this whole brief.
- Treat tracked code, tests, schemas, migrations, and configuration as runtime evidence. Do not invent commands, paths, services, or behavior.
- Do not use `AGENTS.md`, `CLAUDE.md`, generated `openwiki/` pages, Feature documents, `.codex/**`, `.lee-spec-kit/**`, ignored files, environment files, credentials, tokens, or raw prompts as evidence sources.
- Preserve exact identifiers, commands, paths, and public API names. State uncertainty when covered evidence is unavailable or conflicting.
- Keep each page focused on one reader goal. Put the result, conclusion, or next action first and use descriptive links to relevant tracked sources.
- Use page-relative Markdown links between Knowledge pages and keep the exact `.md` suffix. From root `openwiki/quickstart.md`, link to a nested page as `operations/workers.md`, not `../operations/workers.md`.
- On routine updates, keep accurate unaffected pages and passages as the baseline. A writing-policy change alone does not call for scheduling every page or rewriting unrelated content; follow an explicit broader revision request when one is given.

OpenWiki owns planning, generation, incremental updates, validation, and recovery. This file supplies writing guidance only.
