# Idea Indexing And Feature Promotion Design

**Goal:** Make ideas first-class docs with stable `I###` identifiers and explicit promotion tracking so the relationship between PRD, idea, and feature is visible in both documents and CLI flows.

**Approach:** Add a new `idea` CLI command that creates `docs/ideas/I###-slug.md` from built-in templates, then extend `feature` with `--idea` so promotion can update the source idea document and stamp the destination feature spec with its origin.

**Key design points**

1. Ideas become indexed documents.
   - New convention: `docs/ideas/I001-login-rate-limit.md`
   - IDs are global within `docs/ideas/` and independent from feature IDs.
   - Existing legacy idea docs remain valid, but new CLI-generated ideas follow the indexed format.

2. Idea metadata is standardized.
   - Each generated idea doc includes:
     - `Idea ID`
     - `Idea Name`
     - `Status`
     - `Feature`
     - `PRD Refs`
     - `Component`
     - `Created`
   - `Status` values are `Active | Featureized | Dropped`.

3. Promotion is explicit in the CLI.
   - Add `npx lee-spec-kit idea <name>` for creation.
   - Extend `npx lee-spec-kit feature <name>` with `--idea <ref>`.
   - `--idea` accepts at least `I001`, `I001-slug`, and repo-relative `docs/ideas/...md`.

4. Promotion updates both sides.
   - The linked idea doc is updated to `Status: Featureized`.
   - The linked idea doc records `Feature: F001-...`.
   - The generated feature `spec.md` records the originating idea path in related docs.

5. Backward compatibility is preserved.
   - Existing feature creation remains unchanged when `--idea` is not provided.
   - Existing manually written idea docs can still be linked by path.
   - The new tracking is additive rather than a migration requirement.

**Why this is preferable**

- It gives idea docs a durable identifier comparable to `F###`.
- It removes ambiguity about whether an idea has been implemented or only discussed.
- It keeps the CLI responsible for the repetitive tracking work instead of relying on manual doc hygiene.
