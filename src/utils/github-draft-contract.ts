import { Lang } from './i18n.js';
import type { BuiltinDocId } from './builtin-docs.js';

export type GithubDraftKind = 'issue' | 'pr';
export type GithubDraftArtifactId = 'screenshots' | 'mermaid';
export type GithubDraftBodyRule = 'image-markdown' | 'mermaid-fence';

interface GithubDraftArtifactContract {
  id: GithubDraftArtifactId;
  headings: Record<Lang, string>;
  bodyRule: GithubDraftBodyRule;
}

interface GithubDraftContractDefinition {
  kind: GithubDraftKind;
  requiredSections: Record<Lang, string[]>;
  artifacts: GithubDraftArtifactContract[];
}

export interface GithubDraftContractView {
  kind: GithubDraftKind;
  requiredSections: string[];
  artifacts: Array<{
    id: GithubDraftArtifactId;
    section: string;
    bodyRule: GithubDraftBodyRule;
  }>;
}

const ISSUE_CONTRACT: GithubDraftContractDefinition = {
  kind: 'issue',
  requiredSections: {
    ko: ['개요', '목표', '완료 기준', '관련 문서', '라벨'],
    en: ['Overview', 'Goals', 'Completion Criteria', 'Related Documents', 'Labels'],
  },
  artifacts: [],
};

const PR_CONTRACT: GithubDraftContractDefinition = {
  kind: 'pr',
  requiredSections: {
    ko: ['개요', '변경 사항', '테스트', '관련 문서'],
    en: ['Overview', 'Changes', 'Tests', 'Related Documents'],
  },
  artifacts: [
    {
      id: 'screenshots',
      headings: { ko: '스크린샷', en: 'Screenshots' },
      bodyRule: 'image-markdown',
    },
    {
      id: 'mermaid',
      headings: { ko: '아키텍처 다이어그램', en: 'Architecture Diagram' },
      bodyRule: 'mermaid-fence',
    },
  ],
};

const CONTRACTS: Record<GithubDraftKind, GithubDraftContractDefinition> = {
  issue: ISSUE_CONTRACT,
  pr: PR_CONTRACT,
};

export function getGithubDraftContractDefinition(
  kind: GithubDraftKind
): GithubDraftContractDefinition {
  return CONTRACTS[kind];
}

export function getGithubDraftRequiredSections(
  kind: GithubDraftKind,
  lang: Lang
): string[] {
  return [...CONTRACTS[kind].requiredSections[lang]];
}

export function getGithubDraftArtifactHeading(
  kind: GithubDraftKind,
  artifactId: GithubDraftArtifactId,
  lang: Lang
): string | null {
  const artifact = CONTRACTS[kind].artifacts.find((item) => item.id === artifactId);
  if (!artifact) return null;
  return artifact.headings[lang];
}

export function getGithubDraftContractView(
  kind: GithubDraftKind,
  lang: Lang
): GithubDraftContractView {
  const definition = CONTRACTS[kind];
  return {
    kind: definition.kind,
    requiredSections: [...definition.requiredSections[lang]],
    artifacts: definition.artifacts.map((artifact) => ({
      id: artifact.id,
      section: artifact.headings[lang],
      bodyRule: artifact.bodyRule,
    })),
  };
}

export function getGithubDraftContractForBuiltinDoc(
  docId: BuiltinDocId,
  lang: Lang
): GithubDraftContractView | null {
  if (docId === 'create-issue' || docId === 'issue-template') {
    return getGithubDraftContractView('issue', lang);
  }
  if (docId === 'create-pr' || docId === 'pr-template') {
    return getGithubDraftContractView('pr', lang);
  }
  return null;
}
