---
ipip: XXXX
title: <Short title — under 50 characters>
author: <Your Name> <your@email>
status: Draft
type: <Standards Track | Informational | Process>
created: YYYY-MM-DD
discussion: <link to GitHub issue / discussion thread>
requires: []
replaces: []
license: CC0-1.0
---

## Abstract

One paragraph. What is this proposal, in plain language? A reader who
sees nothing else should still know what changes.

## Motivation

Why does this need to exist? What is broken, missing, or about to break?
Cite specific incidents, constraints, or external requirements where you
can — not just "it would be nice."

## Specification

The normative section. **This is what implementers must follow** to be
compliant with this IPIP. Be exact:

- Wire formats — give field names, types, encoding rules.
- API shapes — give the request/response JSON, the URL, the verbs.
- State machines — name the states and the allowed transitions.
- Error conditions — what does the implementation do when X is missing,
  malformed, or out of order?

Use [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) keywords (MUST,
SHOULD, MAY) when you mean them. If you're not sure whether something
is a MUST or a SHOULD, you probably haven't thought about it hard
enough yet.

## Rationale

Why this design and not the obvious alternatives? Briefly enumerate the
alternatives you considered, and what trade-off pushed you to this one.
A future contributor reading this should be able to tell whether their
new "what if we just..." idea was already considered.

## Backwards compatibility

What breaks? Who has to do what to migrate?

- Existing nodes / clients on the old version — do they keep working?
- Stored data — does the schema change? Is there a migration?
- Wire format — is there a version bump? A graceful negotiation? Or a
  hard cutover at a release boundary?

If nothing breaks, say "None." with one sentence on why you're sure.

## Reference implementation

Link to the PR(s) that implement this proposal. If there isn't one yet,
say so and give a rough sketch of where the changes will land
(`packages/X`, `apps/Y/lib/Z.js`).

## Test plan

How does a reviewer verify this works?

- Unit tests — what's covered, where they live.
- Integration / end-to-end — what manual steps prove it on a real box.
- Compatibility — if this is a wire change, how do you prove old and
  new sides interoperate (or fail cleanly)?

## Security considerations

What new attack surface does this introduce? What is the threat model?
What can an adversary do? If the answer is "nothing changes," say that
explicitly — don't skip the section.

## Privacy considerations

Does this proposal change what data is collected, transmitted, or
linked? Does it make deanonymization easier? If the answer is "no," say
so explicitly.

## Open questions

Bullet list of things the author wants reviewers' opinions on. Mark
each one resolved or struck through as the discussion settles.

## Copyright

This IPIP is licensed under [CC0
1.0](https://creativecommons.org/publicdomain/zero/1.0/).
