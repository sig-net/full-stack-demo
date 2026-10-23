import 'server-only'

import {
  type MpcOutputCacheReader,
  requestIdHex,
  type SignetRequestResponseReader,
} from '@sig-net/midnight'

import {
  type AttestedOutcomeArgs,
  firstVerifiedOutcome,
  type RespondOutcome,
  type RespondOutcomeSource,
} from '@/lib/midnight/ethereum-erc20-vault/respond-outcome-source'

/**
 * Downloads the bytes the MPC cached for the request before it posted, one object per request
 * id, and checks every post over them whatever kind it declares.
 */
export class RespondOutcomeSourceMpcCacheImpl implements RespondOutcomeSource {
  private readonly reader: SignetRequestResponseReader
  private readonly cache: MpcOutputCacheReader

  constructor(reader: SignetRequestResponseReader, cache: MpcOutputCacheReader) {
    this.reader = reader
    this.cache = cache
  }

  async attestedOutcome({
    requestId,
    mpcResponseKey,
  }: AttestedOutcomeArgs): Promise<RespondOutcome | undefined> {
    const id = requestIdHex(requestId)
    const posts = await this.reader.getRespondBidirectionalEvents(id)
    if (posts.length === 0) return undefined
    const cached = await this.cache.fetchSerializedOutput(id)
    if (cached === undefined) return undefined
    return firstVerifiedOutcome(posts, () => cached, mpcResponseKey)
  }
}
