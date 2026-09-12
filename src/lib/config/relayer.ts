import { z } from 'zod';

const serverEnvSchema = z.object({
  RELAYER_PRIVATE_KEY: z
    .string()
    .regex(
      /^0x[0-9a-fA-F]{64}$/,
      'Relayer private key must be 0x-prefixed 32-byte hex',
    ),
});

export function getRelayerPrivateKey() {
  if (typeof window !== 'undefined') {
    throw new Error(
      'getRelayerPrivateKey() should only be called on the server side',
    );
  }

  const rawEnv: Record<string, string | undefined> = {
    RELAYER_PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY,
  };

  try {
    return serverEnvSchema.parse(rawEnv).RELAYER_PRIVATE_KEY;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      throw new Error(`Environment validation failed: ${missingVars}`);
    }
    throw error;
  }
}
