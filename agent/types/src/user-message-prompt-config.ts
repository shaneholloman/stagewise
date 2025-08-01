import { z } from 'zod';
import { userMessageSchema } from '@stagewise/agent-interface/toolbar';

export const userMessagePromptConfigSchema = z.object({
  userMessage: userMessageSchema,
});

export type UserMessagePromptConfig = z.infer<
  typeof userMessagePromptConfigSchema
>;
