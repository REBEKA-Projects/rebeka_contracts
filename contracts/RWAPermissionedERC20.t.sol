// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {RWAPermissionedERC20} from "./RWAPermissionedERC20.sol";
import {Test} from "forge-std/Test.sol";

contract RWAPermissionedERC20Test is Test {
    RWAPermissionedERC20 token;

    address admin = address(1);
    address issuer = address(2);
    address kycAdmin = address(3);
    address pauser = address(4);
    address investor1 = address(5);
    address investor2 = address(6);
    address other = address(7);

    uint256 constant MINT_AMOUNT = 100;

    function setUp() public {
        token = new RWAPermissionedERC20(
            "RWA Terreno",
            "RWA",
            0,
            admin,
            issuer,
            kycAdmin,
            pauser
        );
    }

    // --- mint / burn solo issuer ---
    function test_IssuerCanMintToSelf() public {
        vm.prank(issuer);
        token.mint(issuer, MINT_AMOUNT);
        assertEq(token.balanceOf(issuer), MINT_AMOUNT);
        assertEq(token.totalSupply(), MINT_AMOUNT);
    }

    function test_IssuerCanMintToAllowlisted() public {
        vm.prank(kycAdmin);
        token.allowUser(investor1);
        vm.prank(issuer);
        token.mint(investor1, MINT_AMOUNT);
        assertEq(token.balanceOf(investor1), MINT_AMOUNT);
    }

    function test_IssuerCannotMintToNonAllowlisted() public {
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(RWAPermissionedERC20.NotAllowed.selector, other));
        token.mint(other, MINT_AMOUNT);
    }

    function test_NonIssuerCannotMint() public {
        vm.prank(kycAdmin);
        token.allowUser(investor1);
        vm.prank(investor1);
        vm.expectRevert();
        token.mint(investor1, MINT_AMOUNT);
    }

    function test_MintZeroReverts() public {
        vm.prank(issuer);
        vm.expectRevert(RWAPermissionedERC20.ZeroAmount.selector);
        token.mint(issuer, 0);
    }

    function test_IssuerCanBurnFromSelf() public {
        vm.prank(issuer);
        token.mint(issuer, MINT_AMOUNT);
        vm.prank(issuer);
        token.burn(issuer, MINT_AMOUNT);
        assertEq(token.balanceOf(issuer), 0);
        assertEq(token.totalSupply(), 0);
    }

    function test_NonIssuerCannotBurn() public {
        vm.prank(kycAdmin);
        token.allowUser(investor1);
        vm.prank(issuer);
        token.mint(investor1, MINT_AMOUNT);
        vm.prank(investor1);
        vm.expectRevert();
        token.burn(investor1, 10);
    }

    function test_BurnZeroReverts() public {
        vm.prank(issuer);
        token.mint(issuer, MINT_AMOUNT);
        vm.prank(issuer);
        vm.expectRevert(RWAPermissionedERC20.ZeroAmount.selector);
        token.burn(issuer, 0);
    }

    // --- allow / disallow solo KYC_ADMIN ---
    function test_KycAdminCanAllowUser() public {
        vm.prank(kycAdmin);
        token.allowUser(investor1);
        assertTrue(token.allowed(investor1));
    }

    function test_KycAdminCanDisallowUser() public {
        vm.prank(kycAdmin);
        token.allowUser(investor1);
        vm.prank(kycAdmin);
        token.disallowUser(investor1);
        assertFalse(token.allowed(investor1));
    }

    function test_NonKycAdminCannotAllowUser() public {
        vm.prank(other);
        vm.expectRevert();
        token.allowUser(investor1);
    }

    function test_NonKycAdminCannotDisallowUser() public {
        vm.prank(kycAdmin);
        token.allowUser(investor1);
        vm.prank(other);
        vm.expectRevert();
        token.disallowUser(investor1);
    }

    // --- transferencias issuer ↔ allowed only ---
    function test_TransferIssuerToAllowed() public {
        vm.prank(kycAdmin);
        token.allowUser(investor1);
        vm.prank(issuer);
        token.mint(issuer, MINT_AMOUNT);
        vm.prank(issuer);
        token.transfer(investor1, 50);
        assertEq(token.balanceOf(issuer), 50);
        assertEq(token.balanceOf(investor1), 50);
    }

    function test_TransferAllowedToIssuer() public {
        vm.prank(kycAdmin);
        token.allowUser(investor1);
        vm.prank(issuer);
        token.mint(investor1, MINT_AMOUNT);
        vm.prank(investor1);
        token.transfer(issuer, 30);
        assertEq(token.balanceOf(investor1), 70);
        assertEq(token.balanceOf(issuer), 30);
    }

    function test_TransferInvestorToInvestorReverts() public {
        vm.prank(kycAdmin);
        token.allowUser(investor1);
        vm.prank(kycAdmin);
        token.allowUser(investor2);
        vm.prank(issuer);
        token.mint(investor1, MINT_AMOUNT);
        vm.prank(investor1);
        vm.expectRevert(
            abi.encodeWithSelector(RWAPermissionedERC20.TransferNotPermitted.selector, investor1, investor2)
        );
        token.transfer(investor2, 10);
    }

    function test_TransferIssuerToNonAllowedReverts() public {
        vm.prank(issuer);
        token.mint(issuer, MINT_AMOUNT);
        vm.prank(issuer);
        vm.expectRevert(
            abi.encodeWithSelector(RWAPermissionedERC20.TransferNotPermitted.selector, issuer, other)
        );
        token.transfer(other, 10);
    }

    function test_TransferNonAllowedToIssuerReverts() public {
        vm.prank(kycAdmin);
        token.allowUser(other);
        vm.prank(issuer);
        token.mint(other, 10);
        vm.prank(kycAdmin);
        token.disallowUser(other);
        vm.prank(other);
        vm.expectRevert(
            abi.encodeWithSelector(RWAPermissionedERC20.TransferNotPermitted.selector, other, issuer)
        );
        token.transfer(issuer, 5);
    }

    // --- pause / unpause ---
    function test_PauserCanPauseAndUnpause() public {
        vm.prank(pauser);
        token.pause();
        assertTrue(token.paused());
        vm.prank(pauser);
        token.unpause();
        assertFalse(token.paused());
    }

    function test_NonPauserCannotPause() public {
        vm.prank(other);
        vm.expectRevert();
        token.pause();
    }

    function test_WhenPausedTransferReverts() public {
        vm.prank(kycAdmin);
        token.allowUser(investor1);
        vm.prank(issuer);
        token.mint(issuer, MINT_AMOUNT);
        vm.prank(pauser);
        token.pause();
        vm.prank(issuer);
        vm.expectRevert();
        token.transfer(investor1, 10);
    }

    function test_WhenPausedMintStillAllowed() public {
        vm.prank(kycAdmin);
        token.allowUser(investor1);
        vm.prank(pauser);
        token.pause();
        vm.prank(issuer);
        token.mint(investor1, MINT_AMOUNT);
        assertEq(token.balanceOf(investor1), MINT_AMOUNT);
    }

    // --- setIssuer solo DEFAULT_ADMIN ---
    function test_AdminCanSetIssuer() public {
        vm.prank(admin);
        token.setIssuer(investor1);
        assertEq(token.issuer(), investor1);
    }

    function test_SetIssuerZeroReverts() public {
        vm.prank(admin);
        vm.expectRevert(RWAPermissionedERC20.ZeroAddress.selector);
        token.setIssuer(address(0));
    }

    function test_NonAdminCannotSetIssuer() public {
        vm.prank(other);
        vm.expectRevert();
        token.setIssuer(investor1);
    }

    // --- decimals ---
    function test_DecimalsIsZero() public view {
        assertEq(token.decimals(), 0);
    }

    // --- disallow usuario que ya tiene tokens ---
    function test_DisallowUserWithTokens_CannotTransferToIssuer() public {
        vm.prank(kycAdmin);
        token.allowUser(investor1);
        vm.prank(issuer);
        token.mint(investor1, 50);
        vm.prank(kycAdmin);
        token.disallowUser(investor1);
        vm.prank(investor1);
        vm.expectRevert(
            abi.encodeWithSelector(RWAPermissionedERC20.TransferNotPermitted.selector, investor1, issuer)
        );
        token.transfer(issuer, 10);
    }

    function test_DisallowUserWithTokens_IssuerCannotTransferToHim() public {
        vm.prank(kycAdmin);
        token.allowUser(investor1);
        vm.prank(issuer);
        token.mint(issuer, 100);
        vm.prank(issuer);
        token.transfer(investor1, 30);
        vm.prank(kycAdmin);
        token.disallowUser(investor1);
        vm.prank(issuer);
        vm.expectRevert(
            abi.encodeWithSelector(RWAPermissionedERC20.TransferNotPermitted.selector, issuer, investor1)
        );
        token.transfer(investor1, 10);
    }
}
