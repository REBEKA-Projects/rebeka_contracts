// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RWAConfidentialERC20} from "./confidential/RWAConfidentialERC20.sol";
import {IRWAConfidentialERC20} from "./confidential/IRWAConfidentialERC20.sol";
import {RevenueDistributorFHE} from "./confidential/RevenueDistributorFHE.sol";
import {AssetRegistry} from "./AssetRegistry.sol";

/// @title RWAConfidentialTokenFactory
/// @notice Factory solo para tokens RWA confidenciales (FHE/Fhenix). Despliega RWAConfidentialERC20 + RevenueDistributorFHE + AssetRegistry.
/// @dev Separado del factory público para no superar el límite EIP-170 de tamaño de bytecode.
contract RWAConfidentialTokenFactory is AccessControl {
    bytes32 public constant FACTORY_ADMIN_ROLE = keccak256("FACTORY_ADMIN_ROLE");

    IERC20 public immutable payoutToken;

    event ConfidentialTokenCreated(
        address indexed token,
        address indexed distributor,
        address indexed registry,
        string name,
        string symbol
    );

    error ZeroAddress();

    constructor(address factoryAdmin, IERC20 payoutToken_) {
        if (factoryAdmin == address(0) || address(payoutToken_) == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, factoryAdmin);
        _grantRole(FACTORY_ADMIN_ROLE, factoryAdmin);
        payoutToken = payoutToken_;
    }

    /// @notice Despliega la versión confidencial (FHE): RWAConfidentialERC20 + RevenueDistributorFHE + AssetRegistry.
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
        returns (address token, address distributor, address registry)
    {
        RWAConfidentialERC20 t = new RWAConfidentialERC20(name, symbol, 0, admin, issuer, kycAdmin, pauser);
        RevenueDistributorFHE d = new RevenueDistributorFHE(admin, issuer, pauser, payoutToken, IRWAConfidentialERC20(address(t)));
        AssetRegistry r = new AssetRegistry(admin);
        emit ConfidentialTokenCreated(address(t), address(d), address(r), name, symbol);
        return (address(t), address(d), address(r));
    }
}
