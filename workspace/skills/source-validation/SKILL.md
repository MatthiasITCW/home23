---
id: source-validation
name: Source Validation
version: 1.0.0
layer: skill
runtime: docs
author: home23
description: Validate claims and sources for credibility, recency, provenance, and likely bias before you rely on them.
category: research
keywords:
  - source
  - validate
  - credibility
  - bias
  - primary source
  - provenance
  - recency
triggers:
  - is this source trustworthy
  - validate this claim
  - check the source quality
  - is this a primary source
capabilities:
  - validate: inspect a claim or source for trustworthiness and limits
---

# Source Validation

Use this skill before you promote a claim to fact.

## When to use

Use `source-validation` for:
- checking whether a source is primary or derivative
- validating recency-sensitive claims
- spotting bias, missing provenance, or circular citation
- comparing multiple sources on the same claim

## Workflow

1. Identify the claim being validated.
2. Find the closest primary source available.
3. Check date, authorship, and provenance.
4. Look for disagreement or unsupported jumps in secondary summaries.
5. Rate confidence and explain why.

## Output

- Claim
- Best supporting source
- Source type: primary, secondary, tertiary
- Risks or bias
- Confidence

## Gotchas

- Popularity is not evidence.
- A recent article can still be derivative and weak.
- If the claim is unsettled, report the uncertainty instead of forcing a verdict.

## Examples

```text
Validate this claim before we cite it:
"Company X signed the deal on April 12."
Prefer the primary filing or official announcement over commentary.
```
