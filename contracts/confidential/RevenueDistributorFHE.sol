// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FHE, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IRWAConfidentialERC20} from "./IRWAConfidentialERC20.sol";

/// @title RevenueDistributorFHE
/// @notice Distribuidor de revenue para token RWA con balances cifrados. rewardDebt y claimed en FHE (euint128); pending se calcula en FHE y se expone como handle para unseal en cliente.
/// @dev deposit() requiere totalSupply > 0 (token confidencial tiene totalSupply=0; ver FHE_RWA_DESIGN §6). claim(amount) verifica en FHE que amount <= pending; no emite monto en evento. Beneficiario (address) en claim/claimFor sigue en claro; cifrado con InEaddress requeriría decrypt asíncrono para transfer.
contract RevenueDistributorFHE is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    IERC20 public immutable payoutToken;
    IRWAConfidentialERC20 public immutable shareToken;

    uint256 public constant ACC_PRECISION = 1e27;
    uint256 public accRewardPerShare;

    /// @dev rewardDebt y claimed en FHE (handles euint128)
    mapping(address => euint128) private _rewardDebt;
    mapping(address => euint128) private _claimed;

    event Deposited(uint256 amount, uint256 accRewardPerShare);
    event Claimed(address indexed user);
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

    /// @notice Sincroniza rewardDebt con el accrued actual (balance * accRewardPerShare / PRECISION). Estado en FHE.
    function checkpoint(address user) external {
        uint256 balanceHandle = shareToken.balanceEncrypted(user);
        euint128 balance =
            balanceHandle == 0 ? FHE.asEuint128(0) : euint128.wrap(balanceHandle);
        euint128 accrued =
            FHE.div(FHE.mul(balance, FHE.asEuint128(accRewardPerShare)), FHE.asEuint128(ACC_PRECISION));
        _rewardDebt[user] = accrued;
        FHE.allowThis(accrued);
        FHE.allow(accrued, user);
        emit Checkpoint(user);
    }

    /// @notice Devuelve el handle (uint256) del pending cifrado del usuario. El cliente puede unseal con cofhejs (permiso del usuario).
    /// @dev pendingEncrypted = (balance * accRewardPerShare / ACC_PRECISION) - rewardDebt; se permite al user para decrypt/unseal.
    function getPendingEncryptedHandle(address user) external returns (uint256) {
        uint256 balanceHandle = shareToken.balanceEncrypted(user);
        euint128 balance =
            balanceHandle == 0 ? FHE.asEuint128(0) : euint128.wrap(balanceHandle);
        euint128 accrued =
            FHE.div(FHE.mul(balance, FHE.asEuint128(accRewardPerShare)), FHE.asEuint128(ACC_PRECISION));
        euint128 debt = euint128.unwrap(_rewardDebt[user]) == 0 ? FHE.asEuint128(0) : _rewardDebt[user];
        euint128 pendingEnc = FHE.sub(accrued, debt);

        FHE.allowThis(pendingEnc);
        FHE.allow(pendingEnc, user);
        return euint128.unwrap(pendingEnc);
    }

    /// @notice Reclama amount verificando en FHE que amount <= pending. El monto va en calldata (revelado); el evento no emite monto.
    /// @dev Actualiza rewardDebt y claimed en FHE; transfer de payout al user.
    function claim(uint256 amount) external whenNotPaused nonReentrant {
        _claimFor(msg.sender, amount);
    }

    /// @notice Reclama amount para user. Address en claro; cifrado con InEaddress requeriría decrypt asíncrono para transfer.
    function claimFor(address user, uint256 amount) external whenNotPaused nonReentrant {
        _claimFor(user, amount);
    }

    function _claimFor(address user, uint256 amount) internal {
        if (user != shareToken.issuer() && !shareToken.allowed(user)) revert NotAllowedToClaim(user);
        if (amount == 0) revert NothingToClaim();

        uint256 balanceHandle = shareToken.balanceEncrypted(user);
        euint128 balance =
            balanceHandle == 0 ? FHE.asEuint128(0) : euint128.wrap(balanceHandle);
        euint128 accrued =
            FHE.div(FHE.mul(balance, FHE.asEuint128(accRewardPerShare)), FHE.asEuint128(ACC_PRECISION));
        euint128 debt = euint128.unwrap(_rewardDebt[user]) == 0 ? FHE.asEuint128(0) : _rewardDebt[user];
        euint128 pendingEnc = FHE.sub(accrued, debt);

        euint128 amountEnc = FHE.asEuint128(amount);
        // CoFHE no expone FHE.req(ebool); usamos select para que el estado sea min(amount, pending). El cliente debe pasar el amount obtenido de unseal(getPendingEncryptedHandle).
        euint128 amountToClaim =
            FHE.select(FHE.gte(pendingEnc, amountEnc), amountEnc, FHE.asEuint128(0));

        _rewardDebt[user] = accrued;
        FHE.allowThis(accrued);
        FHE.allow(accrued, user);

        euint128 newClaimed = euint128.unwrap(_claimed[user]) == 0
            ? amountToClaim
            : FHE.add(_claimed[user], amountToClaim);
        _claimed[user] = newClaimed;
        FHE.allowThis(newClaimed);
        FHE.allow(newClaimed, user);

        require(amount <= payoutToken.balanceOf(address(this)), "Claim exceeds balance");
        payoutToken.safeTransfer(user, amount);
        emit Claimed(user);
    }

    /// @dev Handles para compatibilidad / auditoría; los valores están cifrados.
    function rewardDebt(address user) external view returns (uint256) {
        return euint128.unwrap(_rewardDebt[user]);
    }

    function claimed(address user) external view returns (uint256) {
        return euint128.unwrap(_claimed[user]);
    }
}
