## Rebeka RWA Contracts

Contratos y scripts para la tokenización de RWA (terrenos) en Arbitrum:

- **RWAPermissionedERC20**: token de participación (1 token = 1 m², `decimals = 0`) con KYC/allowlist.
- **RevenueDistributor**: distribuidor de revenue en USDC para los holders del token.
- **AssetRegistry**: registro on-chain de metadata y documentos (URIs + hashes) por token.
- **RWATokenFactory**: factory que despliega, por terreno, un `RWAPermissionedERC20` y su `RevenueDistributor` asociado.

Todo el proyecto está montado sobre **Hardhat 3** + **viem** y tests en TypeScript con `node:test`, más tests de Solidity para algunas piezas.

---

## Contratos

### RWAPermissionedERC20
- **Fichero**: `contracts/RWAPermissionedERC20.sol`
- **Rol de acceso**:
  - `DEFAULT_ADMIN_ROLE`: configuración general.
  - `ISSUER_ROLE`: puede `mint` / `burn`.
  - `KYC_ADMIN_ROLE`: puede `allowUser` / `disallowUser`.
  - `PAUSER_ROLE`: puede pausar / despausar transferencias.
- **Política de transferencias**:
  - Solo se permiten transferencias **issuer ↔ inversores allowlisted**.
  - `mint` y `burn` no se pausan, solo las `transfer`.
- **Decimals**:
  - `decimals` configurable pero en deploy de RWA se fija a **0** (1 token = 1 m²).

### RevenueDistributor
- **Fichero**: `contracts/RevenueDistributor.sol`
- **Propósito**: distribuir un token de payout (USDC en Arbitrum) a los holders del share token.
- **Características**:
  - Modelo **pull**: el issuer llama `deposit(amount)` y los usuarios reclaman con `claim()` / `claimFor(user)`.
  - `ACC_PRECISION = 1e27` para minimizar errores de redondeo.
  - `checkpoint(user)` debe llamarse desde el backend cada vez que cambie el balance de share tokens de un usuario (mint/burn/transfer).
  - Solo issuer y usuarios KYC (allowlisted) pueden `claim`.
  - Protección contra reentradas en `deposit`, `claim` y `claimFor`.

### AssetRegistry
- **Fichero**: `contracts/AssetRegistry.sol`
- **Rol de acceso**:
  - `REGISTRY_ADMIN_ROLE`: único rol que puede modificar metadata y documentos.
- **Estructuras**:
  - `MetadataRef { uri, contentHash, updatedAt, version }`
  - `DocumentRef { name, uri, contentHash, mimeType, gated, updatedAt, version }`
- **Funciones principales**:
  - `setMetadata(token, uri, contentHash)` — guarda URI + hash para el token, incrementa versión.
  - `upsertDocument(token, docId, name, uri, contentHash, mimeType, gated)` — crea/actualiza documento referenciado, con versionado.
  - `getDocument(token, docId)` — devuelve la versión actual del documento.
- **Validaciones**:
  - Constructor y métodos de escritura validan que los parámetros de address no sean `address(0)` (`ZeroAddress`, `InvalidToken`).

### RWATokenFactory
- **Fichero**: `contracts/RWATokenFactory.sol`
- **Rol de acceso**:
  - `FACTORY_ADMIN_ROLE`: puede crear nuevos activos (terrenos).
- **Constructor**:
  - `RWATokenFactory(address factoryAdmin, IERC20 payoutToken_)`
  - `factoryAdmin` recibe `DEFAULT_ADMIN_ROLE` y `FACTORY_ADMIN_ROLE`.
  - `payoutToken_` debe ser la dirección de **USDC en Arbitrum**.
- **Función principal**:
  - `createToken(name, symbol, admin, issuer, kycAdmin, pauser)`:
    - Despliega `RWAPermissionedERC20(name, symbol, 0, admin, issuer, kycAdmin, pauser)`.
    - Despliega `RevenueDistributor(admin, issuer, pauser, payoutToken, token)`.
    - Emite `TokenCreated(token, distributor, name, symbol)`.

---

## Scripts

Todos los scripts usan Hardhat + viem y asumen que ya tienes configuradas las variables de entorno de red (ver más abajo).

### `scripts/deploy.ts`

- **Responsabilidad**: despliegue inicial de los contratos “infraestructura”:
  - `AssetRegistry`
  - `RWATokenFactory`
- Usa:
  - `MULTISIG_ADDRESS` como admin (o la propia cuenta del `ARBITRUM_PRIVATE_KEY` si no se define).
  - `USDC_ARBITRUM` (o el valor por defecto `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`).
- Salida:
  - Dirección de `AssetRegistry`.
  - Dirección de `RWATokenFactory`.

Ejemplo:

```bash
ARBITRUM_RPC_URL=... \
ARBITRUM_PRIVATE_KEY=0x... \
MULTISIG_ADDRESS=0xTuMultisig \
USDC_ARBITRUM=0xaf88d065e77c8cC2239327C5EDb3A432268e5831 \
npx hardhat run scripts/deploy.ts --network arbitrum
```

### `scripts/create-terreno.ts`

- **Responsabilidad**: crear un nuevo terreno (par share token + distribuidor) usando el `RWATokenFactory`.
- Variables:
  - `RWA_FACTORY_ADDRESS` (obligatoria): dirección del `RWATokenFactory`.
  - `MULTISIG_ADDRESS` (opcional): admin/issuer/kycAdmin/pauser; si no se define, usa el deployer.
  - `RWA_NAME` / `RWA_SYMBOL` (opcionales): nombre y símbolo del nuevo token.
