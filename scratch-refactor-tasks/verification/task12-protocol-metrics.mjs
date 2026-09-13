import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

const bundleUrl = import.meta.resolve("playwright-core/lib/coreBundle");

/**
 * Records large protocol message sizes while keeping request-body content out of diagnostics.
 * @param {string} source - Installed bundle whose transport and request event shapes are checked.
 * @returns {string} Instrumented source retaining the underlying message processing.
 * @throws {Error} If the expected transport or event sites are absent or duplicated.
 */
export function patchProtocolMetrics(source) {
  const transport = "const message = Buffer.concat(this._pendingBuffers).toString();";
  const event = "_onRequestWillBeSent(sessionInfo, event) {";
  if (source.split(transport).length !== 4 || source.split(event).length !== 2)
    throw new Error("Diagnostic source shape mismatch");
  source = source.replaceAll(
    transport,
    `
        const diagnosticBytes = this._pendingBuffers.reduce((total, part) => total + part.length, 0);
        if (diagnosticBytes > 100000000) {
          const prefix = this._pendingBuffers[0].subarray(0, 512).toString();
          const method = prefix.match(/"method":"([A-Za-z.]+)"/)?.[1] || 'unidentified';
          process.stderr.write(JSON.stringify({ protocolMessageBytes: diagnosticBytes, method }) + '\\n');
        }
        ${transport}`,
  );
  source = source.replace(
    event,
    `${event}
        if (event.request.method === 'POST' && event.request.url.endsWith('/upload')) {
          process.stderr.write(JSON.stringify({ networkEvent: 'Network.requestWillBeSent', hasPostData: event.request.hasPostData, postDataCharacters: event.request.postData?.length || 0, postDataEntryCount: event.request.postDataEntries?.length || 0 }) + '\\n');
        }`,
  );
  return source;
}
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url !== bundleUrl) return result;
    return { ...result, source: patchProtocolMetrics(readFileSync(new URL(url), "utf8")) };
  },
});
