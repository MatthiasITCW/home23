---
id: autoresearch
name: Autoresearch
version: 1.0.0
layer: skill
runtime: docs
author: home23
description: Guidance for iteratively improving a weak skill through score, tweak, and retest loops.
category: meta
keywords:
  - skill
  - improve
  - autoresearch
  - optimize
  - iterate
  - quality
triggers:
  - improve this skill
  - autoresearch this skill
  - optimize the skill
  - why is this skill weak
capabilities:
  - autoresearch_loop: tighten a skill by measuring quality, revising it, and running the loop again
---

# Autoresearch

Use this skill when a skill exists but performs inconsistently and needs deliberate improvement rather than one-off edits.

## When to use

Use `autoresearch` for:
- a skill that triggers inconsistently across similar asks
- a skill whose instructions feel vague, brittle, or underspecified
- quality work where the target is the skill itself, not just the current answer

## Workflow

1. Define the failure mode clearly.
2. Choose a score rubric.
3. Run representative prompts against the skill.
4. Revise `SKILL.md`, routing, examples, or manifest metadata.
5. Retest on the same prompt set.
6. Stop when the quality gain flattens.

## Notes

- This is a process skill, not a direct executable runtime in Home23 yet.
- Use it when the right move is improving the skill itself, not just answering the current task.

## Gotchas

- Do not autoresearch every miss. Only use it when the pattern repeats.
- Keep the prompt set stable while you iterate or the score signal becomes noise.
- Fix routing text and gotchas before inventing more actions.

## Examples

```text
Autoresearch the source-validation skill.
Failure mode: it gets picked too late in research flows.
Score rubric: trigger quality, gotchas, and example clarity.
Keep the same 5 prompts for each test round.
```
