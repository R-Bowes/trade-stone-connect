#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GITHUB_TOKEN:-}" || -z "${GITHUB_OWNER:-}" || -z "${GITHUB_REPO:-}" ]]; then
  cat <<'EOF'
Usage:
  GITHUB_TOKEN=... GITHUB_OWNER=... GITHUB_REPO=... ./scripts/configure-branch-protection.sh

This script configures the `main` branch as the protected production branch and requires:
  - pull requests into main
  - the `lint-and-build` status check
  - at least 1 approving review
EOF
  exit 1
fi

api_root="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}"
headers=(
  -H "Accept: application/vnd.github+json"
  -H "Authorization: Bearer ${GITHUB_TOKEN}"
  -H "X-GitHub-Api-Version: 2022-11-28"
)

echo "Setting default branch to main..."
curl -fsSL -X PATCH "${api_root}" "${headers[@]}" \
  -d '{"default_branch":"main"}' >/dev/null

echo "Applying branch protection to main..."
curl -fsSL -X PUT "${api_root}/branches/main/protection" "${headers[@]}" \
  -d @- <<'JSON' >/dev/null
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint-and-build"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": true
}
JSON

echo "Done. main is configured as the protected production branch."
