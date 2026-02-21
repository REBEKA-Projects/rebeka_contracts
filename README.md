## Rebeka RWA Contracts

Smart contracts and scripts for tokenizing real-world assets (land plots) on Arbitrum:

- **RWAPermissionedERC20**: share token (1 token = 1 m², `decimals = 0`) with KYC/allowlist.
- **RevenueDistributor**: USDC revenue distributor for share token holders.
- **AssetRegistry**: on-chain registry of metadata and document references (URIs + hashes) per token.
- **RWATokenFactory**: factory that, for each land plot, deploys a `RWAPermissionedERC20` and its associated `RevenueDistributor`.

The project is built on **Hardhat 3** + **viem**, with TypeScript tests using `node:test` and some additional Solidity tests.

### Deployed addresses (Arbitrum Sepolia)

| Contrato                  | Dirección |
|---------------------------|-----------|
| AssetRegistry             | `0x205934d52d3a7067eedf02440c40e71a022adfac` |
| RWAPublicTokenFactory     | `0xccd3aab55dc2317c54b7499ba3037f994f389a3f` |
| RWATokenFactoryRouter     | `0x13fcc7cac606eb1dc65a64097c856709b2f31015` |
| Admin / MASTERWALLET      | `0xfBf9fcB06a4275DE4ba300bA0fAA8B19D048e1B2` |

Use **Router** address for `createToken` and for indexing. See `docs/DEPLOY.md` for mainnet and env vars.

---

## Contracts

### RWAPermissionedERC20
- **File**: `contracts/RWAPermissionedERC20.sol`
- **Access control**:
  - `DEFAULT_ADMIN_ROLE`: general configuration.
  - `ISSUER_ROLE`: allowed to `mint` / `burn`.
  - `KYC_ADMIN_ROLE`: can `allowUser` / `disallowUser`.
  - `PAUSER_ROLE`: can pause / unpause transfers.
- **Transfer policy**:
  - Only transfers **between issuer and allowlisted investors** are allowed.
  - `mint` and `burn` are not paused; only `transfer` is affected by pause.
- **Decimals**:
  - `decimals` is configurable, but for RWA deploys it is set to **0** (1 token = 1 m²).

### RevenueDistributor
- **File**: `contracts/RevenueDistributor.sol`
- **Purpose**: distribute a payout token (USDC on Arbitrum) to share token holders.
- **Features**:
  - **Pull model**: issuer calls `deposit(amount)` and users claim with `claim()` / `claimFor(user)`.
  - `ACC_PRECISION = 1e27` to minimize rounding issues.
  - `checkpoint(user)` must be called by the backend whenever a user’s share token balance changes (mint/burn/transfer).
  - Only issuer and KYC’d (allowlisted) users can `claim`.
  - Reentrancy protection on `deposit`, `claim`, and `claimFor`.

### AssetRegistry
- **File**: `contracts/AssetRegistry.sol`
- **Access control**:
  - `REGISTRY_ADMIN_ROLE`: only role allowed to update metadata and documents.
- **Structures**:
  - `MetadataRef { uri, contentHash, updatedAt, version }`
  - `DocumentRef { name, uri, contentHash, mimeType, gated, updatedAt, version }`
- **Core functions**:
  - `setMetadata(token, uri, contentHash)` — stores URI + hash for a token and increments a version counter.
  - `upsertDocument(token, docId, name, uri, contentHash, mimeType, gated)` — creates/updates a referenced document with versioning.
  - `getDocument(token, docId)` — returns the current version of a document.
- **Validations**:
  - Constructor and write methods ensure address parameters are not `address(0)` (`ZeroAddress`, `InvalidToken`).

### RWATokenFactory
- **File**: `contracts/RWATokenFactory.sol`
- **Access control**:
  - `FACTORY_ADMIN_ROLE`: allowed to create new assets (land plots).
- **Constructor**:
  - `RWATokenFactory(address factoryAdmin, IERC20 payoutToken_)`
  - `factoryAdmin` is granted `DEFAULT_ADMIN_ROLE` and `FACTORY_ADMIN_ROLE`.
  - `payoutToken_` must be the **USDC on Arbitrum** address.
- **Main function**:
  - `createToken(name, symbol, admin, issuer, kycAdmin, pauser)`:
    - Deploys `RWAPermissionedERC20(name, symbol, 0, admin, issuer, kycAdmin, pauser)`.
    - Deploys `RevenueDistributor(admin, issuer, pauser, payoutToken, token)`.
    - Emits `TokenCreated(token, distributor, name, symbol)`.

---

## Scripts

All scripts use Hardhat + viem and assume you’ve configured network environment variables (see below).

### `scripts/deploy.ts`

- **Responsibility**: initial deployment of the “infrastructure” contracts:
  - `AssetRegistry`
  - `RWATokenFactory`
- Uses:
  - `MULTISIG_ADDRESS` as admin (or the `ARBITRUM_PRIVATE_KEY` account if not set).
  - `USDC_ARBITRUM` (or the default `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`).
- Output:
  - `AssetRegistry` address.
  - `RWATokenFactory` address.

Example:

```bash
ARBITRUM_RPC_URL=... \
ARBITRUM_PRIVATE_KEY=0x... \
MULTISIG_ADDRESS=0xTuMultisig \
USDC_ARBITRUM=0xaf88d065e77c8cC2239327C5EDb3A432268e5831 \
npx hardhat run scripts/deploy.ts --network arbitrum
```

### `scripts/create-terreno.ts`

- **Responsibility**: create a new land asset (share token + distributor pair) using `RWATokenFactory`.
- Variables:
  - `RWA_FACTORY_ADDRESS` (required): `RWATokenFactory` address.
  - `MULTISIG_ADDRESS` (optional): admin/issuer/kycAdmin/pauser; if not set, the deployer is used.
  - `RWA_NAME` / `RWA_SYMBOL` (optional): name and symbol of the new token.
