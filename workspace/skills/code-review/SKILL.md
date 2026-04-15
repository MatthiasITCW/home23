---
id: code-review
name: Code Review
version: 1.0.0
layer: skill
runtime: docs
author: home23
description: Review a patch, diff, PR, or implementation for bugs, regressions, risky assumptions, and missing tests.
category: coding
keywords:
  - code review
  - review
  - diff
  - pr
  - regression
  - tests
  - bug
triggers:
  - review this diff
  - review this pr
  - what bugs do you see
  - check this implementation for regressions
capabilities:
  - review: inspect code for bugs, regressions, and missing test coverage
---

# Code Review

Use this skill when the task is to review a change set rather than implement new code.

## When to use

Use `code-review` for:
- pull requests
- diffs and patches
- “find bugs” asks
- regression and test-gap inspection

## Workflow

1. Read the changed surface first.
2. Look for behavioral regressions before style issues.
3. Check invariants, data flow, edge cases, and failure handling.
4. Note missing tests only when they would likely catch a real bug.
5. Output findings first, ordered by severity.

## Output

- File or surface reference
- Concrete risk
- Why it matters
- Minimal fix or follow-up

## Gotchas

- Do not praise obvious code. Findings come first.
- Do not turn review into a rewrite proposal unless the change is fundamentally wrong.
- If no findings exist, say that plainly and note residual risk or test gaps.

## Examples

```text
Review this PR for regressions and missing tests.
Focus on the changed files only.
Call out the highest-severity bugs first with file references.
```
