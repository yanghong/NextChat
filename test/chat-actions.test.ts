import { readFileSync } from "fs";
import { join } from "path";

describe("chat input actions", () => {
  const readChatSource = () =>
    readFileSync(join(process.cwd(), "app/components/chat.tsx"), "utf8");

  test("does not expose the clear chat shortcut button", () => {
    const source = readChatSource();

    expect(source).not.toContain("text={Locale.Chat.InputActions.Clear}");
  });

  test("does not expose the theme shortcut button", () => {
    const source = readChatSource();

    expect(source).not.toContain("text={Locale.Chat.InputActions.Theme[theme]}");
  });

  test("opens an API key save modal when the user has no bound key", () => {
    const source = readChatSource();

    expect(source).toContain("UserApiKeyRequiredModal");
    expect(source).toContain("saveUserOpenAIKey");
    expect(source).toContain("USER_API_KEY_REQUIRED_MESSAGE");
    expect(source).toContain('className={styles["user-api-key-modal"]}');
    expect(source).toContain("vertical");
  });

  test("lets users click chat images to preview the full image", () => {
    const source = readChatSource();
    const compactSource = source.replace(/\s+/g, "");

    expect(source).toContain("showImageModal");
    expect(compactSource).toContain(
      "onClick={()=>showImageModal(getMessageImages(message)[0])}",
    );
    expect(compactSource).toContain("onClick={()=>showImageModal(image)}");
  });

  test("lets chat errors be handled by the UI without writing a generic error bubble", () => {
    const source = readFileSync(
      join(process.cwd(), "app/store/chat.ts"),
      "utf8",
    );

    expect(source).toContain("onError?: (error: Error) => boolean");
    expect(source).toContain("options?.onError?.(error)");
    expect(source).toContain("options?.onError?.(new Error(message))");
    expect(source).toContain("pendingUserText");
  });
});
