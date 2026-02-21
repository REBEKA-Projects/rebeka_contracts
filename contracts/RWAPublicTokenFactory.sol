// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RWAPermissionedERC20} from "./RWAPermissionedERC20.sol";
import {RevenueDistributor} from "./RevenueDistributor.sol";

/// @title RWAPublicTokenFactory
/// @notice Factory solo para tokens RWA públicos (Arbitrum). Despliega RWAPermissionedERC20 + RevenueDistributor.
/// @dev Separado de la lógica FHE para no superar el límite EIP-170 de tamaño de bytecode.
contract RWAPublicTokenFactory is AccessControl {
    bytes32 public constant FACTORY_ADMIN_ROLE = keccak256("FACTORY_ADMIN_ROLE");

    IERC20 public immutable payoutToken;

    event TokenCreated(
        address indexed token,
        address indexed distributor,
        string name,
        string symbol
    );

    error ZeroAddress();

    /// @param factoryAdmin Quien puede llamar createToken (p. ej. multisig).
    /// @param payoutToken_ Dirección del token de payout (USDC en Arbitrum).
    constructor(address factoryAdmin, IERC20 payoutToken_) {
        if (factoryAdmin == address(0) || address(payoutToken_) == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, factoryAdmin);
        _grantRole(FACTORY_ADMIN_ROLE, factoryAdmin);
        payoutToken = payoutToken_;
    }

    /// @notice Despliega un RWAPermissionedERC20 y su RevenueDistributor en una tx.
    function createToken(
        string calldata name,
        string calldata symbol,
        address admin,
        address issuer,
        address kycAdmin,
        address pauser
    ) external onlyRole(FACTORY_ADMIN_ROLE) returns (address token, address distributor) {
        RWAPermissionedERC20 t = new RWAPermissionedERC20(name, symbol, 0, admin, issuer, kycAdmin, pauser);
        RevenueDistributor d = new RevenueDistributor(admin, issuer, pauser, payoutToken, t);
        emit TokenCreated(address(t), address(d), name, symbol);
        return (address(t), address(d));
    }
}
