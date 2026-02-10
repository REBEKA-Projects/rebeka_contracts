// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RWAPermissionedERC20} from "./RWAPermissionedERC20.sol";
import {RevenueDistributor} from "./RevenueDistributor.sol";

/// @title RWATokenFactory
/// @notice Despliega en una tx un RWAPermissionedERC20 y su RevenueDistributor (mismo admin/issuer/kycAdmin/pauser, USDC fijo).
/// @dev Solo FACTORY_ADMIN puede crear. Emite TokenCreated para indexación.
contract RWATokenFactory is AccessControl {
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
    /// @param name Nombre del share token.
    /// @param symbol Símbolo del share token.
    /// @param admin Admin del token y del distribuidor.
    /// @param issuer Issuer del token y del distribuidor.
    /// @param kycAdmin KYC admin del token.
    /// @param pauser Pauser del token y del distribuidor.
    /// @return token El share token desplegado.
    /// @return distributor El RevenueDistributor asociado al token.
    function createToken(
        string calldata name,
        string calldata symbol,
        address admin,
        address issuer,
        address kycAdmin,
        address pauser
    ) external onlyRole(FACTORY_ADMIN_ROLE) returns (RWAPermissionedERC20 token, RevenueDistributor distributor) {
        token = new RWAPermissionedERC20(name, symbol, 0, admin, issuer, kycAdmin, pauser);
        distributor = new RevenueDistributor(admin, issuer, pauser, payoutToken, token);
        emit TokenCreated(address(token), address(distributor), name, symbol);
        return (token, distributor);
    }
}
