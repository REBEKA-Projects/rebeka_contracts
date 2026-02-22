// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {FHE, ebool, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {InEuint128} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";
import {IRWAConfidentialERC20} from "./IRWAConfidentialERC20.sol";

/// @title RWAConfidentialERC20
/// @notice Token RWA 100% confidencial: solo mintEncrypted y transferEncrypted (InEuint128). Sin datos en claro on-chain.
/// @dev totalSupply no se actualiza (siempre 0); RevenueDistributorFHE requiere diseño con totalSupply cifrado o alternativo.
contract RWAConfidentialERC20 is AccessControl, IRWAConfidentialERC20 {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant KYC_ADMIN_ROLE = keccak256("KYC_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    string public name;
    string public symbol;
    uint8 public constant decimals = 0;

    address public issuer;
    mapping(address => bool) public allowed;

    /// @dev Balance cifrado por usuario (euint128 = handle FHE; el ciphertext vive off-chain en CoFHE)
    mapping(address => euint128) private _encBalances;
    /// @dev Siempre 0; no se desencripta on-chain. Mantenido por compatibilidad con IRWAConfidentialERC20.
    uint256 public totalSupply;

    event UserAllowed(address indexed user);
    event UserDisallowed(address indexed user);
    event MintedEncrypted(address indexed to);
    event TransferEncrypted(address indexed from, address indexed to);

    error NotAllowed(address user);
    error ZeroAddress();

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

    /// @notice Mintea cantidad cifrada (InEuint128). El amount no va en calldata; solo issuer.
    /// @dev No actualiza totalSupply (no se desencripta on-chain). Balance cifrado + allowThis/allow.
    function mintEncrypted(address to, InEuint128 calldata encryptedAmount) external onlyRole(ISSUER_ROLE) {
        if (to != issuer && !allowed[to]) revert NotAllowed(to);

        euint128 amount = FHE.asEuint128(encryptedAmount);
        euint128 current = euint128.unwrap(_encBalances[to]) == 0
            ? FHE.asEuint128(0)
            : _encBalances[to];
        euint128 newBalance = FHE.add(current, amount);
        _encBalances[to] = newBalance;

        FHE.allowThis(newBalance);
        FHE.allow(newBalance, to);

        emit MintedEncrypted(to);
    }

    /// @notice Transfiere cantidad cifrada (InEuint128) de msg.sender a to. El monto no va en claro en calldata.
    /// @dev Usa FHE.select para no filtrar si el balance es suficiente; solo transfiere amount o 0. Solo issuer ↔ allowlisted.
    function transferEncrypted(address to, InEuint128 calldata encryptedAmount) external {
        if (msg.sender != issuer && !allowed[msg.sender]) revert NotAllowed(msg.sender);
        if (to != issuer && !allowed[to]) revert NotAllowed(to);

        euint128 amount = FHE.asEuint128(encryptedAmount);
        euint128 fromBalance = euint128.unwrap(_encBalances[msg.sender]) == 0
            ? FHE.asEuint128(0)
            : _encBalances[msg.sender];

        ebool hasEnough = FHE.gte(fromBalance, amount);
        euint128 amountToTransfer = FHE.select(hasEnough, amount, FHE.asEuint128(0));

        euint128 newFromBalance = FHE.sub(fromBalance, amountToTransfer);
        euint128 toBalance = euint128.unwrap(_encBalances[to]) == 0
            ? FHE.asEuint128(0)
            : _encBalances[to];
        euint128 newToBalance = FHE.add(toBalance, amountToTransfer);

        _encBalances[msg.sender] = newFromBalance;
        _encBalances[to] = newToBalance;

        FHE.allowThis(newFromBalance);
        FHE.allow(newFromBalance, msg.sender);
        FHE.allowThis(newToBalance);
        FHE.allow(newToBalance, to);

        emit TransferEncrypted(msg.sender, to);
    }

    /// @dev Para RevenueDistributorFHE: devuelve el handle del balance cifrado (euint128 como uint256).
    function balanceEncrypted(address user) external view returns (uint256) {
        return euint128.unwrap(_encBalances[user]);
    }
}