- Salida:
  - Dirección del `RWAPermissionedERC20` creado.
  - Dirección del `RevenueDistributor` asociado.

Ejemplo:

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

- **Responsabilidad**: registrar metadata y documentos de un share token en el `AssetRegistry`.
- Variables:
  - `ASSET_REGISTRY_ADDRESS` (obligatoria): dirección del `AssetRegistry`.
  - `RWA_TOKEN_ADDRESS` (obligatoria): share token a registrar.
  - `METADATA_URI`, `METADATA_HASH` (opcionales): metadata principal.
  - `DOC_ID` (bytes32, opcional). Si se define, se llama también a `upsertDocument` con:
    - `DOC_NAME`, `DOC_URI`, `DOC_HASH`, `DOC_MIME`, `DOC_GATED`.

Ejemplo mínimo (solo metadata):

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

- **Responsabilidad**: acciones sobre `RevenueDistributor`:
  - `ACTION=deposit`: depositar USDC como issuer.
  - `ACTION=claim`: claimear revenue.
- Variables comunes:
  - `ACTION`: `"deposit"` o `"claim"`.
  - `DISTRIBUTOR_ADDRESS`: dirección del `RevenueDistributor`.
- Para `deposit`:
  - `PAYOUT_TOKEN_ADDRESS`: dirección de USDC.
  - `DEPOSIT_AMOUNT`: cantidad en unidades mínimas (ej. `"1000000"` = 1 USDC con 6 decimales).
- Para `claim`:
  - `CLAIM_FOR` (opcional): si se define y es distinta de `msg.sender`, se usa `claimFor(user)`; si no, `claim()`.

Ejemplo deposit:

```bash
ACTION=deposit \
DISTRIBUTOR_ADDRESS=0xDistributor \
PAYOUT_TOKEN_ADDRESS=0xUSDC \
DEPOSIT_AMOUNT=1000000 \
ARBITRUM_RPC_URL=... \
ARBITRUM_PRIVATE_KEY=0xIssuerKey \
npx hardhat run scripts/revenue-actions.ts --network arbitrum
```

Ejemplo claim para el propio inversor:

```bash
ACTION=claim \
DISTRIBUTOR_ADDRESS=0xDistributor \
ARBITRUM_RPC_URL=... \
ARBITRUM_PRIVATE_KEY=0xInvestorKey \
npx hardhat run scripts/revenue-actions.ts --network arbitrum
```

---

## Configuración de red y entorno

Las redes están definidas en `hardhat.config.ts`. Para Arbitrum:

- **Variables de entorno**:
  - `ARBITRUM_RPC_URL` — endpoint RPC de Arbitrum One.
  - `ARBITRUM_PRIVATE_KEY` — clave de la cuenta que firmará las tx (multisig o EOA operativa).
- **Otros valores útiles**:
  - `MULTISIG_ADDRESS` — si se quiere separar deployer y admin lógico.
  - `USDC_ARBITRUM` — dirección del contrato USDC (por defecto la de Circle nativo).

Ejemplo de export rápido:

```bash
export ARBITRUM_RPC_URL="https://arb-mainnet.g.alchemy.com/v2/..."
export ARBITRUM_PRIVATE_KEY="0x..."
export MULTISIG_ADDRESS="0x..."
export USDC_ARBITRUM="0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
```

---

## Tests

### Tests TypeScript (`node:test` + viem)

Los tests principales están en `test/`:

- `RWAPermissionedERC20.ts`
- `RevenueDistributor.ts`
- `AssetRegistry.ts`
- `RWATokenFactory.ts`

Para ejecutarlos:

```bash
npx hardhat test
```

(En este proyecto no distinguimos entre “solidity” y “nodejs” suites, todos se ejecutan con el comando anterior).

### Tests Solidity (Foundry)

Algunos contratos tienen tests en Solidity (`*.t.sol`) pensados para Foundry.

Ejemplo (si tienes Foundry instalado):

```bash
forge test
```

---

## Flujo típico de uso en producción

1. **Deploy de infraestructura (una sola vez)**  
   - Ejecutar `scripts/deploy.ts` para desplegar `AssetRegistry` y `RWATokenFactory`.

2. **Crear un terreno (nuevo activo)**  
   - Ejecutar `scripts/create-terreno.ts` con `RWA_FACTORY_ADDRESS` y opcionalmente `RWA_NAME`/`RWA_SYMBOL`.
   - Guardar las direcciones de share token y `RevenueDistributor`.

3. **Registrar metadata y documentos del terreno**  
   - Ejecutar `scripts/register-asset.ts` con `ASSET_REGISTRY_ADDRESS` y `RWA_TOKEN_ADDRESS`.

4. **Operación diaria de revenue**  
   - Issuer/operaciones: usan `scripts/revenue-actions.ts` con `ACTION=deposit` para depositar revenue en el distribuidor.
   - Inversores / backend / relayers: usan `scripts/revenue-actions.ts` con `ACTION=claim` (y opcionalmente `CLAIM_FOR`) para claimear.

Este flujo refleja lo descrito en `docs/ARCHITECTURE_AND_TASKS.md` y en las user stories de `docs/context/user_stories.md`.

