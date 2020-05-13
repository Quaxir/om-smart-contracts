pragma solidity ^0.5.0;

interface AuthorisedManageableMarketPlace {

    function submitRequest
        (bytes32 tokenDigest, bytes calldata signature, bytes32 nonce, uint deadline)
        external returns (uint8 status, uint requestID);

    function closeRequest(uint requestIdentifier) external returns (uint8 status);

    function decideRequest(uint requestIdentifier, uint[] calldata offers) external returns (uint8 status);

    function deleteRequest(uint requestIdentifier) external returns (uint8 status);
}