- Output:
  - Created `RWAPermissionedERC20` address.
  - Associated `RevenueDistributor` address.

Example:

```bash
ARBITRUM_RPC_URL=... \
ARBITRUM_PRIVATE_KEY=0x... \
RWA_FACTORY_ADDRESS=0xFactory \
MULTISIG_ADDRESS=0xTuMultisig \
RWA_NAME="RWA Terreno 123" \
RWA_SYMBOL="RWA123" \
npx hardhat run scripts/create-terreno.ts --network arbitrum
```

### `scripts/register-asset.ts`

- **Responsibility**: register metadata and documents for a share token in `AssetRegistry`.
- Variables:
  - `ASSET_REGISTRY_ADDRESS` (required): `AssetRegistry` address.
  - `RWA_TOKEN_ADDRESS` (required): share token to register.
  - `METADATA_URI`, `METADATA_HASH` (optional): main metadata.
  - `DOC_ID` (bytes32, optional). If set, `upsertDocument` is also called with:
    - `DOC_NAME`, `DOC_URI`, `DOC_HASH`, `DOC_MIME`, `DOC_GATED`.

Minimal example (metadata only):

```bash
ASSET_REGISTRY_ADDRESS=0xRegistry \
RWA_TOKEN_ADDRESS=0xToken \
METADATA_URI="ipfs://Qm.../metadata.json" \
METADATA_HASH=0x... \
ARBITRUM_RPC_URL=... \
ARBITRUM_PRIVATE_KEY=0x... \
npx hardhat run scripts/register-asset.ts --network arbitrum
```

### `scripts/revenue-actions.ts`

- **Responsibility**: actions on `RevenueDistributor`:
  - `ACTION=deposit`: deposit USDC as issuer.
  - `ACTION=claim`: claim revenue.
- Common variables:
  - `ACTION`: `"deposit"` or `"claim"`.
  - `DISTRIBUTOR_ADDRESS`: `RevenueDistributor` address.
- For `deposit`:
  - `PAYOUT_TOKEN_ADDRESS`: USDC address.
  - `DEPOSIT_AMOUNT`: amount in smallest units (e.g. `"1000000"` = 1 USDC with 6 decimals).
- For `claim`:
  - `CLAIM_FOR` (optional): if set and different from `msg.sender`, uses `claimFor(user)`; otherwise uses `claim()`.

Deposit example:

```bash
ACTION=deposit \
DISTRIBUTOR_ADDRESS=0xDistributor \
PAYOUT_TOKEN_ADDRESS=0xUSDC \
DEPOSIT_AMOUNT=1000000 \
ARBITRUM_RPC_URL=... \
ARBITRUM_PRIVATE_KEY=0xIssuerKey \
npx hardhat run scripts/revenue-actions.ts --network arbitrum
```

Claim example (for the investor themselves):

```bash
ACTION=claim \
DISTRIBUTOR_ADDRESS=0xDistributor \
ARBITRUM_RPC_URL=... \
ARBITRUM_PRIVATE_KEY=0xInvestorKey \
npx hardhat run scripts/revenue-actions.ts --network arbitrum
```

---

## Network & environment configuration

Networks are defined in `hardhat.config.ts`. For Arbitrum:

- **Environment variables**:
  - `ARBITRUM_RPC_URL` — Arbitrum One RPC endpoint.
  - `ARBITRUM_PRIVATE_KEY` — key of the account that will sign transactions (multisig delegate or operational EOA).
- **Other useful values**:
  - `MULTISIG_ADDRESS` — if you want to separate deployer and logical admin.
  - `USDC_ARBITRUM` — USDC contract address (defaults to Circle native USDC on Arbitrum).

Quick export example:

```bash
export ARBITRUM_RPC_URL="https://arb-mainnet.g.alchemy.com/v2/..."
export ARBITRUM_PRIVATE_KEY="0x..."
export MULTISIG_ADDRESS="0x..."
export USDC_ARBITRUM="0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
```

---

## Tests

### TypeScript tests (`node:test` + viem)

Main tests live in `test/`:

- `RWAPermissionedERC20.ts`
- `RevenueDistributor.ts`
- `AssetRegistry.ts`
- `RWATokenFactory.ts`

Run them with:

```bash
npx hardhat test
```

(In this project we don’t split “solidity” vs “nodejs” suites; everything runs with the command above.)

### Solidity tests (Foundry)

Some contracts also have Solidity tests (`*.t.sol`) intended for Foundry.

Example (if you have Foundry installed):

```bash
forge test
```

---

## Typical production flow

1. **Infrastructure deploy (once)**  
   - Run `scripts/deploy.ts` to deploy `AssetRegistry` and `RWATokenFactory`.

2. **Create a land asset (new RWA token)**  
   - Run `scripts/create-terreno.ts` with `RWA_FACTORY_ADDRESS` and optionally `RWA_NAME` / `RWA_SYMBOL`.
   - Store the share token and `RevenueDistributor` addresses.

3. **Register land metadata & documents**  
   - Run `scripts/register-asset.ts` with `ASSET_REGISTRY_ADDRESS` and `RWA_TOKEN_ADDRESS`.

4. **Daily revenue operations**  
   - Issuer/ops: use `scripts/revenue-actions.ts` with `ACTION=deposit` to deposit revenue into the distributor.
   - Investors / backend / relayers: use `scripts/revenue-actions.ts` with `ACTION=claim` (and optionally `CLAIM_FOR`) to claim.

This flow matches what is described in `docs/ARCHITECTURE_AND_TASKS.md` and the user stories in `docs/context/user_stories.md`.


