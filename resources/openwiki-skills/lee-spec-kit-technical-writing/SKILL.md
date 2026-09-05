---
name: lee-spec-kit-technical-writing
description: Plan, write, and revise code-grounded OpenWiki documentation around a new developer's goal. Use for every reader-facing repository Knowledge page, including tutorials, how-to guides, explanations, references, and onboarding navigation.
license: CC-BY-NC-SA-4.0
---

# OpenWiki Technical Writing

Make the repository easier to understand without weakening evidence or inventing facts.

## Plan the Knowledge route

1. Identify the new developer's immediate question.
2. Classify the page as a tutorial, how-to guide, explanation, or reference.
3. Build the smallest complete route around reader goals. Do not mirror the source tree or target a fixed page count.
4. Give each page one primary goal. Split a page when its sections serve different goals, but keep one short connected flow together.
5. When planning page jobs, copy the applicable writing instructions into every job. A later page worker must not have to infer the writing policy from the page path or neighboring output.
6. Include the reader question and document type in each job's purpose and instructions. The page title and outline must answer that question; a system name alone is not a reader goal.

Read [information-architecture.md](references/information-architecture.md) and [document-patterns.md](references/document-patterns.md) before submitting a repository page plan.

## Write each page

1. Gather tracked repository evidence before outlining the answer.
2. Put the reader's result, conclusion, or next action first.
3. Arrange sections in the order a new developer needs them.
4. Use specific headings, stable terminology, concrete subjects, and short sentences that carry one main idea.
5. Link prerequisite, neighboring, and next-step pages where they remove guesswork.
6. Add at least one descriptive Markdown source link to every generated reader-facing page except the index. Use `[label](repo://path)` or `[label](repo://path#Lx-Ly)` and prefer a stable line range when it points the reader to the relevant contract. Reserve `repo://` for tracked source files included in the repository fingerprint. Link another Knowledge page with a page-relative Markdown path, never `/openwiki/...` or `repo://openwiki/...` hrefs. Claim sidecars and inline code citations do not satisfy this requirement.
7. Resolve every Knowledge link to the exact planned path, including `.md`, but write its href relative to the current page directory. From `/openwiki/architecture/system.md` to `/openwiki/operations/workers.md`, use `../operations/workers.md`. Canonical `/openwiki/...` identifiers belong in plans and metadata; OpenWiki visualize 0.5.0 requires relative Markdown hrefs. Do not infer a shortened slug or extensionless alias.
8. Write Markdown URL targets with literal `/` characters. Never JSON-escape a Knowledge link as `\/openwiki\/...` or insert backslashes before slashes.
9. Finish the draft before editing it. In this second stage, choose one dominant document type, separate unrelated reader goals, and revise every paragraph for focus and natural terminology. Do not submit the first draft.
10. In the final stage, reconcile commands, conditions, exceptions, links and Claims with the edited prose, then submit the page. Check that every `repo://` target is a tracked regular file; directories belong in code notation or need a link to a relevant file inside them. Keep all three stages in the page job, without a separate model, score, or review artifact.

Technical accuracy is the hard constraint. If evidence is missing or conflicting, state the uncertainty instead of making the prose sound complete.

Unavailable input does not prove that a file is absent from the repository. Use available tracked-file metadata to check existence without opening excluded content. If that metadata is unavailable, describe the visibility limit instead of claiming absence. Do not relax ignore rules or read secrets to remove uncertainty.

## Load page-specific guidance

- Read [document-patterns.md](references/document-patterns.md) and use the pattern matching the assigned page type.
- Read [information-architecture.md](references/information-architecture.md) when changing page scope, order, headings, or cross-links.
- For Korean output, read [korean-style.md](references/korean-style.md) before drafting or revising any reader-facing prose, including frontmatter descriptions.

## Final review

- Can a new developer tell within the opening section what this page helps them do or understand?
- Does the page answer one primary question without hiding another document inside it?
- Are commands, paths, identifiers, boundaries, and runtime sequences exact and evidence-backed?
- Does every generated reader-facing page except the index contain at least one useful `repo://` Markdown source link?
- Does every page-relative Knowledge href resolve to the exact planned page, including `.md`, without a root-leading slash?
- Do Markdown URL targets use literal forward slashes without backslashes?
- Are prerequisites introduced before dependent concepts?
- Do headings describe their section instead of using vague labels such as “Details” or “Overview” repeatedly?
- Are important terms used consistently throughout the page and neighboring pages?
- Does every link help the reader prepare, understand context, or continue?
- Does the page distinguish current runtime facts from requirements, plans, and historical decisions?
- For Korean output, does the page keep the same reader-friendly speech level without falling back to declarative `-다` or formal `-습니다` prose?

## License boundary

This adapted skill is separately licensed under CC BY-NC-SA 4.0. See [LICENSE.md](LICENSE.md) for attribution and scope.
