// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IRWAPublicTokenFactory} from "./IRWAPublicTokenFactory.sol";
import {IRWAConfidentialTokenFactory} from "./IRWAConfidentialTokenFactory.sol";

/// @title RWATokenFactoryRouter
/// @notice Punto único de entrada para crear tokens RWA (públicos o confidenciales). Delega en los factories reales y reemite eventos para indexación en una sola dirección.
/// @dev Tras el deploy, conceder FACTORY_ADMIN_ROLE al router en cada factory subyacente.
contract RWATokenFactoryRouter is AccessControl {
    bytes32 public constant FACTORY_ADMIN_ROLE = keccak256("FACTORY_ADMIN_ROLE");

    IRWAPublicTokenFactory public immutable publicFactory;
    /// @dev address(0) si en esta red no está desplegado el factory confidencial (p. ej. solo Arbitrum público).
    IRWAConfidentialTokenFactory public immutable confidentialFactory;

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
    error ConfidentialFactoryNotSet();

    /// @param admin Quien puede llamar createToken / createConfidentialToken (p. ej. multisig).
    /// @param publicFactory_ Factory de tokens públicos (obligatorio).
    /// @param confidentialFactory_ Factory de tokens confidenciales; address(0) si no se usa en esta red.
    constructor(address admin, IRWAPublicTokenFactory publicFactory_, IRWAConfidentialTokenFactory confidentialFactory_) {
        if (admin == address(0) || address(publicFactory_) == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(FACTORY_ADMIN_ROLE, admin);
        publicFactory = publicFactory_;
        confidentialFactory = confidentialFactory_;
    }

    /// @notice Crea un token RWA público y su distribuidor. Emite TokenCreated desde este contrato (misma dirección para indexación).
    function createToken(
        string calldata name,
        string calldata symbol,
        address admin,
        address issuer,
        address kycAdmin,
        address pauser
    ) external onlyRole(FACTORY_ADMIN_ROLE) returns (address token, address distributor) {
        (token, distributor) = publicFactory.createToken(name, symbol, admin, issuer, kycAdmin, pauser);
        emit TokenCreated(token, distributor, name, symbol);
        return (token, distributor);
    }

    /// @notice Crea un token RWA confidencial (FHE), su distribuidor y registry. Revierte si confidentialFactory no está configurado.
    function createConfidentialToken(
        string calldata name,
        string calldata symbol,
        address admin,
        address issuer,
        address kycAdmin,
        address pauser
    ) external onlyRole(FACTORY_ADMIN_ROLE) returns (address token, address distributor, address registry) {
        if (address(confidentialFactory) == address(0)) revert ConfidentialFactoryNotSet();
        (token, distributor, registry) =
            confidentialFactory.createConfidentialToken(name, symbol, admin, issuer, kycAdmin, pauser);
        emit ConfidentialTokenCreated(token, distributor, registry, name, symbol);
        return (token, distributor, registry);
    }
}
