import { readFileSync } from "fs";
import { join } from "path";

describe("chat input actions", () => {
  test("does not expose the clear chat shortcut button", () => {
    const source = readFileSync(
      join(process.cwd(), "app/components/chat.tsx"),
      "utf8",
    );

    expect(source).not.toContain("text={Locale.Chat.InputActions.Clear}");
  });

  test("does not expose the theme shortcut button", () => {
    const source = readFileSync(
      join(process.cwd(), "app/components/chat.tsx"),
      "utf8",
    );

    expect(source).not.toContain("text={Locale.Chat.InputActions.Theme[theme]}");
  });
});
