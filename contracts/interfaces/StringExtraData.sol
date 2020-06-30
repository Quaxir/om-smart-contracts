pragma solidity ^0.5.0;

/*
Changed from the one provided in the SOFIE Marketplace component, since that one forces to use the same extra for both requests and offers.
Here, one can use the string extra also for only requests or offers.
Furthermore, the submitOfferJsonStringExtra is now payable, which allows to move Ethers upon offer presentation.
*/

interface RequestStringExtra {
    function submitRequestJsonStringExtra(uint requestID, string calldata extra) external returns (uint8 status, uint reqID);
}

interface OfferStringExtra {
    function submitOfferJsonStringExtra(uint offerID, string calldata extra) external payable returns (uint8 status, uint offID);
}