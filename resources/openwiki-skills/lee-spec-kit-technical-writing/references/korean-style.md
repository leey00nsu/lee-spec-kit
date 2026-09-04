# Korean technical style

Write Korean that reads naturally while preserving code-level precision.

## Prefer direct sentences

- Put the actual actor in the subject when ownership matters.
- Use a concrete verb instead of turning an action into an abstract noun.
- Keep one main idea per sentence. Split a sentence when conditions and results compete for attention.
- Remove framing such as “살펴보겠습니다” when the content can begin directly.
- Prefer specific paths, states, and outcomes over vague words such as “관련”, “처리”, or “부분”.

## Keep terms stable

Choose one Korean term for each concept and reuse it. Keep identifiers, commands, paths, model names, and public API names unchanged. Add a short Korean explanation the first time an unfamiliar English term appears; do not alternate translations afterward.

## Control density

Use paragraphs for a connected explanation, ordered lists for sequences, bullets for independent choices, and tables for repeated comparisons. Do not turn every sentence into a bullet. Put conditions before an action only when the reader must check them first.

## Make relationships explicit

Name what changed, what caused it, and what observes the result. Avoid omitted subjects when two services, processes, or documents could be the actor. State whether a described rule is a current code fact, durable requirement, active plan, or historical decision.

## Read once for rhythm

After checking facts, read the page as prose. Break repeated sentence endings, remove unnecessary passive forms, and shorten stacked modifiers. Do not trade exact meaning for variety.
