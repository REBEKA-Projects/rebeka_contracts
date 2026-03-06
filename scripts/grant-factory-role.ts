import { network } from "hardhat";
import { keccak256, toBytes } from "viem";

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [signer] = await viem.getWalletClients();

  const factoryAddress = process.env.FACTORY_ADDRESS as `0x${string}`;
  const routerAddress = process.env.ROUTER_ADDRESS as `0x${string}`;

  if (!factoryAddress || !routerAddress) {
    throw new Error("FACTORY_ADDRESS and ROUTER_ADDRESS must be set");
  }

  console.log(`Granting FACTORY_ADMIN_ROLE to Router ${routerAddress} on Factory ${factoryAddress}...`);

  const factory = await viem.getContractAt("RWAConfidentialTokenFactory", factoryAddress, {
    client: { public: publicClient, wallet: signer },
  });

  const roleHash = keccak256(toBytes("FACTORY_ADMIN_ROLE"));

  const hash = await factory.write.grantRole([roleHash, routerAddress]);
  await publicClient.waitForTransactionReceipt({ hash });

  console.log("Done. Role granted.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
