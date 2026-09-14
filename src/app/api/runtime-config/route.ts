import { NextResponse } from "next/server";

import { createRuntimeConfigDto } from "@/lib/config/runtime";
import { serverRuntimeConfiguration } from "@/lib/config/server-runtime";

/** Resolves the deployment from the Node server environment. */
export const runtime = "nodejs";
/** Each attestation response reflects current server deployment inputs. */
export const dynamic = "force-dynamic";
/**
 * Publishes the server configuration fingerprint used to gate assisted actions.
 *
 * @returns Complete public deployment inputs, or an unavailable response.
 */
export function GET(): Response {
  try {
    const { config, fingerprint } = serverRuntimeConfiguration();
    return NextResponse.json({ config: createRuntimeConfigDto(config), fingerprint });
  } catch {
    return NextResponse.json(
      { error: "Server deployment configuration is unavailable." },
      { status: 503 },
    );
  }
}
