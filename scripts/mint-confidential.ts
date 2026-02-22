/**
 * Script para mintear tokens a un usuario whitelisteado en un RWAConfidentialERC20 (versión FHE).
 * Siempre usa mintEncrypted + cofhejs: el amount se cifra antes de enviar y no aparece en calldata.
 * El cifrado se hace en un helper CJS (mint-encrypt-helper.cjs) para evitar "Dynamic require of stream" en ESM.
 *
 * Env:
 *   RWA_CONFIDENTIAL_TOKEN_ADDRESS - Dirección del contrato RWAConfidentialERC20.
 *   USER_TO_ALLOW_AND_MINT         - Dirección del usuario a whitelistear y a quien mintear.
 *   MINT_AMOUNT                    - Opcional. Cantidad a mintear (entero, default 100).
 *   ALLOW_ONLY                     - Opcional. "1" = solo whitelistear, no mintear.
 *   Para el helper (mismo que la red): ARBITRUM_SEPOLIA_RPC_URL, ARBITRUM_SEPOLIA_PRIVATE_KEY (o RPC_URL, PRIVATE_KEY).
 *
 * Quien ejecuta debe tener KYC_ADMIN_ROLE (para allowUser) e ISSUER_ROLE (para mintEncrypted).
 */
import { network } from "hardhat";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const connection = await network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [signer] = await viem.getWalletClients();
  if (!signer) throw new Error("No wallet (configura PRIVATE_KEY para la red).");

  const tokenAddress = process.env.RWA_CONFIDENTIAL_TOKEN_ADDRESS as `0x${string}`;
  const userToAllow = process.env.USER_TO_ALLOW_AND_MINT as `0x${string}`;
  const mintAmount = BigInt(process.env.MINT_AMOUNT ?? "100");
  const allowOnly = process.env.ALLOW_ONLY === "1";

  if (!tokenAddress || !userToAllow) {
    console.error(
      "Uso: RWA_CONFIDENTIAL_TOKEN_ADDRESS=0x... USER_TO_ALLOW_AND_MINT=0x... [MINT_AMOUNT=100] [ALLOW_ONLY=1] npx hardhat run scripts/mint-confidential.ts --network <red>",
    );
    throw new Error("Faltan RWA_CONFIDENTIAL_TOKEN_ADDRESS o USER_TO_ALLOW_AND_MINT.");
  }

  const token = await viem.getContractAt("RWAConfidentialERC20", tokenAddress, {
    client: { public: publicClient, wallet: signer },
  });

  let name: string;
  let symbol: string;
  try {
    name = await token.read.name();
    symbol = await token.read.symbol();
  } catch {
    throw new Error(
      "La dirección no es un RWAConfidentialERC20 (p. ej. name() revirtió). " +
        "RWA_CONFIDENTIAL_TOKEN_ADDRESS debe ser el token FHE creado con createConfidentialToken (p. ej. con scripts/deploy-confidential.ts). " +
        "No uses la dirección del Router. En Arbitrum Sepolia puedes crear el token con: npx hardhat run scripts/deploy-confidential.ts --network arbitrumSepolia",
    );
  }

  const kycAdminRole = await token.read.KYC_ADMIN_ROLE();
  const issuerRole = await token.read.ISSUER_ROLE();
  const signerHasKyc = await token.read.hasRole([kycAdminRole, signer.account.address]);
  const signerHasIssuer = await token.read.hasRole([issuerRole, signer.account.address]);
  if (!signerHasKyc || (!allowOnly && !signerHasIssuer)) {
    throw new Error(
      "El signer (" +
        signer.account.address +
        ") no tiene KYC_ADMIN_ROLE o ISSUER_ROLE en este token. " +
        "Quien creó el token (createConfidentialToken) asignó admin/issuer/kycAdmin/pauser; ejecuta este script con la clave privada de esa cuenta (p. ej. MASTERWALLET). " +
        "Configura ARBITRUM_SEPOLIA_PRIVATE_KEY (o la de la red que uses) con la clave de la wallet que tiene los roles en el token.",
    );
  }

  const alreadyAllowed = await token.read.allowed([userToAllow]);

  console.log("Token confidencial (FHE):", tokenAddress);
  console.log("  name:", name, "symbol:", symbol);
  console.log("Usuario:", userToAllow);
  console.log("Signer:", signer.account.address);

  if (!alreadyAllowed) {
    console.log("\nWhitelisteando usuario (allowUser)...");
    const allowHash = await token.write.allowUser([userToAllow]);
    await publicClient.waitForTransactionReceipt({ hash: allowHash });
    console.log("  Usuario whitelisteado.");
  } else {
    console.log("\nUsuario ya estaba whitelisteado.");
  }

  if (!allowOnly) {
    if (mintAmount <= 0n) {
      console.log("MINT_AMOUNT no definido o 0; no se mintea.");
    } else {
      const networkName = process.env.HARDHAT_NETWORK ?? "arbitrumSepolia";
      console.log("\nCifrando amount con cofhejs (helper CJS)...");
      const helperPath = path.join(__dirname, "mint-encrypt-helper.cjs");
      const payloadJson = execSync(
        `node "${helperPath}"`,
        {
          encoding: "utf-8",
          env: {
            ...process.env,
            ENCRYPT_FOR_NETWORK: networkName,
            MINT_AMOUNT: mintAmount.toString(),
          },
        },
      ).trim();
      const payload = JSON.parse(payloadJson) as {
        ctHash: string;
        securityZone: number;
        utype: number;
        signature: string;
      };
      const inEuint128 = {
        ctHash: BigInt(payload.ctHash),
        securityZone: payload.securityZone,
        utype: payload.utype,
        signature: (payload.signature.startsWith("0x")
          ? payload.signature
          : "0x" + payload.signature) as `0x${string}`,
      };

      console.log("Minteando con mintEncrypted (amount no va en calldata)...");
      type WithMintEncrypted = typeof token & {
        write: typeof token.write & {
          mintEncrypted: (args: [typeof userToAllow, typeof inEuint128]) => Promise<`0x${string}`>;
        };
      };
      const mintHash = await (token as WithMintEncrypted).write.mintEncrypted([
        userToAllow,
        inEuint128,
      ]);
      await publicClient.waitForTransactionReceipt({ hash: mintHash });
      console.log("  MintEncrypted OK. El amount no es visible on-chain.");
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
