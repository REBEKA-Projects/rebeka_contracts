/**
 * Concede o revoca un rol en un contrato con AccessControl (OpenZeppelin).
 * Uso tras el deploy para dar/quitar permisos sin redeploy.
 *
 * Env:
 *   CONTRACT_ARTIFACT  - Nombre del artefacto (ej: RWATokenFactoryRouter, AssetRegistry, RWAPublicTokenFactory).
 *   CONTRACT_ADDRESS   - Dirección del contrato.
 *   ROLE_NAME         - Nombre del rol (ej: FACTORY_ADMIN_ROLE, REGISTRY_ADMIN_ROLE, DEFAULT_ADMIN_ROLE).
 *   GRANT_TO          - Dirección a la que conceder el rol (o revocar si REVOKE=1).
 *   REVOKE            - Opcional. "1" para revocar en lugar de conceder.
 */
import { network } from "hardhat";
import { keccak256, toBytes } from "viem";

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [signer] = await viem.getWalletClients();
  if (!signer) throw new Error("No wallet (configure PRIVATE_KEY para la red).");

  const artifact = process.env.CONTRACT_ARTIFACT ?? "RWATokenFactoryRouter";
  const contractAddress = process.env.CONTRACT_ADDRESS as `0x${string}`;
  const roleName = process.env.ROLE_NAME;
  const grantTo = process.env.GRANT_TO as `0x${string}`;
  const revoke = process.env.REVOKE === "1";

  if (!contractAddress || !roleName || !grantTo) {
    console.error("Uso: CONTRACT_ARTIFACT=? CONTRACT_ADDRESS=0x... ROLE_NAME=? GRANT_TO=0x... [REVOKE=1] npx hardhat run scripts/grant-role.ts --network ...");
    console.error("Ejemplo: CONTRACT_ARTIFACT=RWATokenFactoryRouter CONTRACT_ADDRESS=0x... ROLE_NAME=FACTORY_ADMIN_ROLE GRANT_TO=0x... npx hardhat run scripts/grant-role.ts --network arbitrumSepolia");
    throw new Error("Faltan CONTRACT_ADDRESS, ROLE_NAME o GRANT_TO.");
  }

  const contract = await viem.getContractAt(artifact, contractAddress, {
    client: { public: publicClient, wallet: signer },
  });

  const roleHash =
    roleName === "DEFAULT_ADMIN_ROLE"
      ? ("0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`)
      : (keccak256(toBytes(roleName)) as `0x${string}`);

  if (revoke) {
    const hash = await contract.write.revokeRole([roleHash, grantTo]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Revoked ${roleName} from ${grantTo} on ${contractAddress}`);
  } else {
    const hash = await contract.write.grantRole([roleHash, grantTo]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Granted ${roleName} to ${grantTo} on ${contractAddress}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
