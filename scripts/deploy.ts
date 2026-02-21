import { network } from "hardhat";

// USDC por red (ver docs/DEPLOY.md)
const DEFAULT_USDC_ARBITRUM = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;
const DEFAULT_USDC_ARBITRUM_SEPOLIA = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" as const;

async function main() {
  // Usa la red pasada con --network (ej. arbitrum, arbitrumSepolia)
  const connection = await network.connect();
  const { viem, networkName } = connection;
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  const masterWallet = (process.env.MASTERWALLET ?? process.env.MULTISIG_ADDRESS ?? deployer.account.address) as `0x${string}`;

  // USDC según red: env tiene prioridad; si no, default por red
  const usdcAddress = (
    networkName === "arbitrumSepolia"
      ? (process.env.USDC_ARBITRUM_SEPOLIA ?? DEFAULT_USDC_ARBITRUM_SEPOLIA)
      : (process.env.USDC_ARBITRUM ?? DEFAULT_USDC_ARBITRUM)
  ) as `0x${string}`;

  console.log("Network:", networkName);
  console.log("Deploy account:", deployer.account.address);
  console.log("Master wallet (se le otorgarán los roles después del deploy):", masterWallet);
  console.log("USDC (payout token):", usdcAddress);

  // Admin inicial = deployer para que pueda hacer grantRole al Router y luego registrar la master wallet
  const initialAdmin = deployer.account.address as `0x${string}`;

  // 1) Deploy AssetRegistry
  console.log("Deploying AssetRegistry...");
  const assetRegistry = await viem.deployContract("AssetRegistry", [initialAdmin]);
  console.log("AssetRegistry deployed at:", assetRegistry.address);

  // 2) Deploy RWAPublicTokenFactory (solo tokens públicos; evita límite EIP-170)
  console.log("Deploying RWAPublicTokenFactory...");
  const publicFactory = await viem.deployContract("RWAPublicTokenFactory", [initialAdmin, usdcAddress]);
  console.log("RWAPublicTokenFactory deployed at:", publicFactory.address);

  // 3) Deploy Router (punto único para createToken + indexación; confidentialFactory = 0 en Arbitrum)
  const routerArgs = [
    initialAdmin,
    publicFactory.address,
    "0x0000000000000000000000000000000000000000" as `0x${string}`,
  ] as const;
  let router: Awaited<ReturnType<typeof viem.deployContract<"RWATokenFactoryRouter">>> | undefined;
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const pendingOrLatest = await publicClient.getTransactionCount({
        address: deployer.account.address,
        blockTag: attempt > 0 ? "latest" : "pending",
      });
      const useNonce = attempt > 0 ? Number(pendingOrLatest) + 1 : pendingOrLatest;
      if (attempt > 0) {
        console.log(`Deploying RWATokenFactoryRouter... (reintento ${attempt + 1}, nonce ${useNonce})`);
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        console.log("Deploying RWATokenFactoryRouter...");
      }
      router = await viem.deployContract("RWATokenFactoryRouter", [...routerArgs], {
        nonce: Number(useNonce),
      } as Parameters<typeof viem.deployContract>[2]);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isNonceError = /nonce.*lower|lower than the current nonce/i.test(msg);
      if (isNonceError && attempt < maxRetries - 1) {
        console.warn("Nonce desactualizado, reintentando en 2s (RPC puede estar desfasado)...");
        continue;
      }
      throw err;
    }
  }
  if (!router) throw new Error("No se pudo desplegar RWATokenFactoryRouter");
  console.log("RWATokenFactoryRouter deployed at:", router.address);

  // 4) El deployer (admin inicial) concede al Router FACTORY_ADMIN_ROLE en el factory
  const factoryAdminRole = await publicFactory.read.FACTORY_ADMIN_ROLE();
  const grantRouterHash = await publicFactory.write.grantRole([factoryAdminRole, router.address]);
  await publicClient.waitForTransactionReceipt({ hash: grantRouterHash });
  console.log("Granted FACTORY_ADMIN_ROLE to Router on RWAPublicTokenFactory.");

  // 5) Si MASTERWALLET es distinta del deployer, el deployer le otorga los roles para que tome el control
  const defaultAdminRole = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
  if (masterWallet.toLowerCase() !== deployer.account.address.toLowerCase()) {
    console.log("\nRegistrando MASTERWALLET como admin en todos los contratos...");
    const grant = async (c: { write: { grantRole: (args: [typeof defaultAdminRole, `0x${string}`]) => Promise<`0x${string}`> } }, role: `0x${string}`) => {
      const h = await c.write.grantRole([role, masterWallet]);
      await publicClient.waitForTransactionReceipt({ hash: h });
    };
    await grant(assetRegistry, defaultAdminRole);
    const registryAdminRole = await assetRegistry.read.REGISTRY_ADMIN_ROLE();
    await grant(assetRegistry, registryAdminRole);
    console.log("  AssetRegistry: DEFAULT_ADMIN_ROLE + REGISTRY_ADMIN_ROLE");
    await grant(publicFactory, defaultAdminRole);
    const factoryAdminRoleForMaster = await publicFactory.read.FACTORY_ADMIN_ROLE();
    await grant(publicFactory, factoryAdminRoleForMaster);
    console.log("  RWAPublicTokenFactory: DEFAULT_ADMIN_ROLE + FACTORY_ADMIN_ROLE");
    await grant(router, defaultAdminRole);
    const routerFactoryRole = await router.read.FACTORY_ADMIN_ROLE();
    await grant(router, routerFactoryRole);
    console.log("  RWATokenFactoryRouter: DEFAULT_ADMIN_ROLE + FACTORY_ADMIN_ROLE");
  } else {
    console.log("(Deployer = MASTERWALLET, no hace falta registrar roles adicionales.)");
  }

  console.log("\n=== Deploy summary ===");
  console.log("AssetRegistry:", assetRegistry.address);
  console.log("RWAPublicTokenFactory:", publicFactory.address);
  console.log("RWATokenFactoryRouter (usar esta dirección para indexación y createToken):", router.address);
  console.log("Admin / MASTERWALLET:", masterWallet);

  // Ejemplo opcional: crear un primer activo (terreno) en la misma ejecución.
  // Descomenta y ajusta los valores si quieres automatizar también esto.
  /*
  const shareName = "RWA Terreno 1";
  const shareSymbol = "RWA1";

  console.log(`\nCreating first RWA token + distributor (${shareName} / ${shareSymbol})...`);
  const hash = await router.write.createToken([
    shareName,
    shareSymbol,
    masterWallet, // admin
    masterWallet, // issuer
    masterWallet, // kycAdmin
    masterWallet, // pauser
  ]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  const createLog = receipt.logs.find((l) => l.address.toLowerCase() === router.address.toLowerCase());
  if (createLog) {
    const decoded = viem.decodeEventLog({
      abi: router.abi,
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

