import { network } from "hardhat";
import { decodeEventLog } from "viem";

async function main() {
  const { viem } = await network.connect({ network: "arbitrum", chainType: "l1" });
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  // Parámetros básicos desde env o hardcodeados
  const factoryAddress = process.env.RWA_FACTORY_ADDRESS as `0x${string}`;
  if (!factoryAddress) {
    throw new Error("RWA_FACTORY_ADDRESS no está definido (usa la dirección de RWATokenFactoryRouter tras el deploy).");
  }

  const masterWallet = (process.env.MASTERWALLET ?? process.env.MULTISIG_ADDRESS ?? deployer.account.address) as `0x${string}`;

  const name = process.env.RWA_NAME ?? "RWA Terreno 1";
  const symbol = process.env.RWA_SYMBOL ?? "RWA1";

  console.log("Deployer:", deployer.account.address);
  console.log("Factory:", factoryAddress);
  console.log("Master wallet (admin/issuer/kycAdmin/pauser):", masterWallet);
  console.log(`Creating share token: ${name} (${symbol})`);

  const factory = await viem.getContractAt("RWATokenFactoryRouter", factoryAddress, {
    client: { public: publicClient, wallet: deployer },
  });

  const hash = await factory.write.createToken([
    name,
    symbol,
    masterWallet, // admin
    masterWallet, // issuer
    masterWallet, // kycAdmin
    masterWallet, // pauser
  ]);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const log = receipt.logs.find((l) => l.address.toLowerCase() === factoryAddress.toLowerCase());
  if (!log) {
    throw new Error("No se encontró el evento TokenCreated en los logs.");
  }

  const decoded = decodeEventLog({
    abi: factory.abi,
    data: log.data,
    topics: log.topics,
  }) as unknown as { eventName: string; args: { token: `0x${string}`; distributor: `0x${string}`; name: string; symbol: string } };

  if (decoded.eventName !== "TokenCreated") {
    throw new Error(`Evento inesperado: ${decoded.eventName}`);
  }

  const { token, distributor } = decoded.args;
  console.log("\n=== Nuevo terreno creado ===");
  console.log("Share token (RWAPermissionedERC20):", token);
  console.log("RevenueDistributor:", distributor);
  console.log("name:", decoded.args.name);
  console.log("symbol:", decoded.args.symbol);

  console.log("\nRecuerda registrar este token en el AssetRegistry usando el script de registro.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

