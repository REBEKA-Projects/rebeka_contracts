import { network } from "hardhat";

// USDC nativo en Arbitrum One (ver docs/DEPLOY.md)
const DEFAULT_USDC_ARBITRUM = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;

async function main() {
  // Conectamos explícitamente a la red arbitrum definida en hardhat.config.ts
  const { viem } = await network.connect({ network: "arbitrum", chainType: "l1" });
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  // Multisig / admin que tendrá los roles de admin/issuer/kycAdmin/pauser/factoryAdmin/registryAdmin
  const multisig = (process.env.MULTISIG_ADDRESS ?? deployer.account.address) as `0x${string}`;

  // Dirección de USDC en Arbitrum (puede sobreescribirse por env)
  const usdcAddress = (process.env.USDC_ARBITRUM ?? DEFAULT_USDC_ARBITRUM) as `0x${string}`;

  console.log("Deploy account:", deployer.account.address);
  console.log("Multisig / admin:", multisig);
  console.log("USDC (payout token):", usdcAddress);

  // 1) Deploy AssetRegistry
  console.log("Deploying AssetRegistry...");
  const assetRegistry = await viem.deployContract("AssetRegistry", [multisig]);
  console.log("AssetRegistry deployed at:", assetRegistry.address);

  // 2) Deploy RWATokenFactory (admin = multisig, payoutToken = USDC)
  console.log("Deploying RWATokenFactory...");
  const tokenFactory = await viem.deployContract("RWATokenFactory", [multisig, usdcAddress]);
  console.log("RWATokenFactory deployed at:", tokenFactory.address);

  console.log("\n=== Deploy summary ===");
  console.log("AssetRegistry:", assetRegistry.address);
  console.log("RWATokenFactory:", tokenFactory.address);

  // Ejemplo opcional: crear un primer activo (terreno) en la misma ejecución.
  // Descomenta y ajusta los valores si quieres automatizar también esto.
  /*
  const shareName = "RWA Terreno 1";
  const shareSymbol = "RWA1";

  console.log(`\nCreating first RWA token + distributor (${shareName} / ${shareSymbol})...`);
  const hash = await tokenFactory.write.createToken([
    shareName,
    shareSymbol,
    multisig, // admin
    multisig, // issuer
    multisig, // kycAdmin
    multisig, // pauser
  ]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  const createLog = receipt.logs.find((l) => l.address.toLowerCase() === tokenFactory.address.toLowerCase());
  if (createLog) {
    const decoded = viem.decodeEventLog({
      abi: tokenFactory.abi,
      data: createLog.data,
      topics: createLog.topics,
    }) as { eventName: string; args: { token: `0x${string}`; distributor: `0x${string}`; name: string; symbol: string } };

    console.log("TokenCreated event:", decoded.args);
    const { token, distributor } = decoded.args;

    console.log("\nNow you can register the token in AssetRegistry, for example:");
    console.log(" - assetRegistry.setMetadata(", token, ', "ipfs://.../metadata.json", <contentHash> )');
    console.log(" - assetRegistry.upsertDocument(", token, ", <docId>, <name>, <uri>, <hash>, <mime>, <gated>)");
  }
  */

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

