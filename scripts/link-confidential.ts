import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [signer] = await viem.getWalletClients();

  const routerAddress = process.env.ROUTER_ADDRESS as `0x${string}`;
  const factoryAddress = process.env.CONFIDENTIAL_FACTORY_ADDRESS as `0x${string}`;

  if (!routerAddress || !factoryAddress) {
    throw new Error("ROUTER_ADDRESS and CONFIDENTIAL_FACTORY_ADDRESS must be set");
  }

  console.log(`Linking Router ${routerAddress} to Confidential Factory ${factoryAddress}...`);

  const router = await viem.getContractAt("RWATokenFactoryRouter", routerAddress, {
    client: { public: publicClient, wallet: signer },
  });

  const hash = await router.write.setConfidentialFactory([factoryAddress]);
  await publicClient.waitForTransactionReceipt({ hash });

  console.log("Done. Confidential Factory linked to Router.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
