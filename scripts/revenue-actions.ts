import { network } from "hardhat";

// Script genérico para:
// - depositar revenue en un RevenueDistributor desde el issuer
// - claimear para un usuario concreto
//
// Usa variables de entorno para decidir qué acción ejecutar:
// - ACTION = "deposit" | "claim" (obligatorio)
// - DISTRIBUTOR_ADDRESS: dirección del RevenueDistributor (obligatorio)
// - PAYOUT_TOKEN_ADDRESS: dirección del token de payout (USDC) cuando ACTION=deposit
// - DEPOSIT_AMOUNT: cantidad a depositar (en unidad mínima, bigint) cuando ACTION=deposit, ej. "1000000" para 1 USDC (6 decimales)
// - CLAIM_FOR: dirección para la que se quiere claimear cuando ACTION=claim (si se omite, usa msg.sender y llama claim()).

async function main() {
  const { viem } = await network.connect({ network: "arbitrum", chainType: "l1" });
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();

  const action = process.env.ACTION;
  if (action !== "deposit" && action !== "claim") {
    throw new Error('ACTION debe ser "deposit" o "claim".');
  }

  const distributorAddress = process.env.DISTRIBUTOR_ADDRESS as `0x${string}`;
  if (!distributorAddress) {
    throw new Error("DISTRIBUTOR_ADDRESS no está definido (RevenueDistributor).");
  }

  console.log("Wallet:", wallet.account.address);
  console.log("RevenueDistributor:", distributorAddress);
  console.log("ACTION:", action);

  const distributor = await viem.getContractAt("RevenueDistributor", distributorAddress, {
    client: { public: publicClient, wallet },
  });

  if (action === "deposit") {
    const payoutTokenAddress = process.env.PAYOUT_TOKEN_ADDRESS as `0x${string}`;
    if (!payoutTokenAddress) {
      throw new Error("PAYOUT_TOKEN_ADDRESS no está definido (token de payout, p. ej. USDC).");
    }

    const rawAmount = process.env.DEPOSIT_AMOUNT;
    if (!rawAmount) {
      throw new Error("DEPOSIT_AMOUNT no está definido.");
    }
    const amount = BigInt(rawAmount);

    console.log("\n=== DEPOSIT ===");
    console.log("Payout token:", payoutTokenAddress);
    console.log("Amount:", amount.toString());

    const payoutToken = await viem.getContractAt("IERC20", payoutTokenAddress, {
      client: { public: publicClient, wallet },
    });

    // approve + deposit
    console.log("Approving distributor to spend payout tokens...");
    const approveHash = await payoutToken.write.approve([distributorAddress, amount]);
    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    console.log("Calling deposit on RevenueDistributor...");
    const depositHash = await distributor.write.deposit([amount]);
    await publicClient.waitForTransactionReceipt({ hash: depositHash });

    console.log("Deposit completed.");
    return;
  }

  if (action === "claim") {
    const claimFor = process.env.CLAIM_FOR as `0x${string}` | undefined;

    console.log("\n=== CLAIM ===");
    if (claimFor && claimFor.toLowerCase() !== wallet.account.address.toLowerCase()) {
      console.log("Calling claimFor for:", claimFor);
      const hash = await distributor.write.claimFor([claimFor]);
      await publicClient.waitForTransactionReceipt({ hash });
      console.log("claimFor completed.");
    } else {
      const user = wallet.account.address as `0x${string}`;
      console.log("Calling claim() for msg.sender:", user);
      const hash = await distributor.write.claim();
      await publicClient.waitForTransactionReceipt({ hash });
      console.log("claim completed.");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

