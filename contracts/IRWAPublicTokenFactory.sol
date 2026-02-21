// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title IRWAPublicTokenFactory
/// @notice Interfaz mínima del factory de tokens públicos (para uso en Router).
interface IRWAPublicTokenFactory {
    function createToken(
        string calldata name,
        string calldata symbol,
        address admin,
        address issuer,
        address kycAdmin,
        address pauser
    ) external returns (address token, address distributor);
}
