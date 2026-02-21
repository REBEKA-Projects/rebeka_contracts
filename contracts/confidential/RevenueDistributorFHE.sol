// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IRWAConfidentialERC20} from "./IRWAConfidentialERC20.sol";

/// @title RevenueDistributorFHE
/// @notice Distribuidor de revenue para token RWA con balances cifrados. rewardDebt cifrado; deposit/pending/claim con totalSupply en claro.
/// @dev Stub: checkpoint sincroniza debt con balance cifrado; pending/claim completos requieren FHE mul/div (ver FHE_RWA_TASKS).
contract RevenueDistributorFHE is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    IERC20 public immutable payoutToken;
    IRWAConfidentialERC20 public immutable shareToken;

    uint256 public constant ACC_PRECISION = 1e27;
    uint256 public accRewardPerShare;

    /// @dev rewardDebt por usuario (ciphertext handle)
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public claimed;

    event Deposited(uint256 amount, uint256 accRewardPerShare);
    event Claimed(address indexed user, uint256 amount);
    event Checkpoint(address indexed user);

    error ZeroAddress();
    error NoShares();
    error NothingToClaim();
    error NotAllowedToClaim(address user);

    constructor(
        address admin,
        address issuer,
        address pauser,
        IERC20 payoutToken_,
        IRWAConfidentialERC20 shareToken_
    ) {
        if (
            admin == address(0) || issuer == address(0) || address(payoutToken_) == address(0)
                || address(shareToken_) == address(0)
        ) {
            revert ZeroAddress();
        }
        payoutToken = payoutToken_;
        shareToken = shareToken_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, issuer);
        _grantRole(PAUSER_ROLE, pauser);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function deposit(uint256 amount) external onlyRole(ISSUER_ROLE) whenNotPaused nonReentrant {
        if (amount == 0) return;
        uint256 supply = shareToken.totalSupply();
        if (supply == 0) revert NoShares();

        payoutToken.safeTransferFrom(msg.sender, address(this), amount);
        accRewardPerShare += (amount * ACC_PRECISION) / supply;
        emit Deposited(amount, accRewardPerShare);
    }

    /// @notice Sincroniza rewardDebt con el balance cifrado del usuario (stub: debt = balance para pending 0 hasta FHE mul/div).
    function checkpoint(address user) external {
        rewardDebt[user] = shareToken.balanceEncrypted(user);
        emit Checkpoint(user);
    }

    /// @notice En este stub no se calcula pending en FHE; devuelve 0. Ver FHE_RWA_TASKS para pendingSealed.
    function pending(address /* user */) public pure returns (uint256) {
        return 0;
    }

    function claim() external whenNotPaused nonReentrant {
        _claimFor(msg.sender);
    }

    function claimFor(address user) external whenNotPaused nonReentrant {
        _claimFor(user);
    }

    function _claimFor(address user) internal {
        if (user != shareToken.issuer() && !shareToken.allowed(user)) revert NotAllowedToClaim(user);
        uint256 amount = pending(user);
        if (amount == 0) revert NothingToClaim();

        rewardDebt[user] = shareToken.balanceEncrypted(user);
        claimed[user] += amount;
        payoutToken.safeTransfer(user, amount);
        emit Claimed(user, amount);
    }
}
