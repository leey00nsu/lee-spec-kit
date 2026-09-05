# Information architecture

Design the page around the reader's route through the repository.

## Start from the reader's purpose

Use these four document types as the default navigation model:

- `tutorials/`: a guided learning path that reaches a working result;
- `how-tos/`: a concrete task or problem to finish;
- `explanations/`: a mental model, boundary, or design reason to understand;
- `reference/`: exact values, contracts, states, commands, or paths to look up.

OpenWiki generates directory indexes itself; do not include those indexes in a page plan or edit their control fields. Use the required `/openwiki/quickstart.md` as the human entrypoint and group its navigation links by reader purpose. Use a system-oriented group such as `architecture/` or `operations/` only when it is clearer for the reader than the four default types; do not create both groupings for the same content.

Before choosing a path, record the reader question and document type in the page job. “How do I start the app locally?” is a tutorial; “How do I recover a failed job?” is a how-to; “Why does a worker need a lease?” is an explanation; “Which values configure a worker?” is a reference. Separate these goals even when they share source files. Pass this classification to the page worker through the job purpose and instructions, without requiring a new frontmatter schema.

This is a planning preference, not a page-count target. A small repository may need only a few pages. A large repository should split pages only where the reader's goal, prerequisite, or evidence ownership changes.

## Scope one primary topic

A page should resolve one main question. Split material when sections serve different goals, require different prerequisites, or need to be maintained by different evidence.

Keep closely related facts together. Do not split a short, sequential explanation merely to produce more pages.

## Order by reader need

Use this default sequence when it fits:

1. What this page explains and why it matters
2. Prerequisites or surrounding context
3. Main components or steps
4. Boundaries, exceptions, and failure behavior
5. Where to go next

Put the value or conclusion before background that only makes sense afterward. Introduce a term before relying on it.

## Use informative headings

Headings should let a reader predict the section's content. Prefer “How a vocal analysis job reaches the worker” over “Runtime flow”. Keep sibling headings grammatically parallel when they represent comparable concepts.

## Build useful routes

Link only when it reduces navigation work:

- prerequisite: what the reader must know first;
- context: a related boundary or concept;
- next step: where the reader can continue a task;
- evidence: the tracked file supporting a factual claim.

Use descriptive link text. Avoid unexplained chains of “here”, raw host paths, or duplicate links that lead to the same destination.

Keep canonical `/openwiki/...md` paths for planning and page identity. In Markdown, use links relative to the current page: `../quickstart.md` from a one-level-deep page, or `../operations/workers.md` between sibling sections. This lets OpenWiki visualize resolve the intended relationship. Do not add unrelated links or duplicate indexes solely to make the graph connected.
