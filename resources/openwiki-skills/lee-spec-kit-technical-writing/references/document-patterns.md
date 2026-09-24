# Document patterns

Choose the dominant pattern from the reader's goal, not the source files available. These are writing patterns, not required paths, OKF `type` values, or a reason to regenerate an unaffected page. A page may contain a small supporting section of another pattern.

## Getting started

Use when a new reader needs the shortest reliable route to the project's main flow, prerequisites, and next useful page. Show the minimum setup and orientation supported by tracked evidence. A getting-started page need not promise a finished artifact. OpenWiki's required `quickstart.md` may instead be a compact navigation page.

## Tutorial

Use when the reader should learn by reaching a concrete, observable result.

1. State the result and the prerequisites needed to reach it.
2. Guide the reader through a safe sequence, explaining just enough at each step to continue.
3. Use commands and code examples present in or supported by tracked code and tests. Make a copy-paste example self-contained; if it depends on caller-provided variables, name those inputs and label it as a partial snippet. Include a checkpoint only when its expected result has evidence; never claim OpenWiki ran the example.
4. Put common, evidenced stumbling points after the main success path or link to a troubleshooting page. End with the next useful task or concept.

## How-to guide

Use when the reader already has a specific task, not when they need to learn the entire system.

1. Name the goal and required starting state.
2. Give ordered actions with exact commands, paths, and observable results when the evidence supports them.
3. Explain only branches that change the action; link to reference or explanation pages for deeper context.

## Troubleshooting

Use when the reader starts from a failure or unexpected behavior.

1. Name the observable symptom, including an exact error or safe log excerpt only when tracked evidence supports it.
2. Give checks that distinguish plausible causes. Keep the symptom separate from a confirmed cause; label uncertain causes as possibilities.
3. Give a remedy for each supported cause and a way to confirm recovery. Say which symptom the remedy resolves; if other inputs can still cause failure, do not promise unconditional success. State relevant environment, configuration, or version differences only when evidenced.
4. Explain briefly why a remedy works, or link to the page that owns that mechanism.

## Reference

Use when the reader needs accurate facts to look up during work.

1. Define scope, version assumptions, and any prerequisite needed to use the entries.
2. Organize entries with stable, searchable names and a consistent order.
3. When the contract has them, show type, requiredness, default, unit, allowed range or values, return value, and error outcome. Keep paths, commands, and identifiers exact.
4. Put repeated comparable fields, states, defaults, and limits in a table. Use prose to explain when the table applies and what changes it, not to repeat every row.
5. Add a grounded example that clarifies the contract without replacing its exact definition. If it is meant to be runnable, include its inputs and imports; otherwise label it as a partial snippet and name every caller-provided input. Recheck existing examples when updating their page, even if their surrounding prose remains accurate. Do not fabricate a success response or imply the example was executed in this run. Do not repeat the same contract in another table merely to list the tests that assert it.

## Explanation

Use when the reader needs a mental model or a reason behind behavior.

1. Lead with the core idea, boundary, or problem the design addresses.
2. Connect components through cause, data flow, ownership, and relevant prerequisites.
3. Explain why the structure exists only when repository evidence supports that reason; distinguish current behavior from requirements and historical decisions.
4. Use a focused Mermaid diagram or table when it makes a complex relationship clearer than prose and can be kept faithful to the inspected source. Do not add a diagram merely to decorate a page.
5. End with the practical implication for navigation or change.

Use goal-oriented titles when they help the reader choose a page: “Start CopySinger locally” for a tutorial, “Choose tests for a change” for a how-to, “Recover a failed job” for troubleshooting, and “Understand job leases” for an explanation. A stable noun such as “Environment variables” is often clearer for reference than an artificial action title.
