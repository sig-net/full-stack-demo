import { z } from 'zod';

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SEPOLIA_RPC_URL: z
    .string()
    .url({ message: 'Sepolia RPC URL is required' }),
});

const serverEnvSchema = z.object({
  RELAYER_PRIVATE_KEY: z
    .string()
    .regex(
      /^0x[0-9a-fA-F]{64}$/,
      'Relayer private key must be 0x-prefixed 32-byte hex',
    ),
});

const fullEnvSchema = clientEnvSchema.merge(serverEnvSchema);

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type FullEnv = z.infer<typeof fullEnvSchema>;

export function getClientEnv(): ClientEnv {
  const rawEnv: Record<string, string | undefined> = {
    NEXT_PUBLIC_SEPOLIA_RPC_URL: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL,
  };

  try {
    return clientEnvSchema.parse(rawEnv);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      throw new Error(`Client environment validation failed: ${missingVars}`);
    }
    throw error;
  }
}

export function getFullEnv(): FullEnv {
  if (typeof window !== 'undefined') {
    throw new Error('getFullEnv() should only be called on the server side');
  }

  const rawEnv: Record<string, string | undefined> = {
    NEXT_PUBLIC_SEPOLIA_RPC_URL: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL,
    RELAYER_PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY,
  };

  try {
    return fullEnvSchema.parse(rawEnv);
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
