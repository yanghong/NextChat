import {
  getMessageTextContent,
  isImageGenerationModel,
  safeLocalStorage,
  trimTopic,
} from "../utils";

import { indexedDBStorage } from "@/app/utils/indexedDB-storage";
import { nanoid } from "nanoid";
import type {
  ClientApi,
  MultimodalContent,
  RequestMessage,
} from "../client/api";
import { getClientApi } from "../client/api";
import {
  fetchRemoteChatSessions,
  saveRemoteChatSessions,
} from "../client/chat-sessions";
import { ChatControllerPool } from "../client/controller";
import { showToast } from "../components/ui-lib";
import {
  DEFAULT_INPUT_TEMPLATE,
  DEFAULT_MODELS,
  DEFAULT_SYSTEM_TEMPLATE,
  GEMINI_SUMMARIZE_MODEL,
  DEEPSEEK_SUMMARIZE_MODEL,
  KnowledgeCutOffDate,
  MCP_SYSTEM_TEMPLATE,
  MCP_TOOLS_TEMPLATE,
  ServiceProvider,
  StoreKey,
  SUMMARIZE_MODEL,
} from "../constant";
import Locale, { getLang } from "../locales";
import { prettyObject } from "../utils/format";
import {
  buildLearningSystemPrompt,
  createDefaultLearningMode,
  LearningModeState,
} from "../utils/learning";
import { createPersistStore } from "../utils/store";
import { estimateTokenLength } from "../utils/token";
import { ModelConfig, ModelType, useAppConfig } from "./config";
import { useAccessStore } from "./access";
import { collectModelsWithDefaultModel } from "../utils/model";
import { createEmptyMask, DEFAULT_MASK_AVATAR, Mask } from "./mask";
import { executeMcpAction, getAllTools, isMcpEnabled } from "../mcp/actions";
import { extractMcpJson, isMcpJson } from "../mcp/utils";

const localStorage = safeLocalStorage();

export type ChatMessageTool = {
  id: string;
  index?: number;
  type?: string;
  function?: {
    name: string;
    arguments?: string;
  };
  content?: string;
  isError?: boolean;
  errorMsg?: string;
};

export type ChatMessage = RequestMessage & {
  date: string;
  streaming?: boolean;
  isError?: boolean;
  id: string;
  model?: ModelType;
  tools?: ChatMessageTool[];
  audio_url?: string;
  isMcpResponse?: boolean;
};

export function createMessage(override: Partial<ChatMessage>): ChatMessage {
  return {
    id: nanoid(),
    date: new Date().toLocaleString(),
    role: "user",
    content: "",
    ...override,
  };
}

export interface ChatStat {
  tokenCount: number;
  wordCount: number;
  charCount: number;
}

export interface ChatSession {
  id: string;
  topic: string;

  memoryPrompt: string;
  messages: ChatMessage[];
  stat: ChatStat;
  lastUpdate: number;
  lastSummarizeIndex: number;
  clearContextIndex?: number;

  mask: Mask;
  learning?: LearningModeState;
}

type ChatInputOptions = {
  onError?: (error: Error) => boolean;
};

export const DEFAULT_TOPIC = Locale.Store.DefaultTopic;
export const BOT_HELLO: ChatMessage = createMessage({
  role: "assistant",
  content: Locale.Store.BotHello,
});

const LEARNING_PHASES = [
  "diagnosing",
  "planning",
  "learning",
  "reviewing",
] as const;

function isLearningPhase(phase: unknown): phase is LearningModeState["phase"] {
  return LEARNING_PHASES.includes(phase as LearningModeState["phase"]);
}

function safeLearningText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeLearningUpdatedAt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Date.now();
}

function normalizeSessionMask(session: ChatSession): ChatSession {
  const fallbackMask = createEmptyMask();
  const modelConfig = session.mask?.modelConfig;

  session.mask = {
    ...fallbackMask,
    ...session.mask,
    name: DEFAULT_TOPIC,
    avatar: DEFAULT_MASK_AVATAR,
    context: [],
    hideContext: false,
    syncGlobalConfig: true,
    modelConfig: {
      ...fallbackMask.modelConfig,
      ...modelConfig,
    },
  };

  return session;
}

