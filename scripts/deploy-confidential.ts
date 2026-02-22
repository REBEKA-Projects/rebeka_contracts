/**
 * Deploy del factory de tokens confidenciales (FHE) y opcionalmente creación del primer token.
 * Fhenix CoFHE soporta Arbitrum Sepolia, Base Sepolia y Ethereum Sepolia.
 *
 * Env: igual que deploy.ts (MASTERWALLET, USDC por red, RPC y PRIVATE_KEY de la red).
 * Opcional: CONFIDENTIAL_TOKEN_NAME, CONFIDENTIAL_TOKEN_SYMBOL para el primer token.
 * Opcional: CREATE_FIRST_TOKEN=0 para no crear token (solo desplegar el factory).
 *
 * Ejemplo Arbitrum Sepolia:
 *   npx hardhat run scripts/deploy-confidential.ts --network arbitrumSepolia
 */
import { network } from "hardhat";
import { decodeEventLog } from "viem";

const DEFAULT_USDC_ARBITRUM = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const;
const DEFAULT_USDC_ARBITRUM_SEPOLIA = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" as const;

async function main() {
  const connection = await network.connect();
  const { viem, networkName } = connection;
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();
  if (!deployer) throw new Error("No wallet (configura PRIVATE_KEY para la red).");

  const masterWallet = (process.env.MASTERWALLET ?? process.env.MULTISIG_ADDRESS ?? deployer.account.address) as `0x${string}`;
  const usdcAddress = (
    networkName === "arbitrumSepolia"
      ? (process.env.USDC_ARBITRUM_SEPOLIA ?? DEFAULT_USDC_ARBITRUM_SEPOLIA)
      : (process.env.USDC_ARBITRUM ?? DEFAULT_USDC_ARBITRUM)
  ) as `0x${string}`;

  console.log("Network:", networkName);
  console.log("Deploy account:", deployer.account.address);
  console.log("Master wallet (admin/issuer/kycAdmin/pauser del token):", masterWallet);
  console.log("USDC (payout token):", usdcAddress);

  console.log("\nDeploying RWAConfidentialTokenFactory...");
  const confidentialFactory = await viem.deployContract("RWAConfidentialTokenFactory", [deployer.account.address, usdcAddress]);
  console.log("RWAConfidentialTokenFactory:", confidentialFactory.address);

  const tokenName = process.env.CONFIDENTIAL_TOKEN_NAME ?? "RWA Confidential 1";
  const tokenSymbol = process.env.CONFIDENTIAL_TOKEN_SYMBOL ?? "RWC1";

  const createFirst = process.env.CREATE_FIRST_TOKEN !== "0";
  if (createFirst) {
    console.log("\nCreating first confidential token:", tokenName, tokenSymbol);
    const txHash = await confidentialFactory.write.createConfidentialToken([
      tokenName,
      tokenSymbol,
      masterWallet,
      masterWallet,
      masterWallet,
      masterWallet,
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    let tokenAddress: string | undefined;
    for (const l of receipt.logs) {
      if (l.address.toLowerCase() !== confidentialFactory.address.toLowerCase()) continue;
      try {
        const d = decodeEventLog({ abi: confidentialFactory.abi, data: l.data, topics: l.topics });
        if (d.eventName === "ConfidentialTokenCreated" && (d.args as { token?: string }).token) {
          tokenAddress = (d.args as { token: string }).token;
          break;
        }
      } catch {
        continue;
      }
    }
    if (tokenAddress) {
      console.log("RWAConfidentialERC20 (token):", tokenAddress);
      console.log("\nPara mintear a un usuario whitelisteado:");
      console.log("  export RWA_CONFIDENTIAL_TOKEN_ADDRESS=" + tokenAddress);
      console.log("  export USER_TO_ALLOW_AND_MINT=0x...");
      console.log("  npx hardhat run scripts/mint-confidential.ts --network", networkName);
    }
  }

  console.log("\n=== Resumen ===");
  console.log("RWAConfidentialTokenFactory:", confidentialFactory.address);
  if (createFirst) console.log("(Primer token creado; usa RWA_CONFIDENTIAL_TOKEN_ADDRESS en mint-confidential.ts)");
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
