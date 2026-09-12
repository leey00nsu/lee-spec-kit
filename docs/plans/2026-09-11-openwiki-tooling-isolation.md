# Isolate lee-spec-kit tooling updates from OpenWiki

## Contract

Tooling-only changes do not constitute a Knowledge commit or product source change.
Staged AGENTS.md / CLAUDE.md changes are classified from HEAD to index by the
OpenWiki block, not the filename. Unstaged Knowledge checks use index to worktree.
Malformed OpenWiki blocks fail closed. Ordinary user instructions remain source.

Source fingerprints exclude complete lee-spec-kit blocks and `.lee-spec-kit.json`.
The generator ignore list excludes toolkit config files and its instructions exclude
managed workflow rules from product evidence. Protection of content outside the
OpenWiki block remains unchanged: generation cannot overwrite toolkit/user rules.

New publication manifests identify source scope version 2. Across tooling-only
commits, reuse requires matching original/current source fingerprints, unchanged
OpenWiki blocks and policy paths, artifact integrity, language and writing policy.
The immutable manifest/receipt retain the generation SHA; `appliedSourceHead` and
the atomically updated Git publication ref identify the commit reusing the artifact.
Source, manual instructions, or OpenWiki ignore/output changes require generation.
Legacy manifests are reusable at the exact original SHA only; never rewrite an old
receipt to claim it was verified under the new scope. A fresh publication establishes
version 2 when generation is next explicitly requested by the workflow.

## Verification

Cover toolkit-only staged edits, partial staging, OpenWiki block deletion, malformed
blocks, unchanged receipt on cross-SHA reuse, source/manual-instruction invalidation,
policy changes and generator protection.

Validation completed on 2026-09-12: all 395 tests across 21 files passed.
The final bundle was rebuilt and the three focused isolation regressions passed
again, including language-change invalidation. Source/test lint and typecheck and
git diff whitespace checks passed.

This change does not publish an npm version or modify consumer repositories.
