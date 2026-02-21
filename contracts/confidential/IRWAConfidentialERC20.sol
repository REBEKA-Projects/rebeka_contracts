// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IRWAConfidentialERC20
/// @notice Interfaz del token RWA con balances cifrados (FHE) para uso por RevenueDistributorFHE.
interface IRWAConfidentialERC20 {
    function issuer() external view returns (address);
    function allowed(address user) external view returns (bool);
    function totalSupply() external view returns (uint256);
    /// @dev Devuelve el balance cifrado del usuario (euint128 como uint256 handle).
    function balanceEncrypted(address user) external view returns (uint256);
}
