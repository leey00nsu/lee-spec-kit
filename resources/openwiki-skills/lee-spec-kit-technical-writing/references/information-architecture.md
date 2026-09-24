# Information architecture

Design the page around the reader's route through the repository.

## Start from the reader's purpose

Use these four reader needs to choose each page's writing pattern:

- learning: a short getting-started orientation or a tutorial with a concrete result;
- problem solving: a how-to for a goal or troubleshooting for an observed failure;
- explanation: a mental model, boundary, or design reason to understand;
- reference: exact values, contracts, states, commands, or paths to look up.

These are purposes, not required folder names or OKF frontmatter values. OpenWiki plans pages around repository systems and workflows and generates directory indexes itself; do not include those indexes in a page plan or edit their control fields. Use the required `/openwiki/quickstart.md` as a compact task-routing entrypoint, not automatically as a hands-on tutorial. Group links by reader purpose while keeping the repository-specific hierarchy that best helps readers find a system.

Before choosing a path, record the reader question and writing pattern in the page job. “How do I start the app locally?” may call for getting-started guidance or a tutorial, depending on whether the reader follows steps to a specific result. “How do I recover a failed job?” calls for troubleshooting when it starts from a symptom. “Why does a worker need a lease?” is an explanation; “Which values configure a worker?” is a reference. Separate these goals even when they share source files. Pass the classification to the page worker through the job purpose and instructions, without requiring a new frontmatter schema.

This is a planning preference, not a page-count target. A small repository may need only a few pages. A large repository should split pages only where the reader's goal, prerequisite, or evidence ownership changes.

## Scope one primary topic

A page should resolve one main question. Split material when sections serve different goals, require different prerequisites, or need to be maintained by different evidence.

Keep closely related facts together. Do not split a short, sequential explanation merely to produce more pages.

If the outline needs a fourth-level heading to organize one topic, that is a signal to split the page instead of adding depth.

## Keep shared facts in one place

Each page is written by a different worker that cannot read the prose of the other pages. Anything several pages need — a job state machine, a status table, a definition of a term — must live on exactly one page. Choose that page in the plan, draw or define it there, and link to it from the others rather than repeating it. Two pages that describe the same state machine will disagree the first time only one of them is updated.

## Order by reader need

Use this default sequence when it fits:

1. A brief opening overview of the reader's result, question, or useful conclusion
2. Prerequisites or surrounding context
3. Main components or steps
4. Boundaries, exceptions, and failure behavior
5. Where to go next

Place the overview directly below the page title, before the first section. It should tell the reader what they can do or understand after reading, without repeating the table of contents or the frontmatter description. Put the value or conclusion before background that only makes sense afterward. Define an unfamiliar concept where it first matters; state conditions, inputs, states, time, and units when they change the result.

## Use informative headings

Headings should let a reader predict the section's content. Prefer “How a vocal analysis job reaches the worker” over “Runtime flow”.

- Include the keyword a reader would search for.
- Keep sibling headings grammatically parallel when they represent comparable concepts, and keep the same pattern across neighboring pages.
- Keep reader-facing titles within 30 characters and write them as plain statements. The title rules for generated pages are in [korean-style.md](korean-style.md).

## Build useful routes

Link only when it reduces navigation work:

- prerequisite: what the reader must know first;
- context: a related boundary or concept;
- next step: where the reader can continue a task;
- evidence: the tracked file supporting a factual claim.

Use descriptive link text. Avoid unexplained chains of “here”, raw host paths, or duplicate links that lead to the same destination.

Keep canonical `/openwiki/...md` paths for planning and page identity. In Markdown, resolve each href from the current page's directory: `operations/workers.md` from root `quickstart.md` to a nested page, `../quickstart.md` from a one-level-deep page to the root, or `../operations/workers.md` between sibling sections. A root page must not use `../` to reach a page below `openwiki/`. This lets OpenWiki visualize resolve the intended relationship. Do not add unrelated links or duplicate indexes solely to make the graph connected.

On update, keep accurate pages, paths, and cross-links as the baseline. Change navigation only when a changed goal, page, or relationship makes the existing route stale; do not regroup pages merely to enforce the four writing patterns.
