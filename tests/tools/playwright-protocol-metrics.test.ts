import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { patchProtocolMetrics } from "../../scratch-refactor-tasks/verification/task12-protocol-metrics.mjs";

it("requires all transport sites and retains bounded metadata without copying request bodies", () => {
  const source = readFileSync(
    new URL(import.meta.resolve("playwright-core/lib/coreBundle")),
    "utf8",
  );
  expect(source.length).toBeGreaterThan(0);
  expect(() => patchProtocolMetrics("")).toThrow("source shape mismatch");
  expect(() => patchProtocolMetrics(source + source)).toThrow("source shape mismatch");
  const patched = patchProtocolMetrics(source);
  expect(patched.match(/protocolMessageBytes: diagnosticBytes/g)).toHaveLength(3);
  expect(patched.match(/networkEvent: 'Network.requestWillBeSent'/g)).toHaveLength(1);
  expect(patched).toContain("subarray(0, 512)");
  expect(patched).toContain("postDataCharacters: event.request.postData?.length");
});
