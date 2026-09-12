export function isLoopbackEndpoint(value: string): boolean {
  const url = new URL(value);
  return (
    ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
    !url.username &&
    !url.password
  );
}
