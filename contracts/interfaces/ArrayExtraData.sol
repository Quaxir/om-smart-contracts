pragma solidity ^0.5.0;

/*
Changed from the one provided in the SOFIE Marketplace component, since that one forces to use the same extra for both requests and offers.
Here, one can use the array extra also for only requests or offers.
Furthermore, the submitOfferArrayExtra is now payable, which allows to move Ethers upon offer presentation.
*/

interface RequestArrayExtra {
    function submitRequestArrayExtra(uint requestID, uint[] calldata extra) external returns (uint8 status, uint reqID);
}

interface OfferArrayExtra {
    function submitOfferArrayExtra(uint offerID, uint[] calldata extra) external payable returns (uint8 status, uint offID);
}