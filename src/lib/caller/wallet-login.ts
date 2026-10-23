import { z } from 'zod'

import {
  type LoginCredential,
  LOGIN_WINDOW_MS,
  loginMessageOf,
} from '@/lib/caller/login-credential'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import { messageSignatureSchema, SIGNATURE_SCHEMES } from '@/lib/midnight/signed-message'
import type { Wallet } from '@/lib/midnight/wallet/wallet'

/** The connected wallet's login as the page holds it: the key it signs with, and a credential signed within the window. */
export interface CallerLogin {
  /** The hex verifying key the wallet signs with: the caller's identity across renewals, which keys the page's queries. */
  readonly verifyingKey: string
  /**
   * The credential to send now: the current one while it has `LOGIN_RENEWAL_MARGIN_MS` of its
   * window left, else one signed afresh, with concurrent callers sharing one signing and so
   * one wallet prompt.
   */
  readonly credential: () => Promise<LoginCredential>
}

/**
 * Signs the login message with the wallet and keeps the credential in page memory, renewing it
 * only when a call asks for it, so an idle page never prompts and a call never sends a
 * credential about to expire.
 *
 * @throws {Error} When the wallet refuses the first signature or answers outside the connector's wire form, in which case there is no login.
 */
export async function loginWithWallet(
  wallet: Pick<Wallet, 'signData'>,
  networkId: MidnightNetworkId,
  now: () => Date = () => new Date(),
): Promise<CallerLogin> {
  let current = await signLogin(wallet, networkId, now())
  let signing: Promise<LoginCredential> | undefined
  const credential = (): Promise<LoginCredential> => {
    const age = now().getTime() - Date.parse(current.issuedAt)
    if (age < LOGIN_WINDOW_MS - LOGIN_RENEWAL_MARGIN_MS) return Promise.resolve(current)
    signing ??= signLogin(wallet, networkId, now())
      .then((renewed) => {
        current = renewed
        return renewed
      })
      .finally(() => {
        signing = undefined
      })
    return signing
  }
  return { verifyingKey: current.signature.verifyingKey, credential }
}

/** A credential is signed anew once less than this of its window remains, so one a call sends is never expired on arrival. */
export const LOGIN_RENEWAL_MARGIN_MS = 60 * 1000

async function signLogin(
  wallet: Pick<Wallet, 'signData'>,
  networkId: MidnightNetworkId,
  issuedAt: Date,
): Promise<LoginCredential> {
  const stamp = issuedAt.toISOString()
  const answer: unknown = await wallet.signData(loginMessageOf(networkId, stamp), {
    encoding: 'text',
    keyType: 'unshielded',
  })
  const parsed = signDataAnswerSchema.safeParse(answer)
  if (!parsed.success) {
    throw new Error(
      `The wallet's login signature is not in the connector's wire form: ${z.prettifyError(parsed.error)}`,
    )
  }
  return { issuedAt: stamp, signature: parsed.data }
}

/**
 * The connector's `signData` answer, parsed at the wallet's trust boundary: an absent `scheme`
 * reads as `schnorr_bip340`, as the connector's specification says, and the key and signature
 * must be in the MIP-0031 wire form of that scheme.
 */
const signDataAnswerSchema = z
  .object({
    scheme: z.enum(SIGNATURE_SCHEMES).default('schnorr_bip340'),
    verifyingKey: z.string(),
    signature: z.string(),
  })
  .pipe(messageSignatureSchema)
