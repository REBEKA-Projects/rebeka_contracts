import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

const TOKEN_NAME = "RWA Terreno";
const TOKEN_SYMBOL = "RWA";
const DECIMALS = 0;
const MINT_AMOUNT = 100n;

describe("RWAPermissionedERC20", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  assert.ok(walletClients && walletClients.length >= 7, "need at least 7 test accounts");

  const [adminWallet, issuerWallet, kycAdminWallet, pauserWallet, investor1Wallet, investor2Wallet, otherWallet] =
    walletClients;
  const admin = adminWallet.account.address;
  const issuer = issuerWallet.account.address;
  const kycAdmin = kycAdminWallet.account.address;
  const pauser = pauserWallet.account.address;
  const investor1 = investor1Wallet.account.address;
  const investor2 = investor2Wallet.account.address;
  const other = otherWallet.account.address;

  async function deployToken() {
    const token = await viem.deployContract("RWAPermissionedERC20", [
      TOKEN_NAME,
      TOKEN_SYMBOL,
      DECIMALS,
      admin,
      issuer,
      kycAdmin,
      pauser,
    ]);
    return token;
  }

  function getTokenAs(token: Awaited<ReturnType<typeof deployToken>>, wallet: (typeof walletClients)[0]) {
    return viem.getContractAt("RWAPermissionedERC20", token.address, {
      client: { public: publicClient, wallet },
    });
  }

  describe("mint / burn — solo issuer", function () {
    it("issuer puede mint a sí mismo", async function () {
      const token = await deployToken();
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, MINT_AMOUNT]);
      assert.equal(await token.read.balanceOf([issuer]), MINT_AMOUNT);
      assert.equal(await token.read.totalSupply(), MINT_AMOUNT);
    });

    it("issuer puede mint a inversor allowlisted", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([investor1, MINT_AMOUNT]);
      assert.equal(await token.read.balanceOf([investor1]), MINT_AMOUNT);
    });

    it("issuer no puede mint a no allowlisted", async function () {
      const token = await deployToken();
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await viem.assertions.revertWithCustomError(
        tokenAsIssuer.write.mint([other, MINT_AMOUNT]),
        token,
        "NotAllowed",
      );
    });

    it("no-issuer no puede mint", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsInvestor = await getTokenAs(token, investor1Wallet);
      await viem.assertions.revertWithCustomError(
        tokenAsInvestor.write.mint([investor1, MINT_AMOUNT]),
        token,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("issuer puede burn de sí mismo", async function () {
      const token = await deployToken();
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, MINT_AMOUNT]);
      await tokenAsIssuer.write.burn([issuer, MINT_AMOUNT]);
      assert.equal(await token.read.balanceOf([issuer]), 0n);
      assert.equal(await token.read.totalSupply(), 0n);
    });

    it("no-issuer no puede burn", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([investor1, MINT_AMOUNT]);
      const tokenAsInvestor = await getTokenAs(token, investor1Wallet);
      await viem.assertions.revertWithCustomError(
        tokenAsInvestor.write.burn([investor1, MINT_AMOUNT]),
        token,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("allow / disallow — solo KYC_ADMIN", function () {
    it("KYC_ADMIN puede allowUser", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      assert.equal(await token.read.allowed([investor1]), true);
    });

    it("KYC_ADMIN puede disallowUser", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      await tokenAsKyc.write.disallowUser([investor1]);
      assert.equal(await token.read.allowed([investor1]), false);
    });

    it("no KYC_ADMIN no puede allowUser", async function () {
      const token = await deployToken();
      const tokenAsOther = await getTokenAs(token, otherWallet);
      await viem.assertions.revertWithCustomError(
        tokenAsOther.write.allowUser([investor1]),
        token,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("no KYC_ADMIN no puede disallowUser", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsOther = await getTokenAs(token, otherWallet);
      await viem.assertions.revertWithCustomError(
        tokenAsOther.write.disallowUser([investor1]),
        token,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("transferencias — issuer ↔ allowed only", function () {
    it("issuer → allowed: permite transfer", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, MINT_AMOUNT]);
      await tokenAsIssuer.write.transfer([investor1, 50n]);
      assert.equal(await token.read.balanceOf([issuer]), 50n);
      assert.equal(await token.read.balanceOf([investor1]), 50n);
    });

    it("allowed → issuer: permite transfer", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([investor1, MINT_AMOUNT]);
      const tokenAsInvestor = await getTokenAs(token, investor1Wallet);
      await tokenAsInvestor.write.transfer([issuer, 30n]);
      assert.equal(await token.read.balanceOf([investor1]), 70n);
      assert.equal(await token.read.balanceOf([issuer]), 30n);
    });

    it("investor → investor: revierte", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      await tokenAsKyc.write.allowUser([investor2]);
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([investor1, MINT_AMOUNT]);
      const tokenAsInvestor1 = await getTokenAs(token, investor1Wallet);
      await viem.assertions.revertWithCustomError(
        tokenAsInvestor1.write.transfer([investor2, 10n]),
        token,
        "TransferNotPermitted",
      );
    });

    it("issuer → non-allowed: revierte", async function () {
      const token = await deployToken();
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, MINT_AMOUNT]);
      await viem.assertions.revertWithCustomError(
        tokenAsIssuer.write.transfer([other, 10n]),
        token,
        "TransferNotPermitted",
      );
    });

    it("non-allowed → issuer: revierte", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([other]);
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([other, 10n]);
      await tokenAsKyc.write.disallowUser([other]);
      const tokenAsOther = await getTokenAs(token, otherWallet);
      await viem.assertions.revertWithCustomError(
        tokenAsOther.write.transfer([issuer, 5n]),
        token,
        "TransferNotPermitted",
      );
    });
  });

  describe("pause / unpause", function () {
    it("PAUSER puede pause y unpause", async function () {
      const token = await deployToken();
      const tokenAsPauser = await getTokenAs(token, pauserWallet);
      await tokenAsPauser.write.pause();
      assert.equal(await token.read.paused(), true);
      await tokenAsPauser.write.unpause();
      assert.equal(await token.read.paused(), false);
    });

    it("no PAUSER no puede pause", async function () {
      const token = await deployToken();
      const tokenAsOther = await getTokenAs(token, otherWallet);
      await viem.assertions.revertWithCustomError(
        tokenAsOther.write.pause(),
        token,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("cuando está paused, transfer revierte", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, MINT_AMOUNT]);
      const tokenAsPauser = await getTokenAs(token, pauserWallet);
      await tokenAsPauser.write.pause();
      await viem.assertions.revertWithCustomError(
        tokenAsIssuer.write.transfer([investor1, 10n]),
        token,
        "EnforcedPause",
      );
    });

    it("cuando está paused, mint sigue permitido", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsPauser = await getTokenAs(token, pauserWallet);
      await tokenAsPauser.write.pause();
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([investor1, MINT_AMOUNT]);
      assert.equal(await token.read.balanceOf([investor1]), MINT_AMOUNT);
    });
  });

  describe("setIssuer — solo DEFAULT_ADMIN", function () {
    it("admin puede setIssuer", async function () {
      const token = await deployToken();
      const tokenAsAdmin = await getTokenAs(token, adminWallet);
      await tokenAsAdmin.write.setIssuer([investor1]);
      assert.equal((await token.read.issuer()).toLowerCase(), investor1.toLowerCase());
    });

    it("newIssuer zero revierte", async function () {
      const token = await deployToken();
      const tokenAsAdmin = await getTokenAs(token, adminWallet);
      const zero = "0x0000000000000000000000000000000000000000" as const;
      await viem.assertions.revertWithCustomError(tokenAsAdmin.write.setIssuer([zero]), token, "ZeroAddress");
    });

    it("no admin no puede setIssuer", async function () {
      const token = await deployToken();
      const tokenAsOther = await getTokenAs(token, otherWallet);
      await viem.assertions.revertWithCustomError(
        tokenAsOther.write.setIssuer([investor1]),
        token,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("amount 0 y disallow con tokens", function () {
    it("mint con amount 0 revierte con ZeroAmount", async function () {
      const token = await deployToken();
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await viem.assertions.revertWithCustomError(
        tokenAsIssuer.write.mint([issuer, 0n]),
        token,
        "ZeroAmount",
      );
    });

    it("burn con amount 0 revierte con ZeroAmount", async function () {
      const token = await deployToken();
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, MINT_AMOUNT]);
      await viem.assertions.revertWithCustomError(
        tokenAsIssuer.write.burn([issuer, 0n]),
        token,
        "ZeroAmount",
      );
    });

    it("disallow usuario que ya tiene tokens: no puede transferir a issuer", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([investor1, 50n]);
      await tokenAsKyc.write.disallowUser([investor1]);
      const tokenAsInvestor = await getTokenAs(token, investor1Wallet);
      await viem.assertions.revertWithCustomError(
        tokenAsInvestor.write.transfer([issuer, 10n]),
        token,
        "TransferNotPermitted",
      );
    });

    it("disallow usuario que ya tiene tokens: issuer no puede transferirle", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, 100n]);
      await tokenAsIssuer.write.transfer([investor1, 30n]);
      await tokenAsKyc.write.disallowUser([investor1]);
      await viem.assertions.revertWithCustomError(
        tokenAsIssuer.write.transfer([investor1, 10n]),
        token,
        "TransferNotPermitted",
      );
    });
  });

  describe("rechazo sin rol", function () {
    it("random no puede mint", async function () {
      const token = await deployToken();
      const tokenAsKyc = await getTokenAs(token, kycAdminWallet);
      await tokenAsKyc.write.allowUser([other]);
      const tokenAsOther = await getTokenAs(token, otherWallet);
      await viem.assertions.revertWithCustomError(
        tokenAsOther.write.mint([other, 1n]),
        token,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("random no puede burn", async function () {
      const token = await deployToken();
      const tokenAsIssuer = await getTokenAs(token, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, 1n]);
      const tokenAsOther = await getTokenAs(token, otherWallet);
      await viem.assertions.revertWithCustomError(
        tokenAsOther.write.burn([issuer, 1n]),
        token,
        "AccessControlUnauthorizedAccount",
      );
    });
  });
});
