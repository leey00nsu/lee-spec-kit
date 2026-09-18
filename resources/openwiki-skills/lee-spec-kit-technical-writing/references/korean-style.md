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
- Give exact numbers, defaults, ranges, and limits. Write “기본값은 5초예요” instead of “시간 제한이 있어요”.

## Make people and behavior the actor

The reader is a developer, and the work in the page is work the reader or the code does. Do not make a tool, technology, or product the subject of an action the reader performs.

- Prefer “`docker compose up -d`를 실행하면 PostgreSQL 컨테이너가 시작돼요” over “`docker compose up -d`는 PostgreSQL 컨테이너를 시작해요”.
- Prefer “이 명령을 실행하면 데이터베이스를 초기화할 수 있어요” over “이 도구는 데이터베이스를 초기화해요”.
- Describing how a tool, service, or worker itself behaves is the exception. When the page explains that component's own runtime behavior, naming it as the subject is correct. `Modal은 202와 작업 ID를 반환해요`는 그대로 두세요.
- Prefer active voice. Rewrite passive sentences so the actor is visible: “설정이 완료되어야 합니다” 대신 “설정을 완료하세요”.

## Write titles for scanning

- Use a concrete goal or concept rather than a stack of nouns joined with punctuation.
- Keep the title within 30 characters.
- Write the title as a plain statement. Do not end it with a question mark or leave it as a noun fragment that only names a system.
- For a tutorial or how-to, prefer `시작하기`, `변경하기`, `찾기`, or `해결하기`.
- For an explanation, prefer `이해하기` when it makes the reader's purpose clearer.
- For a reference, a stable noun title such as `환경 변수` or `작업 상태` is often clearer than an artificial action title.

## Keep terms, names, and abbreviations consistent

Every rule below applies to prose only. Code identifiers, commands, file paths, model names, product names, and public API names keep their exact spelling wherever they appear.

- Use Korean for ordinary explanatory words: `worker` → `워커`, `ownership` → `소유권`, `lifecycle` → `수명 주기`, `media` → `미디어`, `asset` → `자산`, `snapshot` → `스냅샷`, `persist` → `저장`, `retry` → `재시도`, `focused test` → `변경 범위 테스트`. Choose one wording per concept and reuse it.
- Prefer “워커는 작업의 소유권을 확인한 뒤 결과를 저장해요” over “worker는 job ownership을 확인한 뒤 result를 persist해요”. Both sentences must still be supported by the same source evidence.
- Do not translate an identifier to make a sentence look more Korean. Keep `leaseOwner`, `MixingJob`, and `pnpm test` unchanged, and add a short Korean gloss the first time an unfamiliar English term appears.
- Follow the official spelling and capitalization of tools, languages, and products, in prose as well as in code. Write `JavaScript`, `PostgreSQL`, `Node.js`, and `Next.js` as their own documentation writes them.
- Spell out an abbreviation the first time it appears on a page, with the full name in parentheses and no space before the parenthesis: `SSR(Server-Side Rendering)`, `E2E(end-to-end)`. For an English abbreviation, include the English full name. Use the abbreviation alone after that. Terms the repository itself uses as product or protocol names, such as `API`, `HTTP`, `JSON`, and `OAuth`, need no expansion.
- Pick one spelling for loanwords and keep it. Follow the wording already used in tracked code, configuration, and existing pages before inventing a new one. When usage is split, decide once and record the choice in the project's own instructions outside the lee-spec-kit managed block, then use it everywhere.

## Cut empty Sino-Korean verbs

`수행하다`, `실행하다`, `진행하다`, and `실시하다` usually carry no meaning. Delete them and keep the concrete verb.

- Prefer “워커가 lease를 갱신해요” over “워커가 lease 갱신을 수행해요”.
- Prefer “migration을 적용하세요” over “migration 적용을 진행하세요”.
- Turn English noun forms of actions back into Korean verbs. Prefer “트랜잭션 안에서 큐 수용량을 확인해요” over “큐 수용량 확인이 트랜잭션 안에서 수행돼요”.
- Keep the word when it is part of a real state or identifier, such as `PROCESSING` 상태나 “진행 중인 작업”.

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
