import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  const tokenAddress = process.env.TOKEN_ADDRESS as `0x${string}`;
  const forwarderAddress = process.env.FORWARDer_ADDRESS as `0x${string}`;
  const isConfidential = process.env.CONFIDENTIAL === "1";

  if (!tokenAddress || !forwarderAddress) {
    throw new Error("TOKEN_ADDRESS and FORWARDER_ADDRESS must be set");
  }

  console.log(`Network: ${network.name}`);
  console.log(`Authorizing Forwarder ${forwarderAddress} on ${isConfidential ? "Confidential" : "Public"} Token ${tokenAddress}...`);

  const artifactName = isConfidential ? "RWAConfidentialERC20" : "RWAPermissionedERC20";
  const token = await viem.getContractAt(artifactName, tokenAddress, {
    client: { public: publicClient, wallet: deployer },
  });

  const hash = await token.write.setKeystoneForwarder([forwarderAddress]);
  await publicClient.waitForTransactionReceipt({ hash });

  console.log("Done. Forwarder authorized.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
