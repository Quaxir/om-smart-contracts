pragma solidity ^0.5.0;

interface RequestArrayExtra {
    function submitRequestArrayExtra(uint requestID, uint[] calldata extra) external returns (uint8 status, uint reqID);
}

interface OfferArrayExtra {
    function submitOfferArrayExtra(uint offerID, uint[] calldata extra) external payable returns (uint8 status, uint offID);
}