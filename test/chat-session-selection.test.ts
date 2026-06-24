import { useChatStore } from "../app/store/chat";
import { jest } from "@jest/globals";

describe("chat session selection", () => {
  beforeEach(() => {
    useChatStore.getState().clearSessions();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("keeps the selected session when the sessions array is reordered", () => {
    const store = useChatStore.getState();

    store.updateTargetSession(store.currentSession(), (session) => {
      session.topic = "first";
      session.lastUpdate = 1;
    });

    store.newSession();
    useChatStore.getState().updateTargetSession(
      useChatStore.getState().currentSession(),
      (session) => {
        session.topic = "second";
        session.lastUpdate = 2;
      },
    );

    useChatStore.getState().selectSession(1);
    const selectedId = useChatStore.getState().currentSession().id;

    useChatStore.setState((state) => ({
      sessions: state.sessions.slice().reverse(),
    }));

    expect(useChatStore.getState().currentSession().id).toBe(selectedId);
    expect(useChatStore.getState().currentSession().topic).toBe("first");
  });

  test("keeps the selected session when remote sessions refresh", async () => {
    const store = useChatStore.getState();

    store.updateTargetSession(store.currentSession(), (session) => {
      session.topic = "first";
      session.lastUpdate = 1;
    });

    store.newSession();
    useChatStore.getState().updateTargetSession(
      useChatStore.getState().currentSession(),
      (session) => {
        session.topic = "second";
        session.lastUpdate = 2;
      },
    );

    useChatStore.getState().selectSession(1);
    const selectedId = useChatStore.getState().currentSession().id;
    const remoteSessions = useChatStore.getState().sessions;

    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ sessions: remoteSessions }),
    } as Response);

    await useChatStore.getState().loadRemoteSessions();

    expect(useChatStore.getState().currentSession().id).toBe(selectedId);
    expect(useChatStore.getState().currentSession().topic).toBe("first");
  });
});
