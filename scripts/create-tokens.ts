import { network } from "hardhat";
import { decodeEventLog } from "viem";

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  const routerAddress = process.env.ROUTER_ADDRESS as `0x${string}`;
  const isConfidential = process.env.CONFIDENTIAL === "1";
  const name = process.env.RWA_NAME ?? (isConfidential ? "Confidential Land 1" : "Public Land 1");
  const symbol = process.env.RWA_SYMBOL ?? (isConfidential ? "CL1" : "PL1");
  const masterWallet = (process.env.MASTERWALLET ?? deployer.account.address) as `0x${string}`;

  if (!routerAddress) {
    throw new Error("ROUTER_ADDRESS must be set");
  }

  console.log(`Network: ${network.name}`);
  console.log(`Router: ${routerAddress}`);
  console.log(`Creating ${isConfidential ? "CONFIDENTIAL" : "PUBLIC"} token: ${name} (${symbol})`);

  const router = await viem.getContractAt("RWATokenFactoryRouter", routerAddress, {
    client: { public: publicClient, wallet: deployer },
  });

  let hash;
  if (isConfidential) {
    hash = await router.write.createConfidentialToken([
      name,
      symbol,
      masterWallet,
      masterWallet,
      masterWallet,
      masterWallet,
    ]);
  } else {
    hash = await router.write.createToken([
      name,
      symbol,
      masterWallet,
      masterWallet,
      masterWallet,
      masterWallet,
    ]);
  }

  console.log("Transaction sent, waiting for receipt...");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  const eventName = isConfidential ? "ConfidentialTokenCreated" : "TokenCreated";
  const log = receipt.logs.find((l) => l.address.toLowerCase() === routerAddress.toLowerCase());
  
  if (!log) {
    throw new Error(`Event ${eventName} not found in logs.`);
  }

  const decoded = decodeEventLog({
    abi: router.abi,
    data: log.data,
    topics: log.topics,
  }) as any;

  console.log("\n=== Success ===");
  console.log(`Token Address: ${decoded.args.token}`);
  console.log(`Distributor: ${decoded.args.distributor}`);
  if (isConfidential) console.log(`Registry: ${decoded.args.registry}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
