// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title AssetRegistry
/// @notice Registro de metadata y documentos (URIs + content hashes) por token RWA.
/// @dev Un mismo registry puede registrar varios tokens (varios terrenos); solo referencias por address token.
contract AssetRegistry is AccessControl {
    bytes32 public constant REGISTRY_ADMIN_ROLE = keccak256("REGISTRY_ADMIN_ROLE");

    struct MetadataRef {
        string uri;
        bytes32 contentHash;
        uint64 updatedAt;
        uint32 version;
    }

    struct DocumentRef {
        string name;
        string uri;
        bytes32 contentHash;
        string mimeType;
        bool gated;
        uint64 updatedAt;
        uint32 version;
    }

    mapping(address => MetadataRef) public metadata;
    mapping(address => mapping(bytes32 => DocumentRef)) private _documents;

    event MetadataUpdated(
        address indexed token,
        string uri,
        bytes32 indexed contentHash,
        uint32 version,
        uint64 updatedAt
    );

    event DocumentUpserted(
        address indexed token,
        bytes32 indexed docId,
        string name,
        string uri,
        bytes32 indexed contentHash,
        string mimeType,
        bool gated,
        uint32 version,
        uint64 updatedAt
    );

    error ZeroAddress();
    /// @dev User story: revertir con error descriptivo cuando token es address(0).
    error InvalidToken(address token);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRY_ADMIN_ROLE, admin);
    }

    /// @notice Establece o actualiza la metadata (URI + hash) de un token.
    function setMetadata(address token, string calldata uri, bytes32 contentHash)
        external
        onlyRole(REGISTRY_ADMIN_ROLE)
    {
        if (token == address(0)) revert InvalidToken(token);
        MetadataRef storage m = metadata[token];
        m.uri = uri;
        m.contentHash = contentHash;
        m.updatedAt = uint64(block.timestamp);
        m.version += 1;
        emit MetadataUpdated(token, uri, contentHash, m.version, m.updatedAt);
    }

    /// @notice Añade o actualiza un documento (URI + hash) para un token. docId identifica el documento (p. ej. keccak256(name) o de la URI).
    /// @param token Dirección del share token RWA (debe ser != address(0)).
    function upsertDocument(
        address token,
        bytes32 docId,
        string calldata name,
        string calldata uri,
        bytes32 contentHash,
        string calldata mimeType,
        bool gated
    ) external onlyRole(REGISTRY_ADMIN_ROLE) {
        if (token == address(0)) revert InvalidToken(token);
        DocumentRef storage d = _documents[token][docId];
        d.name = name;
        d.uri = uri;
        d.contentHash = contentHash;
        d.mimeType = mimeType;
        d.gated = gated;
        d.updatedAt = uint64(block.timestamp);
        d.version += 1;
        emit DocumentUpserted(token, docId, name, uri, contentHash, mimeType, gated, d.version, d.updatedAt);
    }

    /// @notice Devuelve el documento guardado para token y docId.
    function getDocument(address token, bytes32 docId) external view returns (DocumentRef memory) {
        return _documents[token][docId];
    }
}
