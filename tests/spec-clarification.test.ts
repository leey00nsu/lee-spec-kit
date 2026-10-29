import { describe, expect, test } from 'vitest';
import { parseSpecClarification } from '../src/utils/spec-clarification.js';

const complete =
  '- **Clarification Status**: Complete\n- **Clarification Summary**: Existing requirements and code settle the scope; no product questions remain.\n';
const record = (
  status = 'OPEN',
  id = 'SC-01'
) => `## ${id}: Missing report behavior
- **Status**: ${status}
- **Question**: Should a missing report block approval?
- **Options**: Authoring guidance; approval gate
- **Recommendation**: Require the report because it is the review surface.
- **Answer**: User chose an approval gate.
- **Decision**: Block approval when the report is absent.
- **Spec Refs**: FR-1; missing-report acceptance criterion
`;

describe('Spec decision discovery', () => {
  test('keeps legacy specs compatible but activates on recorded questions', () => {
    expect(
      parseSpecClarification('- **Status**: Approved', '# Decisions')
    ).toMatchObject({ enabled: false, ready: true, status: 'legacy' });
    expect(
      parseSpecClarification('- **Status**: Approved', record())
    ).toMatchObject({
      enabled: true,
      ready: false,
      openQuestionIds: ['SC-01'],
    });
  });

  test('records no-question completion without requiring a manufactured interview', () => {
    expect(parseSpecClarification(complete, '')).toMatchObject({
      ready: true,
      questions: [],
      errors: [],
    });
    expect(
      parseSpecClarification('- **Clarification Status**: Pending', '')
    ).toMatchObject({ ready: false, status: 'pending', errors: [] });
  });

  test('an OPEN question overrides a Complete check', () => {
    expect(parseSpecClarification(complete, record())).toMatchObject({
      ready: false,
      openQuestionIds: ['SC-01'],
    });
  });

  for (const status of ['RESOLVED', 'DELEGATED', 'DEFERRED']) {
    test(`${status} requires an answer, recorded disposition, and Spec references`, () => {
      expect(parseSpecClarification(complete, record(status))).toMatchObject({
        ready: true,
        errors: [],
      });
      for (const label of ['Answer', 'Decision', 'Spec Refs']) {
        const missing = record(status).replace(
          new RegExp(`- \\*\\*${label}\\*\\*:.*`),
          `- **${label}**: -`
        );
        const result = parseSpecClarification(complete, missing);
        expect(result.ready).toBe(false);
        expect(result.errors.join(' ')).toContain(label);
      }
    });
  }

  test('rejects empty summaries, invalid statuses, and duplicate fields or IDs', () => {
    for (const summary of ['', '-', 'TBD', '{summary}', '<summary>']) {
      const result = parseSpecClarification(
        `- **Clarification Status**: Complete\n- **Clarification Summary**: ${summary}`,
        ''
      );
      expect(result.ready).toBe(false);
    }
    expect(parseSpecClarification(complete, record('DONE')).ready).toBe(false);
    expect(
      parseSpecClarification(
        complete + '- **Clarification Status**: Pending',
        ''
      ).ready
    ).toBe(false);
    expect(
      parseSpecClarification(
        complete,
        record('RESOLVED') + record('RESOLVED', 'SC-1')
      ).ready
    ).toBe(false);
    expect(
      parseSpecClarification(
        complete,
        record('RESOLVED').replace(
          '- **Status**: RESOLVED',
          '- **Status**: OPEN\n- **Status**: RESOLVED'
        )
      ).ready
    ).toBe(false);
    expect(parseSpecClarification(complete, '## SC-oops: title').ready).toBe(
      false
    );
    expect(parseSpecClarification(complete, '## SC-01:').ready).toBe(false);
  });

  test('ignores fenced examples and comments without swallowing actual questions', () => {
    const examples = `<!-- ${record()} -->\n\n\
\`\`\`\`markdown\n${record()}\n\`\`\`\n${record()}\n\`\`\`\`\n~~~md\n${record()}\n~~~\n`;
    expect(parseSpecClarification(complete, examples)).toMatchObject({
      ready: true,
      questions: [],
    });
    expect(parseSpecClarification(complete, examples + record())).toMatchObject(
      { ready: false, openQuestionIds: ['SC-01'] }
    );
  });

  test('does not borrow missing fields from an adjacent ADR or another question', () => {
    const decisions =
      record('RESOLVED').replace(/- \*\*Answer\*\*:.*\n/, '') +
      '\n## D001: Other decision\n- **Answer**: Unrelated\n';
    expect(
      parseSpecClarification(complete, decisions).errors.join(' ')
    ).toContain('Answer');
  });

  test('comment syntax in code examples cannot hide subsequent actual questions', () => {
    for (const example of [
      '```html\n<!-- unfinished example\n```\n',
      '<!--\n```markdown\n-->\n',
    ]) {
      expect(
        parseSpecClarification(complete, example + record())
      ).toMatchObject({
        ready: false,
        openQuestionIds: ['SC-01'],
      });
    }
  });

  test('accepts Korean labels and CRLF while preserving question details', () => {
    const result = parseSpecClarification(
      '- **결정 점검 상태**: Complete\r\n- **결정 점검 요약**: 사용자가 보고서 승인 조건을 선택했고 FR-1에 반영했습니다.',
      '### SC-02: 보고서\r\n- **상태**: RESOLVED\r\n- **질문**: 누락을 차단할까요?\r\n- **선택지**: 지침; 차단\r\n- **추천**: 승인 전에 차단\r\n- **답변**: 사용자가 차단을 선택했습니다.\r\n- **결정**: 보고서를 승인 조건으로 사용합니다.\r\n- **Spec 반영**: FR-1'
    );
    expect(result).toMatchObject({
      ready: true,
      questions: [
        { id: 'SC-02', status: 'RESOLVED', question: '누락을 차단할까요?' },
      ],
    });
  });
});
