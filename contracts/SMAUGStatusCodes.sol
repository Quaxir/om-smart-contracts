pragma solidity ^0.5.0;

import { StatusCodes } from "sofie-offer-marketplace/contracts/StatusCodes.sol";

contract SMAUGStatusCodes is StatusCodes {

    uint8 constant internal TokenAlreadyUsed = 101;
    uint8 constant internal OfferExtraInvalid = 102;
    uint8 constant internal InstantRentNotSupported = 103;
    uint8 constant internal InsufficientEscrowPayment = 104;
}