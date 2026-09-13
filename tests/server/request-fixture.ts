import { NextRequest } from "next/server";

import { serverRuntimeConfiguration } from "@/lib/config/server-runtime";

/**
 * @param pathname - Route being exercised by the server test.
 * @param body - Raw JSON text, including deliberately malformed input when required.
 * @returns A request attested against the current server configuration.
 */
export function attestedRequest(pathname: string, body: string): NextRequest {
  return new NextRequest(new URL(pathname, "https://app.example.invalid"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vault-configuration": serverRuntimeConfiguration().fingerprint,
    },
    body,
  });
}