function normalizeSessionLearning(session: ChatSession): ChatSession {
  if (!session.learning) return session;

  session.learning = {
    enabled: Boolean(session.learning.enabled),
    phase: isLearningPhase(session.learning.phase)
      ? session.learning.phase
      : "diagnosing",
    initialIntent: safeLearningText(session.learning.initialIntent),
    summary: safeLearningText(session.learning.summary),
    updatedAt: safeLearningUpdatedAt(session.learning.updatedAt),
  };

  return session;
}

function normalizeSession(session: ChatSession): ChatSession {
  return normalizeSessionLearning(normalizeSessionMask(session));
}

function normalizeSessions(sessions: ChatSession[]): ChatSession[] {
  return sessions.map((session) => normalizeSession(session));
}

function createEmptySession(): ChatSession {
  return normalizeSession({
    id: nanoid(),
    topic: DEFAULT_TOPIC,
    memoryPrompt: "",
    messages: [],
    stat: {
      tokenCount: 0,
      wordCount: 0,
      charCount: 0,
    },
    lastUpdate: Date.now(),
    lastSummarizeIndex: 0,

    mask: createEmptyMask(),
  });
}

function getSummarizeModel(
  currentModel: string,
  providerName: string,
): string[] {
  // if it is using gpt-* models, force to use 4o-mini to summarize
  if (currentModel.startsWith("gpt") || currentModel.startsWith("chatgpt")) {
    const configStore = useAppConfig.getState();
    const accessStore = useAccessStore.getState();
    const allModel = collectModelsWithDefaultModel(
      configStore.models,
      [configStore.customModels, accessStore.customModels].join(","),
      accessStore.defaultModel,
    );
    const summarizeModel = allModel.find(
      (m) => m.name === SUMMARIZE_MODEL && m.available,
    );
    if (summarizeModel) {
      return [
        summarizeModel.name,
        summarizeModel.provider?.providerName as string,
      ];
    }
  }
  if (currentModel.startsWith("gemini")) {
    return [GEMINI_SUMMARIZE_MODEL, ServiceProvider.Google];
  } else if (currentModel.startsWith("deepseek-")) {
    return [DEEPSEEK_SUMMARIZE_MODEL, ServiceProvider.DeepSeek];
  }

  return [currentModel, providerName];
}

function countMessages(msgs: ChatMessage[]) {
  return msgs.reduce(
    (pre, cur) => pre + estimateTokenLength(getMessageTextContent(cur)),
    0,
  );
}

function fillTemplateWith(input: string, modelConfig: ModelConfig) {
  const cutoff =
    KnowledgeCutOffDate[modelConfig.model] ?? KnowledgeCutOffDate.default;
  // Find the model in the DEFAULT_MODELS array that matches the modelConfig.model
  const modelInfo = DEFAULT_MODELS.find((m) => m.name === modelConfig.model);

  var serviceProvider = "OpenAI";
  if (modelInfo) {
    // TODO: auto detect the providerName from the modelConfig.model

    // Directly use the providerName from the modelInfo
    serviceProvider = modelInfo.provider.providerName;
  }

  const vars = {
    ServiceProvider: serviceProvider,
    cutoff,
    model: modelConfig.model,
    time: new Date().toString(),
    lang: getLang(),
    input: input,
  };

  let output = modelConfig.template ?? DEFAULT_INPUT_TEMPLATE;

  // remove duplicate
  if (input.startsWith(output)) {
    output = "";
  }

  // must contains {{input}}
  const inputVar = "{{input}}";
  if (!output.includes(inputVar)) {
    output += "\n" + inputVar;
  }

  Object.entries(vars).forEach(([name, value]) => {
    const regex = new RegExp(`{{${name}}}`, "g");
    output = output.replace(regex, value.toString()); // Ensure value is a string
  });

  return output;
}

async function getMcpSystemPrompt(): Promise<string> {
  const tools = await getAllTools();

  let toolsStr = "";

  tools.forEach((i) => {
    // error client has no tools
    if (!i.tools) return;

    toolsStr += MCP_TOOLS_TEMPLATE.replace(
      "{{ clientId }}",
      i.clientId,
    ).replace(
      "{{ tools }}",
      i.tools.tools.map((p: object) => JSON.stringify(p, null, 2)).join("\n"),
    );
  });

  return MCP_SYSTEM_TEMPLATE.replace("{{ MCP_TOOLS }}", toolsStr);
}

