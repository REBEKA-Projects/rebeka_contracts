// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IRWAConfidentialTokenFactory
/// @notice Interfaz mínima del factory de tokens confidenciales (para uso en Router).
interface IRWAConfidentialTokenFactory {
    function createConfidentialToken(
        string calldata name,
        string calldata symbol,
        address admin,
        address issuer,
        address kycAdmin,
        address pauser
    ) external returns (address token, address distributor, address registry);
}
