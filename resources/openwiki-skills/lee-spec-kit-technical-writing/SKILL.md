---
name: lee-spec-kit-technical-writing
description: Write and revise code-grounded OpenWiki pages that help a new developer understand, navigate, run, and change a repository. Use for every reader-facing OpenWiki page, including architecture, concepts, operations, integrations, and onboarding content.
license: CC-BY-NC-SA-4.0
---

# OpenWiki Technical Writing

Make the repository easier to understand without weakening evidence or inventing facts.

## Workflow

1. Identify the reader's immediate question and the page's document type.
2. Gather tracked repository evidence before outlining the answer.
3. Put the reader's goal, conclusion, or next action first.
4. Give each page one primary topic and arrange sections in the order a new developer needs them.
5. Use specific headings, stable terminology, concrete subjects, and short sentences that carry one main idea.
6. Link prerequisite, neighboring, and next-step pages where they remove guesswork.
7. Add at least one descriptive Markdown source link to every generated reader-facing page except the index. Use `[label](repo://path)` or `[label](repo://path#Lx-Ly)` and prefer a stable line range when it points the reader to the relevant contract. Reserve `repo://` for tracked source files included in the repository fingerprint. Link another Knowledge page with `/openwiki/...`, never `repo://openwiki/...`. Claim sidecars and inline code citations do not satisfy this requirement.
8. Use the exact planned path for every Knowledge cross-link, including the `.md` suffix. Do not infer a shortened slug or extensionless alias.
9. Write Markdown URL targets with literal `/` characters. Never JSON-escape a Knowledge link as `\/openwiki\/...` or insert backslashes before slashes.
10. Review the page against the checklist below before finishing.

Technical accuracy is the hard constraint. If evidence is missing or conflicting, state the uncertainty instead of making the prose sound complete.

## Load the relevant guidance

- Read [information-architecture.md](references/information-architecture.md) when deciding page scope, order, headings, or cross-links.
- Read [document-patterns.md](references/document-patterns.md) and use the pattern matching the reader's task.
- When the output language is Korean, read [korean-style.md](references/korean-style.md) before drafting or revising sentences.

## Final review

- Can a new developer tell within the opening section what this page helps them do or understand?
- Does the page answer one primary question without hiding another document inside it?
- Are commands, paths, identifiers, boundaries, and runtime sequences exact and evidence-backed?
- Does every generated reader-facing page except the index contain at least one useful `repo://` Markdown source link?
- Does every Knowledge cross-link match an existing planned page path exactly, including `.md`?
- Do Markdown URL targets use literal forward slashes without backslashes?
- Are prerequisites introduced before dependent concepts?
- Do headings describe their section instead of using vague labels such as “Details” or “Overview” repeatedly?
- Are important terms used consistently throughout the page and neighboring pages?
- Does every link help the reader prepare, understand context, or continue?
- Does the page distinguish current runtime facts from requirements, plans, and historical decisions?

## License boundary

This adapted skill is separately licensed under CC BY-NC-SA 4.0. See [LICENSE.md](LICENSE.md) for attribution and scope.