const DEFAULT_SESSION = createEmptySession();

const DEFAULT_CHAT_STATE = {
  sessions: [DEFAULT_SESSION],
  currentSessionIndex: 0,
  currentSessionId: DEFAULT_SESSION.id as string | undefined,
  lastInput: "",
  serverSessionsLoaded: false,
};

export const useChatStore = createPersistStore(
  DEFAULT_CHAT_STATE,
  (set, _get) => {
    function get() {
      return {
        ..._get(),
        ...methods,
      };
    }

    const methods = {
      forkSession() {
        // 获取当前会话
        const currentSession = get().currentSession();
        if (!currentSession) return;

        const newSession = createEmptySession();

        newSession.topic = currentSession.topic;
        // 深拷贝消息
        newSession.messages = currentSession.messages.map((msg) => ({
          ...msg,
          id: nanoid(), // 生成新的消息 ID
        }));
        newSession.mask = {
          ...currentSession.mask,
          modelConfig: {
            ...currentSession.mask.modelConfig,
          },
        };

        set((state) => ({
          currentSessionIndex: 0,
          currentSessionId: newSession.id,
          sessions: [newSession, ...state.sessions],
        }));
        void get().saveRemoteSessions();
      },

      clearSessions() {
        const session = createEmptySession();
        set(() => ({
          sessions: [session],
          currentSessionIndex: 0,
          currentSessionId: session.id,
        }));
        void get().saveRemoteSessions();
      },

      selectSession(index: number) {
        const sessions = get().sessions;
        const selectedIndex = Math.min(sessions.length - 1, Math.max(0, index));
        const selectedSession = sessions[selectedIndex];
        set({
          currentSessionIndex: selectedIndex,
          currentSessionId: selectedSession?.id,
        });
      },

      moveSession(from: number, to: number) {
        set((state) => {
          const { sessions, currentSessionIndex: oldIndex } = state;
          const currentSessionId =
            state.currentSessionId ?? sessions[oldIndex]?.id;

          // move the session
          const newSessions = [...sessions];
          const session = newSessions[from];
          newSessions.splice(from, 1);
          newSessions.splice(to, 0, session);

          const newIndex = Math.max(
            0,
            newSessions.findIndex((session) => session.id === currentSessionId),
          );

          return {
            currentSessionIndex: newIndex,
            currentSessionId: newSessions[newIndex]?.id,
            sessions: newSessions,
          };
        });
        void get().saveRemoteSessions();
      },

      newSession(_mask?: Mask) {
        const session = createEmptySession();

        set((state) => ({
          currentSessionIndex: 0,
          currentSessionId: session.id,
          sessions: [session].concat(state.sessions),
        }));
        void get().saveRemoteSessions();
      },

      startLearningMode(initialIntent: string = "") {
        const session = get().currentSession();
        get().updateTargetSession(session, (session) => {
          session.learning = createDefaultLearningMode(initialIntent);
        });
        void get().saveRemoteSessions();
      },

      stopLearningMode() {
        const session = get().currentSession();
        get().updateTargetSession(session, (session) => {
          if (!session.learning) {
            session.learning = {
              enabled: false,
              phase: "diagnosing",
              updatedAt: Date.now(),
            };
            return;
          }
          session.learning.enabled = false;
          session.learning.updatedAt = Date.now();
        });
        void get().saveRemoteSessions();
      },

      updateLearningMode(updater: (learning: LearningModeState) => void) {
        const session = get().currentSession();
        get().updateTargetSession(session, (session) => {
          const learning = session.learning ?? {
            ...createDefaultLearningMode(),
            enabled: false,
          };
          updater(learning);
          learning.updatedAt = Date.now();
          session.learning = learning;
        });
        void get().saveRemoteSessions();
      },

      nextSession(delta: number) {
        const n = get().sessions.length;
        const limit = (x: number) => (x + n) % n;
        const i = get().currentSessionIndex;
        get().selectSession(limit(i + delta));
      },

      deleteSession(index: number) {
        const deletingLastSession = get().sessions.length === 1;
        const deletedSession = get().sessions.at(index);

        if (!deletedSession) return;

        const sessions = get().sessions.slice();
        sessions.splice(index, 1);

        const currentSession = get().currentSession();
        const currentSessionId = currentSession?.id;
        let nextIndex: number;

        if (deletingLastSession) {
          nextIndex = 0;
          sessions.push(createEmptySession());
        } else if (deletedSession.id === currentSessionId) {
          nextIndex = Math.min(index, sessions.length - 1);
        } else {
          nextIndex = Math.max(
            0,
            sessions.findIndex((session) => session.id === currentSessionId),
          );
        }

        // for undo delete action
        const restoreState = {
          currentSessionIndex: get().currentSessionIndex,
          currentSessionId: get().currentSessionId,
          sessions: get().sessions.slice(),
        };

        set(() => ({
          currentSessionIndex: nextIndex,
          currentSessionId: sessions[nextIndex]?.id,
          sessions,
        }));
        void get().saveRemoteSessions();

        showToast(
          Locale.Home.DeleteToast,
          {
            text: Locale.Home.Revert,
            onClick() {
              set(() => restoreState);
              void get().saveRemoteSessions();
            },
          },
          5000,
        );
      },

      currentSession() {
        const sessions = get().sessions;
        const currentSessionId = get().currentSessionId;
        let index = currentSessionId
          ? sessions.findIndex((session) => session.id === currentSessionId)
          : -1;

        if (index < 0 || index >= sessions.length) {
          index = get().currentSessionIndex;
          index = Math.min(sessions.length - 1, Math.max(0, index));
        }

        const session = sessions[index];
        if (
          session &&
          (index !== get().currentSessionIndex ||
            session.id !== get().currentSessionId)
        ) {
          set(() => ({
            currentSessionIndex: index,
            currentSessionId: session.id,
          }));
        }

        return session;
      },

      onNewMessage(message: ChatMessage, targetSession: ChatSession) {
        get().updateTargetSession(targetSession, (session) => {
          session.messages = session.messages.concat();
          session.lastUpdate = Date.now();
        });

        get().updateStat(message, targetSession);

        get().checkMcpJson(message);

        get().summarizeSession(false, targetSession);
      },

      async onUserInput(
        content: string,
        attachImages?: string[],
        isMcpResponse?: boolean,
        options?: ChatInputOptions,
      ) {
        const session = get().currentSession();
        const modelConfig = session.mask.modelConfig;

        // MCP Response no need to fill template
        let mContent: string | MultimodalContent[] = isMcpResponse
          ? content
          : fillTemplateWith(content, modelConfig);

        if (!isMcpResponse && attachImages && attachImages.length > 0) {
          mContent = [
            ...(content ? [{ type: "text" as const, text: content }] : []),
            ...attachImages.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ];
        }

        let userMessage: ChatMessage = createMessage({
          role: "user",
          content: mContent,
          isMcpResponse,
        });

        const botMessage: ChatMessage = createMessage({
          role: "assistant",
          streaming: true,
          model: modelConfig.model,
        });

        // get recent messages
        const recentMessages = await get().getMessagesWithMemory();
        const sendMessages = recentMessages.concat(userMessage);
        const messageIndex = session.messages.length + 1;

        // save user's and bot's message
        get().updateTargetSession(session, (session) => {
          const savedUserMessage = {
            ...userMessage,
            content: mContent,
          };
          session.messages = session.messages.concat([
            savedUserMessage,
            botMessage,
          ]);
        });

        const api: ClientApi = getClientApi(modelConfig.providerName);
        const removePendingMessages = () => {
          const pendingUserText = getMessageTextContent(userMessage);
          set((state) => ({
            sessions: state.sessions.map((session) => ({
              ...session,
              messages: session.messages.filter(
                (message) =>
                  message.id !== userMessage.id &&
                  message.id !== botMessage.id &&
                  !(
                    message.role === "user" &&
                    getMessageTextContent(message) === pendingUserText
                  ),
              ),
            })),
          }));
        };

        // make request
        api.llm.chat({
          messages: sendMessages,
          config: { ...modelConfig, stream: true },
          onUpdate(message) {
            botMessage.streaming = true;
            if (message) {
              botMessage.content = message;
            }
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          async onFinish(message) {
            botMessage.streaming = false;
            if (message) {
              if (options?.onError?.(new Error(message))) {
                removePendingMessages();
                ChatControllerPool.remove(session.id, botMessage.id);
                return;
              }

              botMessage.content = message;
              botMessage.date = new Date().toLocaleString();
              get().onNewMessage(botMessage, session);
              void get().saveRemoteSessions();
            }
            ChatControllerPool.remove(session.id, botMessage.id);
          },
          onBeforeTool(tool: ChatMessageTool) {
            (botMessage.tools = botMessage?.tools || []).push(tool);
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          onAfterTool(tool: ChatMessageTool) {
            botMessage?.tools?.forEach((t, i, tools) => {
              if (tool.id == t.id) {
                tools[i] = { ...tool };
              }
            });
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          onError(error) {
            const isAborted = error.message?.includes?.("aborted");
            const handledByUI = !isAborted && options?.onError?.(error);
            if (handledByUI) {
              botMessage.streaming = false;
              removePendingMessages();
              ChatControllerPool.remove(
                session.id,
                botMessage.id ?? messageIndex,
              );
              console.error("[Chat] failed ", error);
              return;
            }

            botMessage.content +=
              "\n\n" +
              prettyObject({
                error: true,
                message: error.message,
              });
            botMessage.streaming = false;
            userMessage.isError = !isAborted;
            botMessage.isError = !isAborted;
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
            ChatControllerPool.remove(
              session.id,
              botMessage.id ?? messageIndex,
            );

            console.error("[Chat] failed ", error);
          },
          onController(controller) {
            // collect controller for stop/retry
            ChatControllerPool.addController(
              session.id,
              botMessage.id ?? messageIndex,
              controller,
            );
          },
        });
      },

      getMemoryPrompt() {
        const session = get().currentSession();

        if (session.memoryPrompt.length) {
          return {
            role: "system",
            content: Locale.Store.Prompt.History(session.memoryPrompt),
            date: "",
          } as ChatMessage;
        }
      },

      async getMessagesWithMemory() {
        const session = get().currentSession();
        const modelConfig = session.mask.modelConfig;
        const clearContextIndex = session.clearContextIndex ?? 0;
        const messages = session.messages.slice();
        const totalMessageCount = session.messages.length;

        // in-context prompts
        const contextPrompts = session.mask.context.slice();

        // system prompts, to get close to OpenAI Web ChatGPT
        const shouldInjectSystemPrompts =
          modelConfig.enableInjectSystemPrompts &&
          (session.mask.modelConfig.model.startsWith("gpt-") ||
            session.mask.modelConfig.model.startsWith("chatgpt-"));

        const mcpEnabled = await isMcpEnabled();
        const mcpSystemPrompt = mcpEnabled ? await getMcpSystemPrompt() : "";

        var systemPrompts: ChatMessage[] = [];

        if (shouldInjectSystemPrompts) {
          systemPrompts = [
            createMessage({
              role: "system",
              content:
                fillTemplateWith("", {
                  ...modelConfig,
                  template: DEFAULT_SYSTEM_TEMPLATE,
                }) + mcpSystemPrompt,
            }),
          ];
        } else if (mcpEnabled) {
          systemPrompts = [
            createMessage({
              role: "system",
              content: mcpSystemPrompt,
            }),
          ];
        }

        if (shouldInjectSystemPrompts || mcpEnabled) {
          console.log(
            "[Global System Prompt] ",
            systemPrompts.at(0)?.content ?? "empty",
          );
        }

        const learningSystemPrompt = session.learning?.enabled
          ? buildLearningSystemPrompt(session.learning)
          : "";

        if (learningSystemPrompt) {
          if (systemPrompts.length > 0) {
            systemPrompts[0].content = [
              getMessageTextContent(systemPrompts[0]),
              learningSystemPrompt,
            ].join("\n\n");
          } else {
            systemPrompts = [
              createMessage({
                role: "system",
                content: learningSystemPrompt,
              }),
            ];
          }
        }

        const memoryPrompt = get().getMemoryPrompt();
        // long term memory
        const shouldSendLongTermMemory =
          modelConfig.sendMemory &&
          session.memoryPrompt &&
          session.memoryPrompt.length > 0 &&
          session.lastSummarizeIndex > clearContextIndex;
        const longTermMemoryPrompts =
          shouldSendLongTermMemory && memoryPrompt ? [memoryPrompt] : [];
        const longTermMemoryStartIndex = session.lastSummarizeIndex;

        // short term memory
        const shortTermMemoryStartIndex = Math.max(
          0,
          totalMessageCount - modelConfig.historyMessageCount,
        );

        // lets concat send messages, including 4 parts:
        // 0. system prompt: to get close to OpenAI Web ChatGPT
        // 1. long term memory: summarized memory messages
        // 2. pre-defined in-context prompts
        // 3. short term memory: latest n messages
        // 4. newest input message
        const memoryStartIndex = shouldSendLongTermMemory
          ? Math.min(longTermMemoryStartIndex, shortTermMemoryStartIndex)
          : shortTermMemoryStartIndex;
        // and if user has cleared history messages, we should exclude the memory too.
        const contextStartIndex = Math.max(clearContextIndex, memoryStartIndex);
        const maxTokenThreshold = modelConfig.max_tokens;

        // get recent messages as much as possible
        const reversedRecentMessages = [];
        for (
          let i = totalMessageCount - 1, tokenCount = 0;
          i >= contextStartIndex && tokenCount < maxTokenThreshold;
          i -= 1
        ) {
          const msg = messages[i];
          if (!msg || msg.isError) continue;
          tokenCount += estimateTokenLength(getMessageTextContent(msg));
          reversedRecentMessages.push(msg);
        }
        // concat all messages
        const recentMessages = [
          ...systemPrompts,
          ...longTermMemoryPrompts,
          ...contextPrompts,
          ...reversedRecentMessages.reverse(),
        ];

        return recentMessages;
      },

      updateMessage(
        sessionIndex: number,
        messageIndex: number,
        updater: (message?: ChatMessage) => void,
      ) {
        const sessions = get().sessions;
        const session = sessions.at(sessionIndex);
        const messages = session?.messages;
        updater(messages?.at(messageIndex));
        set(() => ({ sessions }));
      },

      resetSession(session: ChatSession) {
        get().updateTargetSession(session, (session) => {
          session.messages = [];
          session.memoryPrompt = "";
        });
      },

      summarizeSession(
        refreshTitle: boolean = false,
        targetSession: ChatSession,
      ) {
        const config = useAppConfig.getState();
        const session = targetSession;
        const modelConfig = session.mask.modelConfig;
        // Image generation responses are binary assets, not useful title context.
        if (isImageGenerationModel(modelConfig.model)) {
          return;
        }

        // if not config compressModel, then using getSummarizeModel
        const [model, providerName] = modelConfig.compressModel
          ? [modelConfig.compressModel, modelConfig.compressProviderName]
          : getSummarizeModel(
              session.mask.modelConfig.model,
              session.mask.modelConfig.providerName,
            );
        const api: ClientApi = getClientApi(providerName as ServiceProvider);

        // remove error messages if any
        const messages = session.messages;

        // should summarize topic after chating more than 50 words
        const SUMMARIZE_MIN_LEN = 50;
        if (
          (config.enableAutoGenerateTitle &&
            session.topic === DEFAULT_TOPIC &&
            countMessages(messages) >= SUMMARIZE_MIN_LEN) ||
          refreshTitle
        ) {
          const startIndex = Math.max(
            0,
            messages.length - modelConfig.historyMessageCount,
          );
          const topicMessages = messages
            .slice(
              startIndex < messages.length ? startIndex : messages.length - 1,
              messages.length,
            )
            .concat(
              createMessage({
                role: "user",
                content: Locale.Store.Prompt.Topic,
              }),
            );
          api.llm.chat({
            messages: topicMessages,
            config: {
              model,
              stream: false,
              providerName,
            },
            onFinish(message, responseRes) {
              if (responseRes?.status === 200) {
                get().updateTargetSession(
                  session,
                  (session) =>
                    (session.topic =
                      message.length > 0 ? trimTopic(message) : DEFAULT_TOPIC),
                );
              }
            },
          });
        }
        const summarizeIndex = Math.max(
          session.lastSummarizeIndex,
          session.clearContextIndex ?? 0,
        );
        let toBeSummarizedMsgs = messages
          .filter((msg) => !msg.isError)
          .slice(summarizeIndex);

        const historyMsgLength = countMessages(toBeSummarizedMsgs);

        if (historyMsgLength > (modelConfig?.max_tokens || 4000)) {
          const n = toBeSummarizedMsgs.length;
          toBeSummarizedMsgs = toBeSummarizedMsgs.slice(
            Math.max(0, n - modelConfig.historyMessageCount),
          );
        }
        const memoryPrompt = get().getMemoryPrompt();
        if (memoryPrompt) {
          // add memory prompt
          toBeSummarizedMsgs.unshift(memoryPrompt);
        }

        const lastSummarizeIndex = session.messages.length;

        console.log(
          "[Chat History] ",
          toBeSummarizedMsgs,
          historyMsgLength,
          modelConfig.compressMessageLengthThreshold,
        );

        if (
          historyMsgLength > modelConfig.compressMessageLengthThreshold &&
          modelConfig.sendMemory
        ) {
          /** Destruct max_tokens while summarizing
           * this param is just shit
           **/
          const { max_tokens, ...modelcfg } = modelConfig;
          api.llm.chat({
            messages: toBeSummarizedMsgs.concat(
              createMessage({
                role: "system",
                content: Locale.Store.Prompt.Summarize,
                date: "",
              }),
            ),
            config: {
              ...modelcfg,
              stream: true,
              model,
              providerName,
            },
            onUpdate(message) {
              session.memoryPrompt = message;
            },
            onFinish(message, responseRes) {
              if (responseRes?.status === 200) {
                console.log("[Memory] ", message);
                get().updateTargetSession(session, (session) => {
                  session.lastSummarizeIndex = lastSummarizeIndex;
                  session.memoryPrompt = message; // Update the memory prompt for stored it in local storage
                });
              }
            },
            onError(err) {
              console.error("[Summarize] ", err);
            },
          });
        }
      },

      updateStat(message: ChatMessage, session: ChatSession) {
        get().updateTargetSession(session, (session) => {
          session.stat.charCount += message.content.length;
          // TODO: should update chat count and word count
        });
      },
      updateTargetSession(
        targetSession: ChatSession,
        updater: (session: ChatSession) => void,
      ) {
        const sessions = get().sessions;
        const index = sessions.findIndex((s) => s.id === targetSession.id);
        if (index < 0) return;
        updater(sessions[index]);
        set(() => ({ sessions }));
      },
      async clearAllData() {
        await indexedDBStorage.clear();
        localStorage.clear();
        location.reload();
      },
      async loadRemoteSessions() {
        try {
          const currentSessionId = get().currentSession()?.id;
          const remoteSessions = await fetchRemoteChatSessions();
          if (!remoteSessions) return false;

          const sessions = normalizeSessions(
            remoteSessions.length > 0 ? remoteSessions : [createEmptySession()],
          );
          const currentSessionIndex = Math.max(
            0,
            sessions.findIndex((session) => session.id === currentSessionId),
          );
          set(() => ({
            sessions,
            currentSessionIndex,
            currentSessionId: sessions[currentSessionIndex]?.id,
            serverSessionsLoaded: true,
          }));

          if (remoteSessions.length === 0) {
            await get().saveRemoteSessions();
          }

          return true;
        } catch (error) {
          console.error("[Chat] failed to load remote sessions", error);
          return false;
        }
      },
      async saveRemoteSessions() {
        if (!get().serverSessionsLoaded) return false;

        try {
          return await saveRemoteChatSessions(get().sessions);
        } catch (error) {
          console.error("[Chat] failed to save remote sessions", error);
          return false;
        }
      },
      setLastInput(lastInput: string) {
        set({
          lastInput,
        });
      },

      /** check if the message contains MCP JSON and execute the MCP action */
      checkMcpJson(message: ChatMessage) {
        const mcpEnabled = isMcpEnabled();
        if (!mcpEnabled) return;
        const content = getMessageTextContent(message);
        if (isMcpJson(content)) {
          try {
            const mcpRequest = extractMcpJson(content);
            if (mcpRequest) {
              console.debug("[MCP Request]", mcpRequest);

              executeMcpAction(mcpRequest.clientId, mcpRequest.mcp)
                .then((result) => {
                  console.log("[MCP Response]", result);
                  const mcpResponse =
                    typeof result === "object"
                      ? JSON.stringify(result)
                      : String(result);
                  get().onUserInput(
                    `\`\`\`json:mcp-response:${mcpRequest.clientId}\n${mcpResponse}\n\`\`\``,
                    [],
                    true,
                  );
                })
                .catch((error) => showToast("MCP execution failed", error));
            }
          } catch (error) {
            console.error("[Check MCP JSON]", error);
          }
        }
      },
    };

    return methods;
  },
  {
    name: StoreKey.Chat,
    version: 3.8,
    migrate(persistedState, version) {
      const state = persistedState as any;
      const newState = JSON.parse(
        JSON.stringify(state),
      ) as typeof DEFAULT_CHAT_STATE;

      if (version < 2) {
        newState.sessions = [];

        const oldSessions = state.sessions;
        for (const oldSession of oldSessions) {
          const newSession = createEmptySession();
          newSession.topic = oldSession.topic;
          newSession.messages = [...oldSession.messages];
          newSession.mask.modelConfig.sendMemory = true;
          newSession.mask.modelConfig.historyMessageCount = 4;
          newSession.mask.modelConfig.compressMessageLengthThreshold = 1000;
          newState.sessions.push(newSession);
        }
      }

      if (version < 3) {
        // migrate id to nanoid
        newState.sessions.forEach((s) => {
          s.id = nanoid();
          s.messages.forEach((m) => (m.id = nanoid()));
        });
      }

      // Enable `enableInjectSystemPrompts` attribute for old sessions.
      // Resolve issue of old sessions not automatically enabling.
      if (version < 3.1) {
        newState.sessions.forEach((s) => {
          if (
            // Exclude those already set by user
            !s.mask.modelConfig.hasOwnProperty("enableInjectSystemPrompts")
          ) {
            // Because users may have changed this configuration,
            // the user's current configuration is used instead of the default
            const config = useAppConfig.getState();
            s.mask.modelConfig.enableInjectSystemPrompts =
              config.modelConfig.enableInjectSystemPrompts;
          }
        });
      }

      // add default summarize model for every session
      if (version < 3.2) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.compressModel = config.modelConfig.compressModel;
          s.mask.modelConfig.compressProviderName =
            config.modelConfig.compressProviderName;
        });
      }
      // revert default summarize model for every session
      if (version < 3.3) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.compressModel = "";
          s.mask.modelConfig.compressProviderName = "";
        });
      }

      if (version < 3.4) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.reasoningMode =
            config.modelConfig.reasoningMode ?? "thinking";
        });
      }

      if (version < 3.5) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.webSearch = config.modelConfig.webSearch ?? true;
          s.mask.modelConfig.webSearchContextSize =
            config.modelConfig.webSearchContextSize ?? "low";
        });
      }

      if (version < 3.6) {
        newState.sessions = normalizeSessions(newState.sessions);
      }

      if (version < 3.7) {
        newState.sessions = normalizeSessions(newState.sessions);
      }

      if (version < 3.8) {
        const currentSessionIndex = Math.min(
          newState.sessions.length - 1,
          Math.max(0, newState.currentSessionIndex),
        );
        newState.currentSessionIndex = currentSessionIndex;
        newState.currentSessionId = newState.sessions[currentSessionIndex]?.id;
      }

      return newState as any;
    },
    onRehydrateStorage() {
      return (state) => {
        if (!state?.sessions) return;
        state.sessions = normalizeSessions(state.sessions);
        state.currentSessionId =
          state.currentSessionId ??
          state.sessions[state.currentSessionIndex]?.id ??
          state.sessions[0]?.id;
      };
    },
  },
);
