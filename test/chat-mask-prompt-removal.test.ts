import { readFileSync } from "fs";
import { join } from "path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("mask and quick prompt removal", () => {
  test("sidebar no longer exposes mask entry or mask splash branching", () => {
    const source = read("app/components/sidebar.tsx");

    expect(source).not.toContain("MaskIcon");
    expect(source).not.toContain("Locale.Mask.Name");
    expect(source).not.toContain("dontShowMaskSplashScreen");
    expect(source).toContain("chatStore.newSession()");
    expect(source).toContain("navigate(Path.Chat)");
  });

  test("home no longer renders the mask management page", () => {
    const source = read("app/components/home.tsx");

    expect(source).not.toContain("MaskPage");
    expect(source).not.toContain('path={Path.Masks} element={<MaskPage />}');
  });

  test("chat input no longer loads prompt store or prompt hints", () => {
    const source = read("app/components/chat.tsx");

    expect(source).not.toContain("usePromptStore");
    expect(source).not.toContain("PromptHints");
    expect(source).not.toContain("PromptToast");
    expect(source).not.toContain("showPromptHints");
    expect(source).not.toContain("ChatCommandPrefix.Prompt");
    expect(source).not.toContain("newm: () => navigate(Path.NewChat)");
    expect(source).not.toContain('setUserInput("/")');
    expect(source).not.toContain("ContextPrompts");
  });

  test("settings no longer renders mask or quick prompt settings", () => {
    const source = read("app/components/settings.tsx");

    expect(source).not.toContain("UserPromptModal");
    expect(source).not.toContain("EditPromptModal");
    expect(source).not.toContain("usePromptStore");
    expect(source).not.toContain("useMaskStore");
    expect(source).not.toContain("dontShowMaskSplashScreen");
    expect(source).not.toContain("hideBuiltinMasks");
    expect(source).not.toContain("disablePromptHint");
  });
});
