# Issue-Based Work Tracking

All work must be tracked through GitHub Issues so that progress history is fully
reconstructable. These are HARD rules applied to every task in this project.

## Repository

- Target repository: `holee9/plm-dashboard` (Issues enabled)
- Tooling: GitHub CLI (`gh`), authenticated as the project owner

## Rule 1: Register Every Work Plan as an Issue

Before starting any work plan, create a GitHub issue that captures the plan.

- Command: `gh issue create --title "<concise goal>" --body "<scope, plan, acceptance criteria>"`
- The issue body should include: goal, scope, planned steps, and acceptance criteria
- Apply labels when useful (e.g., `feature`, `bug`, `docs`, `integration`)
- Do not begin implementation until the tracking issue exists

## Rule 2: Log Progress as Issue Comments

While working on an issue, record meaningful progress as comments on that issue.

- Command: `gh issue comment <number> --body "<progress, decision, or result>"`
- Comment when: a milestone is reached, a key decision is made, a blocker appears,
  or a result is verified
- Reference commits, PRs, and files so the timeline links to concrete artifacts
- The issue timeline alone must be enough to reconstruct what happened

## Rule 3: Register Discovered Work as New Issues

Any additional work discovered during execution must become its own issue.

- File a new issue for each discovered task; do not bury it inside the current one
- Link it to the originating issue (reference `#<number>` in the body or a comment)
- This prevents follow-up work from being lost or tracked only informally

## Cross-Linking with Commits and PRs

- Reference the issue number in related commit messages and PR descriptions (e.g., `#12`)
- Use closing keywords (`Closes #12`) in the PR that completes the issue
- When delegating to subagents, pass the active issue number so they comment on the
  same issue rather than starting a parallel, untracked thread

## Lifecycle Summary

1. Plan discovered → create issue (Rule 1)
2. Work proceeds → comment progress on the issue (Rule 2)
3. New work discovered → create linked issue (Rule 3)
4. Work completes → final comment + close via PR or `gh issue close`
