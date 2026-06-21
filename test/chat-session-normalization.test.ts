import { readFileSync } from "fs";
import { join } from "path";

describe("chat session mask normalization", () => {
  const source = () =>
    readFileSync(join(process.cwd(), "app/store/chat.ts"), "utf8");

  test("defines a normalization helper that clears mask semantics", () => {
    const chat = source();

    expect(chat).toContain("normalizeSessionMask");
    expect(chat).toContain("context: []");
    expect(chat).toContain("hideContext: false");
    expect(chat).toContain("name: DEFAULT_TOPIC");
    expect(chat).toContain("avatar: DEFAULT_MASK_AVATAR");
  });

  test("normalization preserves existing model config", () => {
    const chat = source();

    expect(chat).toContain("const modelConfig = session.mask?.modelConfig");
    expect(chat).toContain("modelConfig: {");
    expect(chat).toContain("...modelConfig");
  });

  test("migrate and remote loading normalize sessions", () => {
    const chat = source();

    expect(chat).toContain("version: 3.7");
    expect(chat).toContain("normalizeSessions");
    expect(chat).toContain("if (version < 3.7)");
    expect(chat).toContain("normalizeSessionLearning");
    expect(chat).toContain("newState.sessions = normalizeSessions");
    expect(chat).toContain("loadRemoteSessions");
  });

  test("persist wrapper preserves store-specific rehydrate callbacks", () => {
    const store = readFileSync(
      join(process.cwd(), "app/utils/store.ts"),
      "utf8",
    );

    expect(store).toContain("oldOnRehydrateStorage");
    expect(store).toContain("oldAfterRehydrate");
    expect(store).toContain("oldAfterRehydrate?.");
  });
});
