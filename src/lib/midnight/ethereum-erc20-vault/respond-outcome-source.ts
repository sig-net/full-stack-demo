import {
  type RespondBidirectionalEvent,
  type Secp256k1Point,
  verifyRespondBidirectionalSignature,
} from '@sig-net/midnight'

/**
 * Where the bytes an MPC attestation is verified over come from. The singleton's attestation
 * posts carry everything the MPC signed except the output, and anyone may post, so a post counts
 * only once its signature verifies over bytes obtained here against the vault's pinned response
 * key. Every call reads external systems and is made outside any database transaction.
 */
export interface RespondOutcomeSource {
  /** The first attestation post whose signature verifies over bytes obtained from this source, or undefined while none does. */
  attestedOutcome(args: AttestedOutcomeArgs): Promise<RespondOutcome | undefined>
}

export interface AttestedOutcomeArgs {
  readonly requestId: Uint8Array
  /** The response key the vault pinned at initialise, what the queue circuit verifies against. */
  readonly mpcResponseKey: Secp256k1Point
}

export interface RespondOutcome {
  /** The post as the singleton emitted it, big-endian, whose `outputKind` is the MPC's verified verdict. */
  readonly event: RespondBidirectionalEvent
  /** The bytes the signature covers: the execution output as the MPC serialised it, empty for a failed or unviable execution. */
  readonly serializedOutput: Uint8Array
}

/**
 * The first post, in emission order, whose signature verifies over the bytes `candidateOf`
 * yields for it. A post's declared kind only picks its candidate: the signature decides.
 */
export function firstVerifiedOutcome(
  posts: readonly RespondBidirectionalEvent[],
  candidateOf: (post: RespondBidirectionalEvent) => Uint8Array | undefined,
  mpcResponseKey: Secp256k1Point,
): RespondOutcome | undefined {
  for (const event of posts) {
    const serializedOutput = candidateOf(event)
    if (
      serializedOutput !== undefined &&
      verifyRespondBidirectionalSignature(serializedOutput, event, mpcResponseKey)
    ) {
      return { event, serializedOutput }
    }
  }
  return undefined
}
