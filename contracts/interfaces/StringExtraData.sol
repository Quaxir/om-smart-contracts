pragma solidity ^0.5.0;

interface RequestStringExtra {
    function submitRequestJsonStringExtra(uint requestID, string calldata extra) external returns (uint8 status, uint reqID);
}

interface OfferStringExtra {
    function submitOfferJsonStringExtra(uint offerID, string calldata extra) external returns (uint8 status, uint offID);
}