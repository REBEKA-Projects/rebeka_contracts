// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RWAPermissionedERC20} from "./RWAPermissionedERC20.sol";
import {RevenueDistributor} from "./RevenueDistributor.sol";
import {RWAConfidentialERC20} from "./confidential/RWAConfidentialERC20.sol";
import {IRWAConfidentialERC20} from "./confidential/IRWAConfidentialERC20.sol";
import {RevenueDistributorFHE} from "./confidential/RevenueDistributorFHE.sol";
import {AssetRegistry} from "./AssetRegistry.sol";

/// @title RWATokenFactory
/// @notice Fuente única de verdad: despliega tokens RWA públicos o confidenciales (FHE) y sus distribuidores/registry.
/// @dev createToken = versión pública (Arbitrum). createConfidentialToken = versión FHE (Fhenix) + AssetRegistry.
contract RWATokenFactory is AccessControl {
    bytes32 public constant FACTORY_ADMIN_ROLE = keccak256("FACTORY_ADMIN_ROLE");

    IERC20 public immutable payoutToken;

    event TokenCreated(
        address indexed token,
        address indexed distributor,
        string name,
        string symbol
    );

    event ConfidentialTokenCreated(
        address indexed token,
        address indexed distributor,
        address indexed registry,
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

    /// @notice Despliega la versión confidencial (FHE): RWAConfidentialERC20 + RevenueDistributorFHE + AssetRegistry.
    /// @dev Para Fhenix/CoFHE. Mismos roles que createToken; el registry se usa para metadata del token confidencial.
    function createConfidentialToken(
        string calldata name,
        string calldata symbol,
        address admin,
        address issuer,
        address kycAdmin,
        address pauser
    )
        external
        onlyRole(FACTORY_ADMIN_ROLE)
        returns (RWAConfidentialERC20 token, RevenueDistributorFHE distributor, AssetRegistry registry)
    {
        token = new RWAConfidentialERC20(name, symbol, 0, admin, issuer, kycAdmin, pauser);
        distributor = new RevenueDistributorFHE(admin, issuer, pauser, payoutToken, IRWAConfidentialERC20(address(token)));
        registry = new AssetRegistry(admin);
        emit ConfidentialTokenCreated(address(token), address(distributor), address(registry), name, symbol);
        return (token, distributor, registry);
    }
}
