import type { UserMessage } from '@stagewise/agent-interface/agent';
import type { CoreMessage } from 'ai';

export function isUserMessage(
  message: CoreMessage | UserMessage,
): message is UserMessage {
  return !('role' in message);
}
