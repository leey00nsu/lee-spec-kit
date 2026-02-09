import fs from 'fs-extra';
import { glob } from 'glob';
import { ProjectConfig } from '../config.js';
import { resolveProjectComponents } from '../components.js';
import { getCurrentBranch, resolveProjectGitCwd } from './git.js';
import { parseFeature } from './parse.js';
import { getStepDefinitions } from './steps.js';
import { FeatureContext } from './types.js';

export async function scanFeatures(config: ProjectConfig): Promise<{
  features: FeatureContext[];
  branches: {
    docs: string;
    project: Record<string, string>;
  };
  warnings: string[];
}> {
  const features: FeatureContext[] = [];
  const warnings: string[] = [];
  const stepDefinitions = getStepDefinitions(config.lang, config.workflow);

  const docsBranch = getCurrentBranch(config.docsDir);

  const projectBranches: Record<string, string> = {};
  let singleProject: { cwd: string | null; warning?: string } | undefined;

  if (config.projectType === 'single') {
    singleProject = resolveProjectGitCwd(config, 'single');
    if (singleProject.warning) warnings.push(singleProject.warning);
    projectBranches.single = singleProject.cwd ? getCurrentBranch(singleProject.cwd) : '';
  } else {
    const components = resolveProjectComponents(config.projectType, config.components);
    for (const component of components) {
      const project = resolveProjectGitCwd(config, component);
      if (project.warning) warnings.push(project.warning);
      projectBranches[component] = project.cwd ? getCurrentBranch(project.cwd) : '';
    }
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
              projectType: config.projectType,
            }
          )
        );
      }
    }
  } else {
    const components = resolveProjectComponents(config.projectType, config.components);
    for (const component of components) {
      const project = resolveProjectGitCwd(config, component);
      const componentDirs = await glob(`features/${component}/*/`, {
        cwd: config.docsDir,
        absolute: true,
      });
      for (const dir of componentDirs) {
        if (!(await fs.stat(dir)).isDirectory()) continue;
        features.push(
          await parseFeature(
            dir,
            component,
            {
              projectBranch: projectBranches[component] || '',
              docsBranch,
              docsGitCwd: config.docsDir,
              projectGitCwd: project.cwd ?? undefined,
              docsDir: config.docsDir,
              projectBranchAvailable: Boolean(project.cwd),
            },
            {
              lang: config.lang,
              stepDefinitions,
              approval: config.approval,
              workflow: config.workflow,
              projectType: config.projectType,
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
      project: projectBranches,
    },
    warnings,
  };
}
