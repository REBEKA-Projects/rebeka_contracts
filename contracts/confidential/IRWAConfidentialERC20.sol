// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {InEuint128} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

/// @title IRWAConfidentialERC20
/// @notice Interfaz del token RWA con balances cifrados (FHE/CoFHE) para uso por RevenueDistributorFHE y clientes.
interface IRWAConfidentialERC20 {
    function issuer() external view returns (address);
    function allowed(address user) external view returns (bool);
    function totalSupply() external view returns (uint256);
    /// @dev Devuelve el balance cifrado del usuario (euint128 como uint256 handle).
    function balanceEncrypted(address user) external view returns (uint256);
    /// @notice Mintea cantidad cifrada (InEuint128); el amount no va en calldata.
    function mintEncrypted(address to, InEuint128 calldata encryptedAmount) external;
    /// @notice Transfiere cantidad cifrada (InEuint128) de msg.sender a to.
    function transferEncrypted(address to, InEuint128 calldata encryptedAmount) external;
}
