import { readFileSync } from "node:fs";

import { z } from "zod";

import { assertApplied, patchSource } from "./chromium-post-data-cap.mjs";

const coreVersion = z
  .object({ version: z.string() })
  .parse(
    JSON.parse(readFileSync(new URL(import.meta.resolve("playwright-core/package.json")), "utf8")),
  ).version;
const mcpPackage = new URL(import.meta.resolve("@playwright/mcp/package.json"));
const mcp = z
  .object({
    version: z.literal("0.0.80"),
    bin: z.object({ "playwright-mcp": z.literal("cli.js") }),
  })
  .parse(JSON.parse(readFileSync(mcpPackage, "utf8")));
patchSource(
  readFileSync(new URL(import.meta.resolve("playwright-core/lib/coreBundle")), "utf8"),
  coreVersion,
);
await import(new URL(mcp.bin["playwright-mcp"], mcpPackage).href);
assertApplied();
