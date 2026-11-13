import { getAddress, Interface, type JsonRpcProvider, toBeHex, toBigInt } from 'ethers'

import { log } from './operation-round-trip'

/**
 * Makes the Aave reserve behind a static-token wrapper accept deposits on the fork. Sepolia's
 * USDC reserve runs past its supply cap, so a fork taken then answers `maxDeposit` zero and the
 * MPC's supply reverts with "ERC4626: deposit more than max". The pool admin is impersonated
 * through anvil and sets the cap to zero, which Aave reads as uncapped.
 */
export async function ensureAaveReserveAcceptsDeposits(
  evm: JsonRpcProvider,
  stataErc20Address: string,
): Promise<void> {
  if ((await maxDeposit(evm, stataErc20Address)) > 0n) return
  const asset = await readAddress(evm, stataErc20Address, STATA_TOKEN, 'asset')
  const pool = await readAddress(evm, stataErc20Address, STATA_TOKEN, 'POOL')
  const addressesProvider = await readAddress(evm, pool, POOL, 'ADDRESSES_PROVIDER')
  const admin = await readAddress(evm, addressesProvider, ADDRESSES_PROVIDER, 'getACLAdmin')
  const configurator = await readAddress(
    evm,
    addressesProvider,
    ADDRESSES_PROVIDER,
    'getPoolConfigurator',
  )
  log(
    `the Aave reserve of ${asset} refuses deposits (maxDeposit 0): lifting its supply cap as ${admin}`,
  )
  await evm.send('anvil_impersonateAccount', [admin])
  await evm.send('anvil_setBalance', [admin, toBeHex(10n ** 18n)])
  const signer = await evm.getSigner(admin)
  const receipt = await (
    await signer.sendTransaction({
      to: configurator,
      data: POOL_CONFIGURATOR.encodeFunctionData('setSupplyCap', [asset, UNCAPPED]),
    })
  ).wait()
  await evm.send('anvil_stopImpersonatingAccount', [admin])
  if (receipt?.status !== 1) throw new Error(`setSupplyCap on ${configurator} failed`)
  if ((await maxDeposit(evm, stataErc20Address)) === 0n) {
    throw new Error(`the Aave reserve of ${asset} still refuses deposits after the cap was lifted`)
  }
}

/** `maxDeposit` on the wrapper depends on the reserve alone, so the receiver can be anyone. */
const ANY_RECEIVER = '0x0000000000000000000000000000000000000001'

/** A supply cap of zero means no cap in Aave's reserve configuration. */
const UNCAPPED = 0n

const STATA_TOKEN = new Interface([
  'function maxDeposit(address) view returns (uint256)',
  'function asset() view returns (address)',
  'function POOL() view returns (address)',
])

const POOL = new Interface(['function ADDRESSES_PROVIDER() view returns (address)'])

const ADDRESSES_PROVIDER = new Interface([
  'function getPoolConfigurator() view returns (address)',
  'function getACLAdmin() view returns (address)',
])

const POOL_CONFIGURATOR = new Interface([
  'function setSupplyCap(address asset, uint256 newSupplyCap)',
])

async function maxDeposit(evm: JsonRpcProvider, stataErc20Address: string): Promise<bigint> {
  return toBigInt(
    await evm.call({
      to: stataErc20Address,
      data: STATA_TOKEN.encodeFunctionData('maxDeposit', [ANY_RECEIVER]),
    }),
  )
}

/** A view returning one address, read as the 20 low bytes of the 32-byte word. */
async function readAddress(
  evm: JsonRpcProvider,
  to: string,
  abi: Interface,
  method: string,
): Promise<string> {
  const word = await evm.call({ to, data: abi.encodeFunctionData(method, []) })
  return getAddress(`0x${word.slice(-40)}`)
}
