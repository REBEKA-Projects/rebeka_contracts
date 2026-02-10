import { network } from "hardhat";

// Script para registrar metadata y documentos de un token en AssetRegistry.
// Parámetros principales via env:
// - ASSET_REGISTRY_ADDRESS: dirección del AssetRegistry.
// - RWA_TOKEN_ADDRESS: dirección del share token a registrar.
// - METADATA_URI, METADATA_HASH: metadata principal.
// - DOC_ID, DOC_NAME, DOC_URI, DOC_HASH, DOC_MIME, DOC_GATED: primer documento opcional.

async function main() {
  const { viem } = await network.connect({ network: "arbitrum", chainType: "l1" });
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  const registryAddress = process.env.ASSET_REGISTRY_ADDRESS as `0x${string}`;
  if (!registryAddress) {
    throw new Error("ASSET_REGISTRY_ADDRESS no está definido (dirección de AssetRegistry).");
  }

  const token = process.env.RWA_TOKEN_ADDRESS as `0x${string}`;
  if (!token) {
    throw new Error("RWA_TOKEN_ADDRESS no está definido (dirección del share token a registrar).");
  }

  const metadataUri = process.env.METADATA_URI ?? "ipfs://.../metadata.json";
  const metadataHash = (process.env.METADATA_HASH ??
    "0x0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`;

  console.log("Deployer:", deployer.account.address);
  console.log("AssetRegistry:", registryAddress);
  console.log("Token a registrar:", token);

  const registry = await viem.getContractAt("AssetRegistry", registryAddress, {
    client: { public: publicClient, wallet: deployer },
  });

  // 1) setMetadata
  console.log("\nLlamando setMetadata...");
  const hashSet = await registry.write.setMetadata([token, metadataUri, metadataHash]);
  await publicClient.waitForTransactionReceipt({ hash: hashSet });
  console.log("Metadata registrada.");

  // 2) upsertDocument opcional, si se pasa DOC_ID
  const docId = process.env.DOC_ID as `0x${string}` | undefined;
  if (docId) {
    const name = process.env.DOC_NAME ?? "Deed";
    const uri = process.env.DOC_URI ?? "ipfs://.../deed.pdf";
    const contentHash = (process.env.DOC_HASH ??
      "0x0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`;
    const mimeType = process.env.DOC_MIME ?? "application/pdf";
    const gated = (process.env.DOC_GATED ?? "true").toLowerCase() === "true";

    console.log("\nLlamando upsertDocument...");
    const hashDoc = await registry.write.upsertDocument([token, docId, name, uri, contentHash, mimeType, gated]);
    await publicClient.waitForTransactionReceipt({ hash: hashDoc });
    console.log("Documento registrado/actualizado.");
  } else {
    console.log("\nDOC_ID no definido, se ha omitido upsertDocument.");
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

