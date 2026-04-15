---
id: coding-agent
name: Coding Agent
version: 1.0.0
layer: skill
runtime: docs
author: home23
description: Guidance for when to delegate coding work to a specialized coding runtime or worker.
category: coding
keywords:
  - coding
  - delegate
  - worker
  - refactor
  - feature
  - implementation
triggers:
  - delegate this coding task
  - spin up a worker for this feature
  - use a coding agent
  - hand this off to codex
capabilities:
  - brief: prepare a tight implementation brief
  - model-selection: choose the right coding runtime for the task
  - handoff: define ownership and expected outputs clearly
---

# Coding Agent

Use this skill when coding work is large enough that it benefits from a dedicated worker or coding runtime.

## When to use

Use `coding-agent` for:
- feature builds large enough to split from the main loop
- bounded refactors with clear file ownership
- implementation work that needs a concise brief before delegation

## Workflow

1. Decide whether the task is large enough to justify delegation.
2. Define ownership in file or module terms.
3. Write a brief with success criteria, constraints, and required verification.
4. Choose the right runtime or worker type for the job.
5. Review the result and integrate only after the expected checks pass.

## Rules

- Keep the task concrete and bounded.
- Specify ownership: which files or module slice the worker owns.
- Say what success looks like.
- Avoid delegating the immediate blocking step if the main loop can just do it faster.

## Home23 mapping

- In Home23, this usually means using the agent's existing sub-agent tooling rather than inventing a new shell script.
- If the work is small, just edit directly instead of invoking this pattern.

## Gotchas

- Do not delegate the immediate blocking step if inline work is faster.
- A weak brief creates weak execution. State ownership and success criteria explicitly.
- If the task is mostly reading or deciding, this skill is probably the wrong tool.

## Examples

```text
Use coding-agent for this change:
- Owns: src/agent/tools/skills.ts and workspace/skills/*
- Goal: add skills telemetry and audit commands
- Verify: npm run build and node workspace/skills/index.js audit
```
