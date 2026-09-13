/**
 * Recognises literal loopback hosts and rejects embedded URL credentials.
 *
 * @param value - An absolute URL to classify for local endpoint policy.
 * @returns Whether an HTTP(S) or WebSocket endpoint names a supported loopback host.
 * @throws {TypeError} If the value cannot be parsed as an absolute URL.
 */
export function isLoopbackEndpoint(value: string): boolean {
  const url = new URL(value);
  return (
    ["http:", "https:", "ws:", "wss:"].includes(url.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !url.username &&
    !url.password
  );
}
