import {
  addressFromKey,
  signData,
  type SignatureKind,
  signatureVerifyingKey,
  type SigningKey,
} from '@midnightntwrk/ledger-v9'
import { MidnightBech32m, UnshieldedAddress } from '@midnightntwrk/wallet-sdk-address-format'
import { MidnightNetwork } from '@sig-net/midnight'

import { type Caller, callerName } from '@/lib/caller/caller'
import { type LoginCredential, loginMessageOf } from '@/lib/caller/login-credential'
import type { CallerLogin } from '@/lib/caller/wallet-login'
import type { MidnightNetworkId } from '@/lib/config/midnight-network-config'
import {
  SIGNATURE_KIND_BY_SCHEME,
  SIGNATURE_SCHEMES,
  type SignatureScheme,
  signedMessageOf,
} from '@/lib/midnight/signed-message'

/** The network every fixture address and credential is made for. */
export const FIXTURE_NETWORK_ID: MidnightNetworkId = MidnightNetwork.Stagenet

/** MIP-0031's published test key `key-a`, which must never hold funds. */
export const CALLER_SIGNING_KEY: SigningKey = { tag: 'schnorr', value: '07'.repeat(32) }
export const CALLER_ID = callerIdOf(CALLER_SIGNING_KEY)
export const CALLER_ADDRESS = unshieldedAddressOf(CALLER_ID)
export const CALLER_NAME = callerName(CALLER_ID)
export const CALLER: Caller = { unshieldedAddress: CALLER_ADDRESS, name: CALLER_NAME }
/** The caller's login, signed when the module loads, so it is within its window for the test file's run. */
export const CALLER_CREDENTIAL: LoginCredential = loginCredentialSignedBy(
  CALLER_SIGNING_KEY,
  FIXTURE_NETWORK_ID,
  new Date(),
)
/** The caller's login as the page holds it, answering `CALLER_CREDENTIAL` on every call. */
export const CALLER_LOGIN: CallerLogin = {
  verifyingKey: CALLER_CREDENTIAL.signature.verifyingKey,
  credential: () => Promise.resolve(CALLER_CREDENTIAL),
}

/** MIP-0031's published test key `key-b`. */
export const STRANGER_SIGNING_KEY: SigningKey = {
  tag: 'schnorr',
  value: 'b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef',
}
const STRANGER_ID = callerIdOf(STRANGER_SIGNING_KEY)
export const STRANGER: Caller = {
  unshieldedAddress: unshieldedAddressOf(STRANGER_ID),
  name: callerName(STRANGER_ID),
}

/** The login credential `signingKey` signs at `issuedAt` for `networkId`, as the wallet signs it. */
export function loginCredentialSignedBy(
  signingKey: SigningKey,
  networkId: MidnightNetworkId,
  issuedAt: Date,
): LoginCredential {
  const stamp = issuedAt.toISOString()
  return loginCredentialOver(signingKey, loginMessageOf(networkId, stamp), stamp)
}

/** A credential stamped `issuedAt` whose signature is over `message`, whatever `issuedAt` says: the tampered case. */
export function loginCredentialOver(
  signingKey: SigningKey,
  message: string,
  issuedAt: string,
): LoginCredential {
  const signature = signData(signingKey, signedMessageOf(new TextEncoder().encode(message)))
  return {
    issuedAt,
    signature: {
      scheme: schemeOf(signingKey.tag),
      verifyingKey: signatureVerifyingKey(signingKey).value,
      signature: signature.value,
    },
  }
}

function schemeOf(kind: SignatureKind): SignatureScheme {
  const scheme = SIGNATURE_SCHEMES.find((candidate) => SIGNATURE_KIND_BY_SCHEME[candidate] === kind)
  if (scheme === undefined) throw new Error(`no MIP-0031 scheme is verified as ${kind}`)
  return scheme
}

/** The caller id of a signing key: the 32-byte user address of its verifying key in hex. */
function callerIdOf(signingKey: SigningKey): string {
  return addressFromKey(signatureVerifyingKey(signingKey))
}

/** The Bech32m unshielded address of a 32-byte user address in hex, on the fixture network. */
function unshieldedAddressOf(userAddressHex: string): string {
  return MidnightBech32m.encode(
    FIXTURE_NETWORK_ID,
    new UnshieldedAddress(Buffer.from(userAddressHex, 'hex')),
  ).toString()
}
