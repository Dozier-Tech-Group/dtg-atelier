# CONTRIBUTING

Short version: keep it safe, keep it tested, keep it pinned.

## Secrets

- **Never commit `.env` or any key.** Not once, not "temporarily", not in a
  branch you plan to delete. A pushed key is a burned key.
- Copy `.env.example` to `.env` for local work. Contributors leave
  `PRIVATE_KEY` blank — you do not need a key to compile or test.

## Before any PR

```
npm run security
```

That runs solhint and the full test suite. If it does not pass, the PR is not
ready. No exceptions.

## PR checklist

- [ ] Tests for every behavior change — new revert, new event, new code path,
      new test. Untested behavior does not exist.
- [ ] `npm run lint` clean. No disabled rules without a comment saying why.
- [ ] Docs updated in the same PR. Stale docs are bugs.
- [ ] No new dependencies without written justification in the PR description.
      Every dependency is attack surface.

## The APIs are pinned

The contract APIs in `BLUEPRINT.md` — constructors, function signatures,
constants, custom errors — are pinned. Tests and deploy scripts are written
against them. Changing one is a **design decision**, not a refactor: it gets
its own discussion and a BLUEPRINT.md update first, or it does not happen.
