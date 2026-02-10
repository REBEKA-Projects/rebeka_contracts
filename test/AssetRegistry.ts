import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

describe("AssetRegistry", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  assert.ok(walletClients && walletClients.length >= 3, "need at least 3 test accounts");

  const [adminWallet, issuerWallet, otherWallet] = walletClients;
  const admin = adminWallet.account.address;
  const issuer = issuerWallet.account.address;
  const other = otherWallet.account.address;

  async function deployRegistry() {
    return viem.deployContract("AssetRegistry", [admin]);
  }

  function getRegistryAs(registry: Awaited<ReturnType<typeof deployRegistry>>, wallet: (typeof walletClients)[0]) {
    return viem.getContractAt("AssetRegistry", registry.address, {
      client: { public: publicClient, wallet },
    });
  }

  describe("setMetadata — solo REGISTRY_ADMIN", function () {
    it("admin puede setMetadata", async function () {
      const registry = await deployRegistry();
      const registryAsAdmin = await getRegistryAs(registry, adminWallet);
      const token = issuer;
      const uri = "ipfs://QmMetadata";
      const contentHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;
      await registryAsAdmin.write.setMetadata([token, uri, contentHash]);

      const m = await registry.read.metadata([token]);
      assert.equal(m[0], uri);
      assert.equal(m[1], contentHash);
      assert.ok(BigInt(m[2]) > 0n);
      assert.equal(Number(m[3]), 1);
    });

    it("no-admin no puede setMetadata", async function () {
      const registry = await deployRegistry();
      const registryAsOther = await getRegistryAs(registry, otherWallet);
      const token = issuer;
      const uri = "ipfs://QmMetadata";
      const contentHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;

      await viem.assertions.revertWithCustomError(
        registryAsOther.write.setMetadata([token, uri, contentHash]),
        registry,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("setMetadata con token zero revierte InvalidToken", async function () {
      const registry = await deployRegistry();
      const registryAsAdmin = await getRegistryAs(registry, adminWallet);
      const uri = "ipfs://QmMetadata";
      const contentHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;

      await viem.assertions.revertWithCustomError(
        registryAsAdmin.write.setMetadata(["0x0000000000000000000000000000000000000000", uri, contentHash]),
        registry,
        "InvalidToken",
      );
    });
  });

  describe("upsertDocument — solo REGISTRY_ADMIN", function () {
    it("admin puede upsertDocument", async function () {
      const registry = await deployRegistry();
      const registryAsAdmin = await getRegistryAs(registry, adminWallet);
      const token = issuer;
      const docId = "0xabcd000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
      const name = "Deed";
      const uri = "ipfs://QmDoc";
      const contentHash = "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" as `0x${string}`;
      const mimeType = "application/pdf";
      const gated = true;

      await registryAsAdmin.write.upsertDocument([token, docId, name, uri, contentHash, mimeType, gated]);

      const doc = await registry.read.getDocument([token, docId]);
      assert.equal((doc as { name: string }).name, name);
      assert.equal((doc as { uri: string }).uri, uri);
      assert.equal((doc as { contentHash: `0x${string}` }).contentHash, contentHash);
      assert.equal((doc as { mimeType: string }).mimeType, mimeType);
      assert.equal((doc as { gated: boolean }).gated, gated);
      assert.ok(BigInt((doc as { updatedAt: bigint }).updatedAt) > 0n);
      assert.equal(Number((doc as { version: number }).version), 1);
    });

    it("no-admin no puede upsertDocument", async function () {
      const registry = await deployRegistry();
      const registryAsOther = await getRegistryAs(registry, otherWallet);
      const token = issuer;
      const docId = "0xabcd000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

      await viem.assertions.revertWithCustomError(
        registryAsOther.write.upsertDocument([
          token,
          docId,
          "Deed",
          "ipfs://QmDoc",
          "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
          "application/pdf",
          true,
        ]),
        registry,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("upsertDocument con token zero revierte InvalidToken", async function () {
      const registry = await deployRegistry();
      const registryAsAdmin = await getRegistryAs(registry, adminWallet);
      const docId = "0xabcd000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

      await viem.assertions.revertWithCustomError(
        registryAsAdmin.write.upsertDocument([
          "0x0000000000000000000000000000000000000000",
          docId,
          "Deed",
          "ipfs://QmDoc",
          "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
          "application/pdf",
          true,
        ]),
        registry,
        "InvalidToken",
      );
    });
  });

  describe("getDocument devuelve lo guardado", function () {
    it("getDocument devuelve el documento tras upsertDocument", async function () {
      const registry = await deployRegistry();
      const registryAsAdmin = await getRegistryAs(registry, adminWallet);
      const token = issuer;
      const docId = "0xdeed000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
      const name = "Survey";
      const uri = "ipfs://QmSurvey";
      const contentHash = "0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`;
      const mimeType = "application/pdf";
      const gated = false;

      await registryAsAdmin.write.upsertDocument([token, docId, name, uri, contentHash, mimeType, gated]);
      const doc = await registry.read.getDocument([token, docId]) as { name: string; uri: string; contentHash: `0x${string}`; mimeType: string; gated: boolean; updatedAt: bigint; version: number };
      assert.equal(doc.name, name);
      assert.equal(doc.uri, uri);
      assert.equal(doc.contentHash, contentHash);
      assert.equal(doc.mimeType, mimeType);
      assert.equal(doc.gated, gated);
      assert.ok(BigInt(doc.updatedAt) > 0n);
      assert.equal(doc.version, 1);
    });

    it("getDocument para token/docId no registrado devuelve valores vacíos", async function () {
      const registry = await deployRegistry();
      const token = issuer;
      const docId = "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;

      const doc = await registry.read.getDocument([token, docId]) as { name: string; uri: string; contentHash: string; mimeType: string; gated: boolean; updatedAt: bigint; version: number };
      assert.equal(doc.name ?? "", "");
      assert.equal(doc.uri ?? "", "");
      assert.equal(doc.contentHash ?? "0x", "0x0000000000000000000000000000000000000000000000000000000000000000");
      assert.equal(doc.mimeType ?? "", "");
      assert.equal(doc.gated, false);
      assert.equal(BigInt(doc.updatedAt ?? 0), 0n);
      assert.equal(Number(doc.version ?? 0), 0);
    });
  });

  describe("version y updatedAt se actualizan", function () {
    it("setMetadata incrementa version y updatedAt en cada llamada", async function () {
      const registry = await deployRegistry();
      const registryAsAdmin = await getRegistryAs(registry, adminWallet);
      const token = issuer;
      const hash1 = "0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`;
      const hash2 = "0x2222222222222222222222222222222222222222222222222222222222222222" as `0x${string}`;

      await registryAsAdmin.write.setMetadata([token, "ipfs://v1", hash1]);
      let m = await registry.read.metadata([token]);
      assert.equal(Number(m[3]), 1); // version
      const firstUpdatedAt = BigInt(m[2]);

      await registryAsAdmin.write.setMetadata([token, "ipfs://v2", hash2]);
      m = await registry.read.metadata([token]);
      assert.equal(Number(m[3]), 2); // version
      assert.ok(BigInt(m[2]) >= firstUpdatedAt, "updatedAt debe ser >= al anterior");
    });

    it("upsertDocument incrementa version y updatedAt en cada llamada", async function () {
      const registry = await deployRegistry();
      const registryAsAdmin = await getRegistryAs(registry, adminWallet);
      const token = issuer;
      const docId = "0x76657273696f6e00000000000000000000000000000000000000000000000000" as `0x${string}`; // "version" padded to bytes32
      const hash1 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
      const hash2 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`;

      await registryAsAdmin.write.upsertDocument([token, docId, "Doc", "ipfs://v1", hash1, "application/pdf", false]);
      let doc = await registry.read.getDocument([token, docId]) as { updatedAt: bigint; version: number };
      assert.equal(doc.version, 1);
      const firstUpdatedAt = BigInt(doc.updatedAt);

      await registryAsAdmin.write.upsertDocument([token, docId, "Doc", "ipfs://v2", hash2, "application/pdf", false]);
      doc = await registry.read.getDocument([token, docId]) as { updatedAt: bigint; version: number };
      assert.equal(doc.version, 2);
      assert.ok(BigInt(doc.updatedAt) >= firstUpdatedAt, "updatedAt debe ser >= al anterior");
    });
  });
});
