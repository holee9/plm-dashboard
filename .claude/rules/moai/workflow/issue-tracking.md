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

## Rule 4: Capture Lessons Learned on Issue Close [HARD]

Before closing any issue, evaluate whether the work produced a methodological lesson
worth preserving. If yes, add it to `docs/index.html` §13 (Keep / Problem / Try) and
commit the change before closing the issue.

### What qualifies as a lesson

A lesson is worth capturing when ANY of the following is true:

- Something behaved differently than expected (API field name, type, permission, encoding)
- A first attempt failed and had to be reworked — the root cause is the lesson
- A structural or design decision was made that future agents would not guess on their own
- A process step (filtering, state management, test approach) produced a non-obvious outcome

A lesson is NOT needed when:

- The fix was straightforward with no surprise (e.g., typo, copy-paste error)
- The issue was purely additive (new UI element, no edge-case discovery)

### How to add a lesson

1. Open `docs/index.html` and locate `<section id="lessons">` (§13)
2. Add a row to the appropriate table (Keep / Problem / Try):
   - **Keep**: something that worked well and should be repeated
   - **Problem**: something unexpected that required rework — state the root cause
   - **Try**: a process change to attempt next time, derived from a Problem
3. Row format: sequential number (K6, P13, T6 …), concise title in `<strong>`, explanation
4. Commit: `docs: 레슨 추가 — <one-line summary> (#issue-number)`
5. Then close the issue

### Threshold: when to skip

If you cannot complete the sentence "The non-obvious thing I learned was ___", skip the
lesson. Do not manufacture lessons for routine work.

## Cross-Linking with Commits and PRs

- Reference the issue number in related commit messages and PR descriptions (e.g., `#12`)
- Use closing keywords (`Closes #12`) in the PR that completes the issue
- When delegating to subagents, pass the active issue number so they comment on the
  same issue rather than starting a parallel, untracked thread

## Lifecycle Summary

1. Plan discovered → create issue (Rule 1)
2. Work proceeds → comment progress on the issue (Rule 2)
3. New work discovered → create linked issue (Rule 3)
4. Work completes → evaluate lesson (Rule 4) → final comment → close issue
