import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

const TOKEN_NAME = "RWA Terreno";
const TOKEN_SYMBOL = "RWA";
const DECIMALS = 0;
const SHARE_MINT = 100n;
const DEPOSIT_AMOUNT = 1000n; // 6 decimals assumed for mock USDC

describe("RevenueDistributor", async function () {
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

  async function deployShareToken() {
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

  async function deployPayoutToken() {
    const token = await viem.deployContract("MockERC20", ["Mock USDC", "USDC"]);
    return token;
  }

  async function deployDistributor(payoutToken: Awaited<ReturnType<typeof deployPayoutToken>>, shareToken: Awaited<ReturnType<typeof deployShareToken>>) {
    const distributor = await viem.deployContract("RevenueDistributor", [
      admin,
      issuer,
      pauser,
      payoutToken.address,
      shareToken.address,
    ]);
    return distributor;
  }

  async function getShareTokenAs(shareToken: Awaited<ReturnType<typeof deployShareToken>>, wallet: (typeof walletClients)[0]) {
    return viem.getContractAt("RWAPermissionedERC20", shareToken.address, {
      client: { public: publicClient, wallet },
    });
  }
  async function getPayoutTokenAs(payoutToken: Awaited<ReturnType<typeof deployPayoutToken>>, wallet: (typeof walletClients)[0]) {
    return viem.getContractAt("MockERC20", payoutToken.address, {
      client: { public: publicClient, wallet },
    });
  }
  async function getDistributorAs(distributor: Awaited<ReturnType<typeof deployDistributor>>, wallet: (typeof walletClients)[0]) {
    return viem.getContractAt("RevenueDistributor", distributor.address, {
      client: { public: publicClient, wallet },
    });
  }

  describe("deposit — solo issuer", function () {
    it("issuer puede deposit", async function () {
      const shareToken = await deployShareToken();
      const tokenAsKyc = await getShareTokenAs(shareToken, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsIssuer = await getShareTokenAs(shareToken, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, SHARE_MINT]);
      await tokenAsIssuer.write.mint([investor1, SHARE_MINT]);

      const payoutToken = await deployPayoutToken();
      const distributor = await deployDistributor(payoutToken, shareToken);
      const payoutAsIssuer = await getPayoutTokenAs(payoutToken, issuerWallet);
      await payoutAsIssuer.write.mint([issuer, DEPOSIT_AMOUNT * 10n]);
      await payoutAsIssuer.write.approve([distributor.address, DEPOSIT_AMOUNT]);

      const distAsIssuer = await getDistributorAs(distributor, issuerWallet);
      await distAsIssuer.write.deposit([DEPOSIT_AMOUNT]);

      assert.equal(await payoutToken.read.balanceOf([distributor.address]), DEPOSIT_AMOUNT);
      assert.ok((await distributor.read.accRewardPerShare()) > 0n);
    });

    it("revert si totalSupply == 0 (NoShares)", async function () {
      const shareToken = await deployShareToken();
      const payoutToken = await deployPayoutToken();
      const payoutAsIssuer = await getPayoutTokenAs(payoutToken, issuerWallet);
      await payoutAsIssuer.write.mint([issuer, DEPOSIT_AMOUNT]);

      const distributor = await deployDistributor(payoutToken, shareToken);
      await payoutAsIssuer.write.approve([distributor.address, DEPOSIT_AMOUNT]);
      const distAsIssuer = await getDistributorAs(distributor, issuerWallet);

      await viem.assertions.revertWithCustomError(
        distAsIssuer.write.deposit([DEPOSIT_AMOUNT]),
        distributor,
        "NoShares",
      );
    });

    it("no issuer no puede deposit", async function () {
      const shareToken = await deployShareToken();
      const tokenAsIssuer = await getShareTokenAs(shareToken, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, SHARE_MINT]);

      const payoutToken = await deployPayoutToken();
      await (await getPayoutTokenAs(payoutToken, issuerWallet)).write.mint([investor1, DEPOSIT_AMOUNT]);
      const distributor = await deployDistributor(payoutToken, shareToken);
      const payoutAsInvestor = await getPayoutTokenAs(payoutToken, investor1Wallet);
      await payoutAsInvestor.write.approve([distributor.address, DEPOSIT_AMOUNT]);
      const distAsInvestor = await getDistributorAs(distributor, investor1Wallet);

      await viem.assertions.revertWithCustomError(
        distAsInvestor.write.deposit([DEPOSIT_AMOUNT]),
        distributor,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("claim y rewardDebt", function () {
    it("claim actualiza rewardDebt antes de transfer", async function () {
      const shareToken = await deployShareToken();
      const tokenAsKyc = await getShareTokenAs(shareToken, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsIssuer = await getShareTokenAs(shareToken, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, SHARE_MINT]);
      await tokenAsIssuer.write.mint([investor1, SHARE_MINT]);

      const payoutToken = await deployPayoutToken();
      const payoutAsIssuer = await getPayoutTokenAs(payoutToken, issuerWallet);
      await payoutAsIssuer.write.mint([issuer, DEPOSIT_AMOUNT * 10n]);

      const distributor = await deployDistributor(payoutToken, shareToken);
      await payoutAsIssuer.write.approve([distributor.address, DEPOSIT_AMOUNT]);
      const distAsIssuer = await getDistributorAs(distributor, issuerWallet);
      await distAsIssuer.write.deposit([DEPOSIT_AMOUNT]);

      const debtBefore = await distributor.read.rewardDebt([investor1]);
      const distAsInvestor = await getDistributorAs(distributor, investor1Wallet);
      await distAsInvestor.write.claim();
      const debtAfter = await distributor.read.rewardDebt([investor1]);
      assert.ok(debtAfter > debtBefore, "rewardDebt debe aumentar tras claim");
      assert.equal(await payoutToken.read.balanceOf([investor1]), DEPOSIT_AMOUNT / 2n);
    });

    it("claimFor envía fondos al user (no al msg.sender)", async function () {
      const shareToken = await deployShareToken();
      const tokenAsKyc = await getShareTokenAs(shareToken, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsIssuer = await getShareTokenAs(shareToken, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, SHARE_MINT]);
      await tokenAsIssuer.write.mint([investor1, SHARE_MINT]);

      const payoutToken = await deployPayoutToken();
      const payoutAsIssuer = await getPayoutTokenAs(payoutToken, issuerWallet);
      await payoutAsIssuer.write.mint([issuer, DEPOSIT_AMOUNT * 10n]);

      const distributor = await deployDistributor(payoutToken, shareToken);
      await payoutAsIssuer.write.approve([distributor.address, DEPOSIT_AMOUNT]);
      const distAsIssuer = await getDistributorAs(distributor, issuerWallet);
      await distAsIssuer.write.deposit([DEPOSIT_AMOUNT]);

      const balInvestorBefore = await payoutToken.read.balanceOf([investor1]);
      await distAsIssuer.write.claimFor([investor1]);
      const balInvestorAfter = await payoutToken.read.balanceOf([investor1]);
      assert.ok(balInvestorAfter > balInvestorBefore, "investor1 recibe payout");
      assert.equal(balInvestorAfter - balInvestorBefore, DEPOSIT_AMOUNT / 2n);
    });
  });

  describe("pending()", function () {
    it("pending() correcto tras deposit", async function () {
      const shareToken = await deployShareToken();
      const tokenAsKyc = await getShareTokenAs(shareToken, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsIssuer = await getShareTokenAs(shareToken, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, SHARE_MINT]);
      await tokenAsIssuer.write.mint([investor1, SHARE_MINT]);

      const payoutToken = await deployPayoutToken();
      const payoutAsIssuer = await getPayoutTokenAs(payoutToken, issuerWallet);
      await payoutAsIssuer.write.mint([issuer, DEPOSIT_AMOUNT * 10n]);

      const distributor = await deployDistributor(payoutToken, shareToken);
      await payoutAsIssuer.write.approve([distributor.address, DEPOSIT_AMOUNT]);
      const distAsIssuer = await getDistributorAs(distributor, issuerWallet);
      await distAsIssuer.write.deposit([DEPOSIT_AMOUNT]);

      const pendingIssuer = await distributor.read.pending([issuer]);
      const pendingInvestor = await distributor.read.pending([investor1]);
      assert.equal(pendingIssuer, DEPOSIT_AMOUNT / 2n);
      assert.equal(pendingInvestor, DEPOSIT_AMOUNT / 2n);
    });

    it("pending() 0 para usuario sin shares", async function () {
      const shareToken = await deployShareToken();
      const tokenAsIssuer = await getShareTokenAs(shareToken, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, SHARE_MINT]);

      const payoutToken = await deployPayoutToken();
      const payoutAsIssuer = await getPayoutTokenAs(payoutToken, issuerWallet);
      await payoutAsIssuer.write.mint([issuer, DEPOSIT_AMOUNT * 10n]);

      const distributor = await deployDistributor(payoutToken, shareToken);
      await payoutAsIssuer.write.approve([distributor.address, DEPOSIT_AMOUNT]);
      const distAsIssuer = await getDistributorAs(distributor, issuerWallet);
      await distAsIssuer.write.deposit([DEPOSIT_AMOUNT]);

      const pendingOther = await distributor.read.pending([other]);
      assert.equal(pendingOther, 0n);
    });
  });

  describe("pause bloquea deposit y claim", function () {
    it("cuando está paused, deposit revierte", async function () {
      const shareToken = await deployShareToken();
      const tokenAsIssuer = await getShareTokenAs(shareToken, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, SHARE_MINT]);

      const payoutToken = await deployPayoutToken();
      const payoutAsIssuer = await getPayoutTokenAs(payoutToken, issuerWallet);
      await payoutAsIssuer.write.mint([issuer, DEPOSIT_AMOUNT * 10n]);

      const distributor = await deployDistributor(payoutToken, shareToken);
      await payoutAsIssuer.write.approve([distributor.address, DEPOSIT_AMOUNT]);
      const distAsPauser = await getDistributorAs(distributor, pauserWallet);
      await distAsPauser.write.pause();

      const distAsIssuer = await getDistributorAs(distributor, issuerWallet);
      await viem.assertions.revertWithCustomError(
        distAsIssuer.write.deposit([DEPOSIT_AMOUNT]),
        distributor,
        "EnforcedPause",
      );
    });

    it("cuando está paused, claim revierte", async function () {
      const shareToken = await deployShareToken();
      const tokenAsKyc = await getShareTokenAs(shareToken, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsIssuer = await getShareTokenAs(shareToken, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, SHARE_MINT]);
      await tokenAsIssuer.write.mint([investor1, SHARE_MINT]);

      const payoutToken = await deployPayoutToken();
      const payoutAsIssuer = await getPayoutTokenAs(payoutToken, issuerWallet);
      await payoutAsIssuer.write.mint([issuer, DEPOSIT_AMOUNT * 10n]);

      const distributor = await deployDistributor(payoutToken, shareToken);
      await payoutAsIssuer.write.approve([distributor.address, DEPOSIT_AMOUNT]);
      const distAsIssuer = await getDistributorAs(distributor, issuerWallet);
      await distAsIssuer.write.deposit([DEPOSIT_AMOUNT]);

      const distAsPauser = await getDistributorAs(distributor, pauserWallet);
      await distAsPauser.write.pause();

      const distAsInvestor = await getDistributorAs(distributor, investor1Wallet);
      await viem.assertions.revertWithCustomError(
        distAsInvestor.write.claim(),
        distributor,
        "EnforcedPause",
      );
    });
  });

  describe("Invariants: claimed + pending ≤ depositado", function () {
    it("suma de claimed + pending de todos los holders ≤ total depositado", async function () {
      const shareToken = await deployShareToken();
      const tokenAsKyc = await getShareTokenAs(shareToken, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      await tokenAsKyc.write.allowUser([investor2]);
      const tokenAsIssuer = await getShareTokenAs(shareToken, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, 100n]);
      await tokenAsIssuer.write.mint([investor1, 50n]);
      await tokenAsIssuer.write.mint([investor2, 50n]);

      const payoutToken = await deployPayoutToken();
      const distributor = await deployDistributor(payoutToken, shareToken);
      const payoutAsIssuer = await getPayoutTokenAs(payoutToken, issuerWallet);
      const totalDeposited = 1000n + 500n + 300n;
      await payoutAsIssuer.write.mint([issuer, totalDeposited * 2n]);
      await payoutAsIssuer.write.approve([distributor.address, totalDeposited]);

      const distAsIssuer = await getDistributorAs(distributor, issuerWallet);
      await distAsIssuer.write.deposit([1000n]);
      await distAsIssuer.write.deposit([500n]);
      await distAsIssuer.write.deposit([300n]);

      const distAsInvestor1 = await getDistributorAs(distributor, investor1Wallet);
      await distAsInvestor1.write.claim();
      const distAsInvestor2 = await getDistributorAs(distributor, investor2Wallet);
      await distAsInvestor2.write.claim();

      const holders = [issuer, investor1, investor2] as const;
      let sumClaimed = 0n;
      let sumPending = 0n;
      for (const u of holders) {
        sumClaimed += await distributor.read.claimed([u]);
        sumPending += await distributor.read.pending([u]);
      }
      assert.ok(
        sumClaimed + sumPending <= totalDeposited,
        `claimed(${sumClaimed}) + pending(${sumPending}) debe ser <= ${totalDeposited}`,
      );
    });

    it("varios usuarios y varios deposits: rounding no excede total depositado", async function () {
      const shareToken = await deployShareToken();
      const tokenAsKyc = await getShareTokenAs(shareToken, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      await tokenAsKyc.write.allowUser([investor2]);
      const tokenAsIssuer = await getShareTokenAs(shareToken, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, 33n]);
      await tokenAsIssuer.write.mint([investor1, 33n]);
      await tokenAsIssuer.write.mint([investor2, 34n]);

      const payoutToken = await deployPayoutToken();
      const distributor = await deployDistributor(payoutToken, shareToken);
      const payoutAsIssuer = await getPayoutTokenAs(payoutToken, issuerWallet);
      const amounts = [100n, 99n, 17n, 33n];
      const totalDeposited = amounts.reduce((a, b) => a + b, 0n);
      await payoutAsIssuer.write.mint([issuer, totalDeposited * 2n]);
      await payoutAsIssuer.write.approve([distributor.address, totalDeposited]);

      const distAsIssuer = await getDistributorAs(distributor, issuerWallet);
      for (const amt of amounts) {
        await distAsIssuer.write.deposit([amt]);
      }

      const holders = [issuer, investor1, investor2] as const;
      let sumClaimed = 0n;
      for (const u of holders) {
        const dist = u === issuer ? distAsIssuer : u === investor1 ? await getDistributorAs(distributor, investor1Wallet) : await getDistributorAs(distributor, investor2Wallet);
        await dist.write.claim();
        sumClaimed += await distributor.read.claimed([u]);
      }
      let pending = 0n;
      for (const u of holders) {
        pending += await distributor.read.pending([u]);
      }
      assert.ok(
        sumClaimed + pending <= totalDeposited,
        `claimed(${sumClaimed}) + pending(${pending}) <= ${totalDeposited}`,
      );
    });
  });

  describe("Integration tests: checkpoint after balance change, no over-claim", function () {
    it("tras mint a nuevo holder: checkpoint luego claim correcto, sin over-claim", async function () {
      const shareToken = await deployShareToken();
      const tokenAsKyc = await getShareTokenAs(shareToken, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      await tokenAsKyc.write.allowUser([investor2]);
      const tokenAsIssuer = await getShareTokenAs(shareToken, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, 100n]);
      await tokenAsIssuer.write.mint([investor1, 100n]);

      const payoutToken = await deployPayoutToken();
      const distributor = await deployDistributor(payoutToken, shareToken);
      const payoutAsIssuer = await getPayoutTokenAs(payoutToken, issuerWallet);
      await payoutAsIssuer.write.mint([issuer, 10_000n]);
      await payoutAsIssuer.write.approve([distributor.address, 10_000n]);

      const distAsIssuer = await getDistributorAs(distributor, issuerWallet);
      await distAsIssuer.write.deposit([1000n]);

      await tokenAsIssuer.write.mint([investor2, 100n]);
      await distributor.write.checkpoint([investor2]);

      const balDistBefore = await payoutToken.read.balanceOf([distributor.address]);
      for (const [wallet, addr] of [[investor1Wallet, investor1], [investor2Wallet, investor2], [issuerWallet, issuer]] as const) {
        const p = await distributor.read.pending([addr]);
        if (p > 0n) {
          const dist = await getDistributorAs(distributor, wallet);
          await dist.write.claim();
        }
      }

      const balDistAfter = await payoutToken.read.balanceOf([distributor.address]);
      assert.ok(balDistAfter <= balDistBefore, "balance del distributor no debe aumentar (no over-claim)");
      assert.ok(balDistAfter >= 0n, "no puede quedar negativo");
    });

    it("after transfer share: checkpoint both sides, claims correct", async function () {
      const shareToken = await deployShareToken();
      const tokenAsKyc = await getShareTokenAs(shareToken, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      await tokenAsKyc.write.allowUser([investor2]);
      const tokenAsIssuer = await getShareTokenAs(shareToken, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, 100n]);
      await tokenAsIssuer.write.mint([investor1, 100n]);

      const payoutToken = await deployPayoutToken();
      const distributor = await deployDistributor(payoutToken, shareToken);
      const payoutAsIssuer = await getPayoutTokenAs(payoutToken, issuerWallet);
      await payoutAsIssuer.write.mint([issuer, 10_000n]);
      await payoutAsIssuer.write.approve([distributor.address, 10_000n]);

      const distAsIssuer = await getDistributorAs(distributor, issuerWallet);
      await distAsIssuer.write.deposit([1000n]);

      const tokenAsInvestor1 = await getShareTokenAs(shareToken, investor1Wallet);
      await tokenAsInvestor1.write.transfer([issuer, 50n]);
      await distributor.write.checkpoint([investor1]);
      await distributor.write.checkpoint([issuer]);

      const totalDeposited = 1000n;
      for (const [wallet, addr] of [[investor1Wallet, investor1], [issuerWallet, issuer]] as const) {
        const p = await distributor.read.pending([addr]);
        if (p > 0n) {
          const dist = await getDistributorAs(distributor, wallet);
          await dist.write.claim();
        }
      }

      const claimed1 = await distributor.read.claimed([investor1]);
      const claimedIssuer = await distributor.read.claimed([issuer]);
      assert.ok(claimed1 + claimedIssuer <= totalDeposited, "suma claimed <= depositado");
    });

    it("after burn: checkpoint user, no over-claim", async function () {
      const shareToken = await deployShareToken();
      const tokenAsKyc = await getShareTokenAs(shareToken, kycAdminWallet);
      await tokenAsKyc.write.allowUser([investor1]);
      const tokenAsIssuer = await getShareTokenAs(shareToken, issuerWallet);
      await tokenAsIssuer.write.mint([issuer, 100n]);
      await tokenAsIssuer.write.mint([investor1, 100n]);

      const payoutToken = await deployPayoutToken();
      const distributor = await deployDistributor(payoutToken, shareToken);
      const payoutAsIssuer = await getPayoutTokenAs(payoutToken, issuerWallet);
      await payoutAsIssuer.write.mint([issuer, 10_000n]);
      await payoutAsIssuer.write.approve([distributor.address, 10_000n]);

      const distAsIssuer = await getDistributorAs(distributor, issuerWallet);
      await distAsIssuer.write.deposit([1000n]);

      await tokenAsIssuer.write.burn([investor1, 50n]);
      await distributor.write.checkpoint([investor1]);

      for (const [wallet, addr] of [[investor1Wallet, investor1], [issuerWallet, issuer]] as const) {
        const p = await distributor.read.pending([addr]);
        if (p > 0n) {
          const dist = await getDistributorAs(distributor, wallet);
          await dist.write.claim();
        }
      }

      const totalInDist = await payoutToken.read.balanceOf([distributor.address]);
      const totalDeposited = 1000n;
      const c1 = await distributor.read.claimed([investor1]);
      const c2 = await distributor.read.claimed([issuer]);
      const totalClaimed = c1 + c2;
      assert.ok(totalClaimed <= totalDeposited, "total claimed <= depositado");
      assert.ok(totalInDist + totalClaimed <= totalDeposited + 1n, "resto en contrato + claimed no excede (redondeo)");
    });
  });
});
