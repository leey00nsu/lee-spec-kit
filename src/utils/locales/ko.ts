import { koCli } from './ko/cli.js';
import { koContext } from './ko/context.js';
import { koSteps } from './ko/steps.js';
import { koMessages } from './ko/messages.js';
import { koWarnings } from './ko/warnings.js';

const ko = {
  cli: {
    ...koCli,
    ...koContext,
  },
  steps: koSteps,
  messages: koMessages,
  warnings: koWarnings,
} as const;

export default ko;
