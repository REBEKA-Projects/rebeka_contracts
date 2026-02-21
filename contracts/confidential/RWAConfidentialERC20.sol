// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {FHE, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {IRWAConfidentialERC20} from "./IRWAConfidentialERC20.sol";

/// @title RWAConfidentialERC20
/// @notice Token RWA con balances cifrados (FHE). Solo issuer y allowlisted; mint con cantidad en claro para totalSupply.
/// @dev Pensado para Fhenix/CoFHE. totalSupply público para integración con RevenueDistributorFHE.
contract RWAConfidentialERC20 is AccessControl, IRWAConfidentialERC20 {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant KYC_ADMIN_ROLE = keccak256("KYC_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    string public name;
    string public symbol;
    uint8 public constant decimals = 0;

    address public issuer;
    mapping(address => bool) public allowed;

    /// @dev Balance cifrado por usuario (almacenado como handle uint256)
    mapping(address => uint256) private _balanceEncrypted;
    uint256 public totalSupply;

    event UserAllowed(address indexed user);
    event UserDisallowed(address indexed user);
    event Minted(address indexed to, uint256 amount);

    error NotAllowed(address user);
    error ZeroAddress();
    error ZeroAmount();

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 /* decimals_ */,
        address admin,
        address issuer_,
        address kycAdmin,
        address pauser
    ) {
        if (admin == address(0) || issuer_ == address(0) || kycAdmin == address(0) || pauser == address(0)) {
            revert ZeroAddress();
        }
        name = name_;
        symbol = symbol_;
        issuer = issuer_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, issuer_);
        _grantRole(KYC_ADMIN_ROLE, kycAdmin);
        _grantRole(PAUSER_ROLE, pauser);
    }

    function allowUser(address user) external onlyRole(KYC_ADMIN_ROLE) {
        allowed[user] = true;
        emit UserAllowed(user);
    }

    function disallowUser(address user) external onlyRole(KYC_ADMIN_ROLE) {
        allowed[user] = false;
        emit UserDisallowed(user);
    }

    /// @notice Mintea cantidad al usuario. Cantidad en claro para actualizar totalSupply; balance se guarda cifrado.
    function mint(address to, uint256 amount) external onlyRole(ISSUER_ROLE) {
        if (amount == 0) revert ZeroAmount();
        if (to != issuer && !allowed[to]) revert NotAllowed(to);

        euint128 current = _balanceEncrypted[to] == 0
            ? FHE.asEuint128(0)
            : euint128.wrap(_balanceEncrypted[to]);
        _balanceEncrypted[to] = euint128.unwrap(FHE.add(current, FHE.asEuint128(amount)));

        totalSupply += amount;
        emit Minted(to, amount);
    }

    /// @dev Para RevenueDistributorFHE: devuelve el handle del balance cifrado.
    function balanceEncrypted(address user) external view returns (uint256) {
        return _balanceEncrypted[user];
    }
}
