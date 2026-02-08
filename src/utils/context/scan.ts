import fs from 'fs-extra';
import { glob } from 'glob';
import { ProjectConfig } from '../config.js';
import { getCurrentBranch, resolveProjectGitCwd } from './git.js';
import { parseFeature } from './parse.js';
import { getStepDefinitions } from './steps.js';
import { FeatureContext } from './types.js';

export async function scanFeatures(config: ProjectConfig): Promise<{
  features: FeatureContext[];
  branches: {
    docs: string;
    project: { single?: string; fe?: string; be?: string };
  };
  warnings: string[];
}> {
  const features: FeatureContext[] = [];
  const warnings: string[] = [];
  const stepDefinitions = getStepDefinitions(config.lang, config.workflow);

  const docsBranch = getCurrentBranch(config.docsDir);

  const projectBranches: { single: string; fe: string; be: string } = {
    single: '',
    fe: '',
    be: '',
  };
  let singleProject: { cwd: string | null; warning?: string } | undefined;
  let feProject: { cwd: string | null; warning?: string } | undefined;
  let beProject: { cwd: string | null; warning?: string } | undefined;

  if (config.projectType === 'single') {
    singleProject = resolveProjectGitCwd(config, 'single');
    if (singleProject.warning) warnings.push(singleProject.warning);
    projectBranches.single = singleProject.cwd ? getCurrentBranch(singleProject.cwd) : '';
  } else {
    feProject = resolveProjectGitCwd(config, 'fe');
    beProject = resolveProjectGitCwd(config, 'be');
    if (feProject.warning) warnings.push(feProject.warning);
    if (beProject.warning) warnings.push(beProject.warning);
    projectBranches.fe = feProject.cwd ? getCurrentBranch(feProject.cwd) : '';
    projectBranches.be = beProject.cwd ? getCurrentBranch(beProject.cwd) : '';
  }

  if (config.projectType === 'single') {
    const featureDirs = await glob('features/*/', {
      cwd: config.docsDir,
      absolute: true,
      ignore: ['**/feature-base/**'],
    });

    for (const dir of featureDirs) {
      if ((await fs.stat(dir)).isDirectory()) {
        features.push(
          await parseFeature(
            dir,
            'single',
            {
              projectBranch: projectBranches.single,
              docsBranch,
              docsGitCwd: config.docsDir,
              projectGitCwd: singleProject?.cwd ?? undefined,
              docsDir: config.docsDir,
              projectBranchAvailable: Boolean(singleProject?.cwd),
            },
            {
              lang: config.lang,
              stepDefinitions,
              approval: config.approval,
              workflow: config.workflow,
            }
          )
        );
      }
    }
  } else {
    const feDirs = await glob('features/fe/*/', { cwd: config.docsDir, absolute: true });
    const beDirs = await glob('features/be/*/', { cwd: config.docsDir, absolute: true });

    for (const dir of feDirs) {
      if ((await fs.stat(dir)).isDirectory()) {
        features.push(
          await parseFeature(
            dir,
            'fe',
            {
              projectBranch: projectBranches.fe,
              docsBranch,
              docsGitCwd: config.docsDir,
              projectGitCwd: feProject?.cwd ?? undefined,
              docsDir: config.docsDir,
              projectBranchAvailable: Boolean(feProject?.cwd),
            },
            {
              lang: config.lang,
              stepDefinitions,
              approval: config.approval,
              workflow: config.workflow,
            }
          )
        );
      }
    }
    for (const dir of beDirs) {
      if ((await fs.stat(dir)).isDirectory()) {
        features.push(
          await parseFeature(
            dir,
            'be',
            {
              projectBranch: projectBranches.be,
              docsBranch,
              docsGitCwd: config.docsDir,
              projectGitCwd: beProject?.cwd ?? undefined,
              docsDir: config.docsDir,
              projectBranchAvailable: Boolean(beProject?.cwd),
            },
            {
              lang: config.lang,
              stepDefinitions,
              approval: config.approval,
              workflow: config.workflow,
            }
          )
        );
      }
    }
  }

  return {
    features,
    branches: {
      docs: docsBranch,
      project:
        config.projectType === 'single'
          ? { single: projectBranches.single }
          : { fe: projectBranches.fe, be: projectBranches.be },
    },
    warnings,
  };
}
