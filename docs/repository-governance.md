# Repository governance

This repository uses `main` as the protected production branch.

## Working agreement

- Create all new work on a `feature/*` branch.
- Open pull requests targeting `main`.
- Do not push directly to `main`.
- Merge to `main` only after CI passes and at least one reviewer approves.

## Required GitHub settings

Apply these settings in GitHub if they are not already configured:

1. Set the default branch to `main`.
2. Enable branch protection for `main`.
3. Require a pull request before merging.
4. Require status checks to pass before merging.
5. Require the `lint-and-build` status check.
6. Require at least 1 approving review.
7. Optionally include administrators in the rule for consistent enforcement.

## Automation

Use the helper script to apply the default branch and branch protection through the GitHub REST API:

```bash
GITHUB_TOKEN=... \
GITHUB_OWNER=... \
GITHUB_REPO=... \
./scripts/configure-branch-protection.sh
```

The script will:

- set `main` as the default branch
- require pull requests into `main`
- require the `lint-and-build` check
- require at least 1 approval before merge
- enable linear history and conversation resolution

## Local branch setup

If `main` does not exist locally yet:

```bash
git branch main
git checkout -b feature/<short-name>
```
