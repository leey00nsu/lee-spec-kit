# Korean technical style

Write Korean that reads naturally while preserving code-level precision.

## Keep a reader-friendly voice

- Use `해요체` for explanations: `사용해요`, `확인할 수 있어요`, `경계예요`.
- Use `-하세요` when the reader needs to act: `명령을 실행하세요`, `상태를 확인하세요`.
- Do not fall back to declarative `-다` prose or formal `-습니다` prose. Do not mix speech levels to vary sentence endings.
- Keep warnings direct and respectful. State the risk, then tell the reader what to do.
- Preserve literal identifiers and quoted runtime text even when their wording does not follow this voice.

## Prefer direct sentences

- Put the actual actor in the subject when ownership matters.
- Use a concrete verb instead of turning an action into an abstract noun.
- Keep one main idea per sentence. Split a sentence when conditions and results compete for attention.
- Remove framing such as “살펴보겠습니다” when the content can begin directly.
- Avoid opening with “이 문서는 … 설명해요” when the result or problem can be stated directly.
- Prefer specific paths, states, and outcomes over vague words such as “관련”, “처리”, or “부분”.

## Write titles for scanning

- Use a concrete goal or concept rather than a stack of nouns joined with punctuation.
- For a tutorial or how-to, prefer `시작하기`, `변경하기`, `찾기`, or `해결하기`.
- For an explanation, prefer `이해하기` when it makes the reader's purpose clearer.
- For a reference, a stable noun title such as `환경 변수` or `작업 상태` is often clearer than an artificial action title.

## Keep terms stable

Use Korean for ordinary explanatory words: `worker` → `워커`, `ownership` → `소유권`, `lifecycle` → `수명 주기`, `focused test` → `변경 범위 테스트`, `persist` → `저장`, `retry` → `재시도`. These examples apply to prose, not identifiers: keep `leaseOwner`, `MixingJob`, `pnpm test`, product names, and exact API fields unchanged. Explain an unfamiliar term once, then use the same wording. Do not translate an identifier merely to make a sentence look more Korean.

For example, prefer “워커는 작업의 소유권을 확인한 뒤 결과를 저장해요” over “worker는 job ownership을 확인한 뒤 result를 persist해요”. Both sentences must still be supported by the same source evidence.

Choose one Korean term for each concept and reuse it. Keep identifiers, commands, paths, model names, and public API names unchanged. Add a short Korean explanation the first time an unfamiliar English term appears; do not alternate translations afterward.

## Edit paragraph density

Give each paragraph one point. Start with the behavior or result, then explain its condition or reason. When a paragraph moves from setup commands to runtime theory or troubleshooting, move that material to its own section or link to the corresponding planned page. Use a table for exact values and an ordered list for dependent actions. Do not remove exceptions, limits, or failure behavior just to shorten the text, and do not split one connected idea to satisfy a sentence-count target.

## Control density

Use paragraphs for a connected explanation, ordered lists for sequences, bullets for independent choices, and tables for repeated comparisons. Do not turn every sentence into a bullet. Put conditions before an action only when the reader must check them first.

## Make relationships explicit

Name what changed, what caused it, and what observes the result. Avoid omitted subjects when two services, processes, or documents could be the actor. State whether a described rule is a current code fact, durable requirement, active plan, or historical decision.

## Read once for rhythm

After checking facts, read the page as prose. Vary sentence structure without changing speech level, remove unnecessary passive forms, and shorten stacked modifiers. Do not trade exact meaning for variety.

## Rewrite dense repository prose

Before:

> 이 문서는 시스템 경계와 요청 표면을 설명한다. 브라우저 요청은 서버에서 처리되며 작업은 큐에 기록된다.

After:

> 짧은 웹 요청과 오래 걸리는 작업을 분리해요. 서버는 작업을 큐에 기록하고 바로 응답해요. 워커가 남은 처리를 이어가요.

Before:

> 환경 변수 설정 및 데이터베이스 마이그레이션 수행

After:

> 로컬 데이터베이스 준비하기

The rewrite changes presentation, not facts. Keep exact commands, identifiers, limits, states, and failure behavior grounded in repository evidence.
