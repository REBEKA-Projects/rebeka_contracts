// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title RWAPermissionedERC20
/// @notice Token de participación RWA: solo transferencias issuer ↔ inversores allowlisted (KYC).
/// @dev Pausa afecta solo transferencias; mint/burn no se pausan. decimals configurable (p. ej. 0 = 1 token = 1 m²).
contract RWAPermissionedERC20 is ERC20, AccessControl, Pausable, IReceiver {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant KYC_ADMIN_ROLE = keccak256("KYC_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant FORWARDER_ROLE = keccak256("FORWARDER_ROLE");

    address public issuer;
    address public keystoneForwarder;
    mapping(address => bool) public allowed;

    event IssuerUpdated(address indexed oldIssuer, address indexed newIssuer);
    event UserAllowed(address indexed user);
    event UserDisallowed(address indexed user);
    event Minted(address indexed to, uint256 amount);
    event KeystoneForwarderUpdated(address indexed oldForwarder, address indexed newForwarder);

    error NotAllowed(address user);
    error TransferNotPermitted(address from, address to);
    error ZeroAddress();
    error ZeroAmount();
    error ArrayLengthMismatch();
    error OnlyForwarder();

    uint8 private _customDecimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address admin,
        address issuer_,
        address kycAdmin,
        address pauser
    ) ERC20(name_, symbol_) {
        if (admin == address(0) || issuer_ == address(0) || kycAdmin == address(0) || pauser == address(0)) {
            revert ZeroAddress();
        }
        issuer = issuer_;
        _customDecimals = decimals_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, issuer_);
        _grantRole(KYC_ADMIN_ROLE, kycAdmin);
        _grantRole(PAUSER_ROLE, pauser);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl, IERC165) returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || super.supportsInterface(interfaceId);
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }

    function setIssuer(address newIssuer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newIssuer == address(0)) revert ZeroAddress();
        address old = issuer;
        issuer = newIssuer;
        _grantRole(ISSUER_ROLE, newIssuer);
        _revokeRole(ISSUER_ROLE, old);
        emit IssuerUpdated(old, newIssuer);
    }

    function setKeystoneForwarder(address forwarder) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (forwarder == address(0)) revert ZeroAddress();
        address old = keystoneForwarder;
        keystoneForwarder = forwarder;
        _grantRole(FORWARDER_ROLE, forwarder);
        _revokeRole(FORWARDER_ROLE, old);
        emit KeystoneForwarderUpdated(old, forwarder);
    }

    function onReport(bytes calldata /* metadata */, bytes calldata report) external {
        if (msg.sender != keystoneForwarder) revert OnlyForwarder();
        
        // Manual decoding of the function selector and arguments from the report
        // Selector 0x47e1933a = allowUser(address)
        // Selector 0x40c10f19 = mint(address,uint256)
        
        bytes4 selector;
        assembly {
            selector := calldataload(report.offset)
        }

        if (selector == 0x47e1933a) {
            address user = abi.decode(report[4:], (address));
            _allowUser(user);
        } else if (selector == 0x40c10f19) {
            (address to, uint256 amount) = abi.decode(report[4:], (address, uint256));
            _mintInternal(to, amount);
        }
    }

    function allowUser(address user) external onlyRole(KYC_ADMIN_ROLE) {
        _allowUser(user);
    }

    function _allowUser(address user) internal {
        allowed[user] = true;
        emit UserAllowed(user);
    }

    function disallowUser(address user) external onlyRole(KYC_ADMIN_ROLE) {
        allowed[user] = false;
        emit UserDisallowed(user);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function mint(address to, uint256 amount) external onlyRole(ISSUER_ROLE) {
        _mintInternal(to, amount);
    }

    function _mintInternal(address to, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (to != issuer && !allowed[to]) revert NotAllowed(to);
        _mint(to, amount);
        emit Minted(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(ISSUER_ROLE) {
        if (amount == 0) revert ZeroAmount();
        if (from != issuer && !allowed[from]) revert NotAllowed(from);
        _burn(from, amount);
    }

/*
    /// @notice Mintea a varios destinatarios en una sola tx (multicall). Mismas reglas que mint().
    /// @param to Destinatarios.
    /// @param amounts Cantidad por destinatario (1 token = 1 m²).
    function mintBatch(address[] calldata to, uint256[] calldata amounts) external onlyRole(ISSUER_ROLE) {
        if (to.length != amounts.length) revert ArrayLengthMismatch();
        for (uint256 i = 0; i < to.length; i++) {
            if (amounts[i] == 0) revert ZeroAmount();
            address recipient = to[i];
            if (recipient != issuer && !allowed[recipient]) revert NotAllowed(recipient);
            _mint(recipient, amounts[i]);
            emit Minted(recipient, amounts[i]);
        }
    }
*/

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }

        _requireNotPaused();
        bool fromIssuer = (from == issuer);
        bool toIssuer = (to == issuer);

        if (fromIssuer) {
            if (!allowed[to]) revert TransferNotPermitted(from, to);
        } else if (toIssuer) {
            if (!allowed[from]) revert TransferNotPermitted(from, to);
        } else {
            revert TransferNotPermitted(from, to);
        }

        super._update(from, to, value);
    }
}
