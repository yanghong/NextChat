import {
  buildLearningLaunchMessage,
  parseLearningCommand,
} from "../utils/learning";

export type LearningCommandSubmitHandlers = {
  startLearningMode: (intent: string) => void;
  stopLearningMode: () => void;
  sendLearningMessage: (message: string) => Promise<unknown>;
  onStart?: (intent: string) => void;
  onStop?: () => void;
};

export type LearningCommandSubmitResult =
  | { handled: false; pending?: undefined }
  | { handled: true; pending?: Promise<unknown> };

export function handleLearningCommandSubmit(
  userInput: string,
  handlers: LearningCommandSubmitHandlers,
): LearningCommandSubmitResult {
  const learningCommand = parseLearningCommand(userInput);

  if (learningCommand.type === "stop") {
    handlers.stopLearningMode();
    handlers.onStop?.();
    return { handled: true };
  }

  if (learningCommand.type !== "start") {
    return { handled: false };
  }

  const intent = learningCommand.intent;
  const launchMessage = buildLearningLaunchMessage(intent);
  handlers.startLearningMode(intent);
  handlers.onStart?.(intent);

  let pending: Promise<unknown>;
  try {
    pending = Promise.resolve(handlers.sendLearningMessage(launchMessage));
  } catch (error) {
    pending = Promise.reject(error);
  }

  return { handled: true, pending };
}
