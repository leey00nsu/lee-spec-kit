# Feature completion verification, 0.9.14

Local completion must verify the effective project checks before moving the base.
Previously empty checks passed, malformed entries were silently removed, and
verification validity depended on code SHA/tree without identifying the checks.

## Implemented contract

- Missing/empty checks require configuration or a nonempty explicit skip reason.
- `config --checks-detect` suggests existing Node scripts without executing them.
  `config --checks-file` saves a reviewed JSON array; `--checks-skip-reason`
  records a deliberate exemption. Component overrides use `--component`.
- Embedded init prints discovery candidates and configuration guidance. Standalone
  discovery resolves the managed project roots or accepts an explicit root.
- Build is a recommended candidate, not an unconditional arbitrary command.
  Agents document and remove duplicate build coverage during Plan preparation.
- Command, argument, order, component, skip and post-merge policy changes invalidate
  pending verification. One predicate owns stage and merge validity checks.
- Verification also rejects changes to policy or base during execution.
- Local base ancestry is checked before verification and again before integration.
  This does not fetch remote branches. Squash evidence repair is preserved.
- Legacy postMergeChecks are still read as pre-integration checks when featureChecks
  is absent. Update moves them without dropping malformed entries or overwriting
  existing Feature lists. Already cleaned integration history remains complete.
- Plans reference the effective executable baseline. Additional automatic checks
  must be registered there; manual evidence is recorded separately. No Markdown
  command inference or new Feature-specific command execution language is added.

## Validation

Regression coverage exercises empty configuration, a changed check list on the same
Feature SHA/tree, failing checks preventing integration, legacy migration, deliberate
skips, component selection, read-only discovery and existing local FF/squash flows.
Validation passed: source/test lint and typecheck, build, and all 392 tests across 20 files. The npm tarball was installed in a temporary prefix and its CLI version and check discovery were verified.

## Deployment

The registry was 0.9.13 when checked; source is 0.9.14. Publish the tested 0.9.14
package, update the installed CLI, then run update in copy-singer-3. That project
already runs build through pnpm test; preserve its test/lint/tsc list during migration.
