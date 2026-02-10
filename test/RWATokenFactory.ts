import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { decodeEventLog } from "viem";

const TOKEN_NAME = "RWA Terreno A";
const TOKEN_SYMBOL = "RWAA";

describe("RWATokenFactory", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  assert.ok(walletClients && walletClients.length >= 3, "need at least 3 test accounts");

  const [adminWallet, issuerWallet, otherWallet] = walletClients;
  const admin = adminWallet.account.address;
  const issuer = issuerWallet.account.address;
  const other = otherWallet.account.address;

  async function deployPayoutToken() {
    return viem.deployContract("MockERC20", ["USD Coin", "USDC"]);
  }

  async function deployFactory(payoutToken: Awaited<ReturnType<typeof deployPayoutToken>>) {
    return viem.deployContract("RWATokenFactory", [admin, payoutToken.address]);
  }

  function getFactoryAs(factory: Awaited<ReturnType<typeof deployFactory>>, wallet: (typeof walletClients)[0]) {
    return viem.getContractAt("RWATokenFactory", factory.address, {
      client: { public: publicClient, wallet },
    });
  }

  describe("createToken", function () {
    it("FACTORY_ADMIN despliega token y distribuidor en una tx", async function () {
      const payoutToken = await deployPayoutToken();
      const factory = await deployFactory(payoutToken);
      const factoryAsAdmin = await getFactoryAs(factory, adminWallet);

      const hash = await factoryAsAdmin.write.createToken([
        TOKEN_NAME,
        TOKEN_SYMBOL,
        admin,
        issuer,
        admin,
        admin,
      ]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const createLog = receipt.logs.find((l) => l.address.toLowerCase() === factory.address.toLowerCase());
      assert.ok(createLog, "debe emitir TokenCreated");
      const decoded = decodeEventLog({
        abi: factory.abi,
        data: createLog!.data,
        topics: createLog!.topics,
      });
      const tokenAddress = (decoded.args as { token: `0x${string}` }).token;
      const distributorAddress = (decoded.args as { distributor: `0x${string}` }).distributor;

      const token = await viem.getContractAt("RWAPermissionedERC20", tokenAddress, { client: { public: publicClient } });
      const distributor = await viem.getContractAt("RevenueDistributor", distributorAddress, { client: { public: publicClient } });

      assert.equal(await token.read.name(), TOKEN_NAME);
      assert.equal(await token.read.symbol(), TOKEN_SYMBOL);
      assert.equal(await token.read.decimals(), 0);
      assert.equal((await token.read.issuer()).toLowerCase(), issuer.toLowerCase());
      assert.equal((await distributor.read.shareToken()).toLowerCase(), tokenAddress.toLowerCase());
      assert.equal((await distributor.read.payoutToken()).toLowerCase(), payoutToken.address.toLowerCase());
    });

    it("emite TokenCreated con name y symbol", async function () {
      const payoutToken = await deployPayoutToken();
      const factory = await deployFactory(payoutToken);
      const factoryAsAdmin = await getFactoryAs(factory, adminWallet);

      const tx = await factoryAsAdmin.write.createToken([
        "RWA B",
        "RWAB",
        admin,
        issuer,
        admin,
        admin,
      ]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      const createLog = receipt.logs.find((l) => l.address.toLowerCase() === factory.address.toLowerCase());
      assert.ok(createLog);
      const decoded = decodeEventLog({
        abi: factory.abi,
        data: createLog!.data,
        topics: createLog!.topics,
      });
      assert.equal(decoded.eventName, "TokenCreated");
      const args = decoded.args as { token: string; distributor: string; name: string; symbol: string };
      assert.ok(args.token && args.distributor);
      assert.equal(args.name, "RWA B");
      assert.equal(args.symbol, "RWAB");
    });

    it("no FACTORY_ADMIN no puede createToken", async function () {
      const payoutToken = await deployPayoutToken();
      const factory = await deployFactory(payoutToken);
      const factoryAsOther = await getFactoryAs(factory, otherWallet);

      await viem.assertions.revertWithCustomError(
        factoryAsOther.write.createToken([TOKEN_NAME, TOKEN_SYMBOL, admin, issuer, admin, admin]),
        factory,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("constructor", function () {
    it("revierte si factoryAdmin es address(0)", async function () {
      const payoutToken = await deployPayoutToken();
      const factory = await deployFactory(payoutToken);
      const deployPromise = viem.deployContract("RWATokenFactory", ["0x0000000000000000000000000000000000000000", payoutToken.address]);
      await viem.assertions.revertWithCustomError(deployPromise, factory, "ZeroAddress");
    });

    it("revierte si payoutToken es address(0)", async function () {
      const payoutToken = await deployPayoutToken();
      const factory = await deployFactory(payoutToken);
      const deployPromise = viem.deployContract("RWATokenFactory", [admin, "0x0000000000000000000000000000000000000000"]);
      await viem.assertions.revertWithCustomError(deployPromise, factory, "ZeroAddress");
    });
  });
});
