import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function localeFiles() {
  return readdirSync(join(root, "app/locales"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => `app/locales/${file}`);
}

const brandedFiles = [
  "package.json",
  "public/site.webmanifest",
  "app/layout.tsx",
  "app/constant.ts",
  "app/client/api.ts",
  "app/components/artifacts.tsx",
  "app/components/exporter.tsx",
  "app/components/mcp-market.tsx",
  "app/lib/server/auth.ts",
  "app/mcp/client.ts",
  "app/mcp/logger.ts",
  "app/store/update.ts",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
  ...localeFiles(),
];

const nextchatBrandPatterns = [
  /NextChat/,
  /nextchat/i,
  /nextchat\.club/i,
  /ChatGPTNextWeb/,
  /ChatGPT-Next-Web/,
  /github\.com\/Yidadaa/i,
];

describe("Hongai branding", () => {
  test.each(brandedFiles)(
    "%s does not expose NextChat branding or upstream links",
    (file) => {
      const content = readProjectFile(file);

      for (const pattern of nextchatBrandPatterns) {
        expect(content).not.toMatch(pattern);
      }
    },
  );
});
