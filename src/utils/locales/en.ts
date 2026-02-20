import { enCli } from './en/cli.js';
import { enContext } from './en/context.js';
import { enSteps } from './en/steps.js';
import { enMessages } from './en/messages.js';
import { enWarnings } from './en/warnings.js';

const en = {
  cli: {
    ...enCli,
    ...enContext,
  },
  steps: enSteps,
  messages: enMessages,
  warnings: enWarnings,
} as const;

export default en;
