import { StoreKey } from "@/app/constant";
import { jest } from "@jest/globals";

function makeAppState(chatState: Record<string, unknown>) {
  return {
    [StoreKey.Chat]: {
      sessions: [],
      currentSessionIndex: 0,
      lastInput: "",
      serverSessionsLoaded: false,
      ...chatState,
    },
    [StoreKey.Access]: {},
    [StoreKey.Config]: {},
    [StoreKey.Mask]: {},
    [StoreKey.Prompt]: {},
  } as any;
}

function makeSession(id: string, learning: any) {
  return {
    id,
    topic: "Learning",
    memoryPrompt: "",
    messages: [
      {
        id: `${id}-message`,
        role: "user",
        content: "hello",
        date: new Date(0).toISOString(),
      },
    ],
    stat: { tokenCount: 0, wordCount: 0, charCount: 0 },
    lastUpdate: Date.now(),
    lastSummarizeIndex: 0,
    mask: { modelConfig: {} },
    learning,
  };
}

describe("sync learning state merge", () => {
  beforeEach(() => {
    jest.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input);
      const body = url.includes("plugins.json") ? [] : { en: [], tw: [], cn: [] };
      return Promise.resolve({
      ok: true,
      status: 200,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(""),
      } as Response);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("keeps the newest learning metadata when merging existing chat sessions", async () => {
    const { mergeAppState } = await import("@/app/utils/sync");
    const localState = makeAppState({
      sessions: [
        makeSession("same-session", {
          enabled: true,
          phase: "diagnosing",
          initialIntent: "React",
          updatedAt: 100,
        }),
      ],
    });
    const remoteState = makeAppState({
      sessions: [
        makeSession("same-session", {
          enabled: false,
          phase: "reviewing",
          initialIntent: "React",
          updatedAt: 200,
        }),
      ],
    });

    const merged = mergeAppState(localState, remoteState);

    expect(merged[StoreKey.Chat].sessions[0].learning).toEqual({
      enabled: false,
      phase: "reviewing",
      initialIntent: "React",
      updatedAt: 200,
    });
  });
});
