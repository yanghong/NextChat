import { readFileSync } from "fs";
import { join } from "path";

describe("jest configuration", () => {
  const source = () => readFileSync(join(process.cwd(), "jest.config.ts"), "utf8");

  test("ignores local worktree cache tests", () => {
    const config = source();

    expect(config).toContain("testPathIgnorePatterns");
    expect(config).toContain("<rootDir>/.worktrees/");
  });
});
