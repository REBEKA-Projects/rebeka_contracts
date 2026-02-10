// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {RWAPermissionedERC20} from "./RWAPermissionedERC20.sol";

/// @title RevenueDistributor
/// @notice Reparto pro-rata de payoutToken (p. ej. USDC) a holders del share token. Modelo pull: issuer deposita, usuarios reclaman.
/// @dev Actualizar rewardDebt al cambiar balances (mint/burn/transfer) llamando checkpoint(user).
contract RevenueDistributor is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    IERC20 public immutable payoutToken;
    RWAPermissionedERC20 public immutable shareToken;

    uint256 public constant ACC_PRECISION = 1e27;
    uint256 public accRewardPerShare;

    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public claimed;

    event Deposited(uint256 amount, uint256 accRewardPerShare);
    event Claimed(address indexed user, uint256 amount);
    event Checkpoint(address indexed user, uint256 newRewardDebt);

    error ZeroAddress();
    error NoShares();
    error NothingToClaim();
    error NotAllowedToClaim(address user);

    constructor(
        address admin,
        address issuer,
        address pauser,
        IERC20 payoutToken_,
        RWAPermissionedERC20 shareToken_
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

    /// @notice Issuer deposita payoutToken para repartir pro-rata. Solo cuando totalSupply > 0.
    function deposit(uint256 amount) external onlyRole(ISSUER_ROLE) whenNotPaused nonReentrant {
        if (amount == 0) return;
        uint256 supply = shareToken.totalSupply();
        if (supply == 0) revert NoShares();

        payoutToken.safeTransferFrom(msg.sender, address(this), amount);
        accRewardPerShare += (amount * ACC_PRECISION) / supply;
        emit Deposited(amount, accRewardPerShare);
    }

    /// @notice Actualiza rewardDebt de un usuario al valor actual (sin transferir). Llamar tras mint/burn/transfer del share token.
    function checkpoint(address user) external {
        uint256 bal = shareToken.balanceOf(user);
        uint256 newDebt = (bal * accRewardPerShare) / ACC_PRECISION;
        rewardDebt[user] = newDebt;
        emit Checkpoint(user, newDebt);
    }

    /// @notice Recompensa pendiente de un usuario.
    function pending(address user) public view returns (uint256) {
        uint256 bal = shareToken.balanceOf(user);
        if (bal == 0) return 0;
        uint256 accrued = (bal * accRewardPerShare) / ACC_PRECISION;
        uint256 debt = rewardDebt[user];
        if (accrued <= debt) return 0;
        return accrued - debt;
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

        uint256 bal = shareToken.balanceOf(user);
        rewardDebt[user] = (bal * accRewardPerShare) / ACC_PRECISION;
        claimed[user] += amount;
        payoutToken.safeTransfer(user, amount);
        emit Claimed(user, amount);
    }
}
