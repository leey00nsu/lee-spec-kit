---
name: lee-spec-kit-technical-writing
description: Plan, write, and revise code-grounded OpenWiki documentation around a new developer's goal. Use for every reader-facing repository Knowledge page, including tutorials, how-to guides, explanations, references, and onboarding navigation.
license: CC-BY-NC-SA-4.0
---

# OpenWiki Technical Writing

Make the repository easier to understand without weakening evidence or inventing facts. Adapt Toss Technical Writing's reader-first recommendations to OpenWiki's page jobs and source-grounded Claims. The Korean speech level below is a lee-spec-kit convention, not a rule imposed by Toss.

## Plan the Knowledge route

1. Identify the new developer's immediate question.
2. Classify the reader's need as learning, solving a problem, looking up a contract, or understanding a concept. Choose the matching getting-started/tutorial, how-to/troubleshooting, reference, or explanation pattern.
3. Build the smallest complete route around reader goals. Do not mirror the source tree or target a fixed page count.
4. Give each page one primary goal. Split a page when its sections serve different goals, but keep one short connected flow together.
5. Put the reader question and document pattern in each page job's purpose. Put the skill path and relevant writing constraints in its instructions so the fresh worker knows what to read; do not copy the entire brief or unrelated constraints into every job.
6. On a routine update, follow OpenWiki's affected-page plan. Do not schedule accurate, unaffected pages solely to restyle them or reorganize the wiki to match a document-type directory template; honor an explicit request to revise broader documentation.

Read [information-architecture.md](references/information-architecture.md) and [document-patterns.md](references/document-patterns.md) before submitting a repository page plan.

## Write each page

1. Gather tracked repository evidence before outlining the answer. Cite and claim only what the repository fingerprint covers: AGENTS.md, CLAUDE.md, generated openwiki pages, Feature documents under the docs directory, .codex/**, .openwikiignore, .lee-spec-kit/**, and ignored env or key files are excluded, so name them in prose and support the fact with a covered source.
2. Put the reader's result, conclusion, or next action first. Open the body with a short overview that says what the reader will gain, rather than a list of sections; keep frontmatter descriptions retrieval-oriented.
3. Arrange sections in the order a new developer needs them.
4. Use specific headings, stable terminology, concrete subjects, and short sentences that carry one main idea.
5. Link prerequisite, neighboring, and next-step pages where they remove guesswork.
6. Add at least one descriptive Markdown source link to every generated reader-facing page except the index. Use `[label](repo://path)` or `[label](repo://path#Lx-Ly)` and prefer a stable line range when it points the reader to the relevant contract. Reserve `repo://` for tracked source files included in the repository fingerprint. Link another Knowledge page with a page-relative Markdown path, never `/openwiki/...` or `repo://openwiki/...` hrefs. Claim sidecars and inline code citations do not satisfy this requirement.
7. Resolve every Knowledge link to the exact planned path, including `.md`, but write its href relative to the current page directory. From root `/openwiki/quickstart.md` to `/openwiki/operations/workers.md`, use `operations/workers.md`, never `../operations/workers.md` (which leaves `openwiki/`). From `/openwiki/architecture/system.md` to that workers page, use `../operations/workers.md`. Canonical `/openwiki/...` identifiers belong in plans and metadata; the verified OpenWiki 0.5.2 visualize path requires relative Markdown hrefs. Do not infer a shortened slug or extensionless alias.
8. Write Markdown URL targets with literal `/` characters. Never JSON-escape a Knowledge link as `\/openwiki\/...` or insert backslashes before slashes.
9. For a new page, draft an evidence-backed answer, then edit it for one dominant pattern, focused paragraphs, and natural terminology before submission. For an update, read the existing page first and edit only what changed or became inaccurate; preserve accurate unaffected prose and Claims instead of rewriting the whole page for style. If stale evidence leaves a Claim true, confirm that Claim through OpenWiki's sparse submission and keep accurate prose unchanged. Do not expand a page merely to show that evidence was rechecked.
10. Reconcile commands, conditions, exceptions, links, every Claim requiring attention, and Claims affected by the edit before submitting. Check that every `repo://` target is a tracked regular file and that any `#Lx-Ly` span actually supports the nearby statement; an import line does not show where a function is called. Directories belong in code notation or need a link to a relevant file inside them. Check code examples on the assigned page for undeclared inputs and distinguish expected results from executed outcomes. Do this within the assigned page job, without a separate model, score, or review artifact.

Technical accuracy is the hard constraint. If evidence is missing or conflicting, state the uncertainty instead of making the prose sound complete.

OpenWiki's native repository workers can inspect and edit files but cannot execute tutorial commands. Use examples and expected results supported by tracked code or tests; never claim that this generation run executed an example or verified its output.

Unavailable input does not prove that a file is absent from the repository. Use available tracked-file metadata to check existence without opening excluded content. If that metadata is unavailable, describe the visibility limit instead of claiming absence. Do not relax ignore rules or read secrets to remove uncertainty.

## Load page-specific guidance

- Read [document-patterns.md](references/document-patterns.md) and use the pattern matching the assigned page type.
- Read [information-architecture.md](references/information-architecture.md) when changing page scope, order, headings, or cross-links.
- For Korean output, read [korean-style.md](references/korean-style.md) before drafting or revising any reader-facing prose, including frontmatter descriptions.

## Final review

- Can a new developer tell within the opening section what this page helps them do or understand?
- On update, are accurate unaffected sections and Claims left intact?
- Does the page answer one primary question without hiding another document inside it?
- Are commands, paths, identifiers, boundaries, and runtime sequences exact and evidence-backed?
- Does each claimed result state the conditions that make it true, without implying that one remedy prevents unrelated errors?
- Does every generated reader-facing page except the index contain at least one useful `repo://` Markdown source link?
- Does every page-relative Knowledge href resolve to the exact planned page, including `.md`, without a root-leading slash?
- Do Markdown URL targets use literal forward slashes without backslashes?
- Are prerequisites introduced before dependent concepts?
- Do headings describe their section instead of using vague labels such as “Details” or “Overview” repeatedly?
- Are important terms used consistently throughout the page and neighboring pages?
- Is every abbreviation spelled out with its full name on first use?
- Does the title stay within 30 characters and read as a plain statement?
- Are repeated fields, states, defaults, and limits in a table instead of a sentence?
- Does every link help the reader prepare, understand context, or continue?
- Does the page distinguish current runtime facts from requirements, plans, and historical decisions?
- Do examples and expected results have evidence, without implying that an unrun command was tested?
- For Korean output, does the page keep the same reader-friendly speech level without falling back to declarative `-다` or formal `-습니다` prose?

## License boundary

This adapted skill is separately licensed under CC BY-NC-SA 4.0. See [LICENSE.md](LICENSE.md) for attribution and scope.
