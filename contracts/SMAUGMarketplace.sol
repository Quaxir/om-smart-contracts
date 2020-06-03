pragma solidity ^0.5.0;

import { InterledgerReceiverInterface } from "sofie-interledger-contracts/contracts/InterledgerReceiverInterface.sol";
import { InterledgerSenderInterface } from "sofie-interledger-contracts/contracts/InterledgerSenderInterface.sol";

import { AbstractAuthorisedOwnerManageableMarketPlace } from "./abstract/AbstractAuthorisedOwnerManageableMarketPlace.sol";
import { RequestArrayExtra, OfferArrayExtra } from "./interfaces/ArrayExtraData.sol";

contract SMAUGMarketPlace is AbstractAuthorisedOwnerManageableMarketPlace, RequestArrayExtra, OfferArrayExtra, InterledgerSenderInterface, InterledgerReceiverInterface {

    event Debug(uint value);         // Temporary event, used for debugging purposes
    event Debug2(bytes valueBytes);

    /*
    A request extra contains some easy-to-understand information plus an array fo pricing rules for instant rents.
    An array of pricing rule has, for example, the following format:
        [1, 50, 5, 40, 10, 30, 50, 20, 100, 10]
    The pricing rules array specified above indicates that, for any instant rent request during a number of minutes between
    1 (element n. 0) and 5 not included (element n. 2), the price to buy to automatically reserve the locker is 50 for each minute (element n. 1).
    Similarly, for a rent request for a number of minutes between 5 (element n. 2) and 10 not included (element n. 4), the price for each minute to
    buy has to be 40. For rents during from 10 to 50 (not included), the price is 30, while for the range [50-99] is 20,
    and for rents lasting at least 100 minutes, the price/minute to pay has to be at least 10.
    */
    struct RequestExtra {
        uint startOfRentTime;               // The starting time from which the locker specified in the request will be available.
        uint duration;                      // The n. of minutes from startOfRentTime for which the locker can be rented.
        uint auctionMinPricePerSlot;        // The starting price for auctions (not instant rent options).
        InstantRentPricingRule[] rules;     // If empty, the request does not accept instant rent offers.
        uint lockerKey;                     // The public key identifying the locker and that will be used to authenticate it, encoded as uint.
    }

    struct InstantRentPricingRule {
        uint minimumNumberOfMinutes;
        uint minimumPricePerMinute;
    }

    struct OfferExtra {
        uint startOfRentTime;               // The proposed start time for the rent in this offer.
        uint duration;                      // The n. of minutes from startOfRentTime the rent would last.
        OfferType offerType;                // Specifies whether the money offered is for an auction or an instant buy offer.
        uint pricePerMinute;                // The amount of money the user will pay per minute of locker usage.
        uint offerCreatorDID;                    // The DID to decrypt the issued access token, in case the offer is selected.
        uint offerCreatorAuthenticationKey;      // OPTIONAL. This key would be used by the receiver of the access token to authenticate him/her self to the smart locker. If no key is provided in the offer, the generated token will be a bearer token.
    }

    enum OfferType { Auction, InstantRent }


    uint private minimumNumberOfRequestExtraElements = 4;               // rules is optional

    uint private minimumNumberOfOfferExtraElements = 5;                 // offerCreatorAuthenticationKey is optional
    uint private maximumNumberOfOfferExtraElements = 6;


    mapping (uint => RequestExtra) private requestsExtra;
    mapping (uint => OfferExtra) private offersExtra;


    constructor() AbstractAuthorisedOwnerManageableMarketPlace() public {
        _registerInterface(this.submitRequestArrayExtra.selector);
        _registerInterface(this.submitOfferArrayExtra.selector);
    }

    function submitRequestArrayExtra(uint requestID, uint[] calldata extra) external returns (uint8 status, uint reqID) {

        if (extra.length < minimumNumberOfRequestExtraElements) {
            emit FunctionStatus(InvalidInput);
            return (InvalidInput, 0);
        }

        (, bool isRequestDefined) = isRequestDefined(requestID);

        if (!isRequestDefined) {
            emit FunctionStatus(UndefinedID);
            return (UndefinedID, 0);
        }

        Request storage request = requests[requestID];

        if(request.reqStage != Stage.Pending) {
            emit FunctionStatus(NotPending);
            return (NotPending, 0);
        }

        bool isCallerRequestCreator = isRequestCreator(request, msg.sender);

        if (!isCallerRequestCreator) {
            emit FunctionStatus(AccessDenied);
            return (AccessDenied, 0);
        }

        (uint8 requestExtraValidationStatusCode, InstantRentPricingRule[] memory requestPricingRules) =
            validateAndBuildRequestPricingRulesFromRawArray(extra, 3, extra.length-2);

        if (requestExtraValidationStatusCode != Successful) {
            emit FunctionStatus(requestExtraValidationStatusCode);
            return (requestExtraValidationStatusCode, 0);
        }

        RequestExtra storage requestExtra = requestsExtra[requestID];
        requestExtra.startOfRentTime = extra[0];
        requestExtra.duration = extra[1];
        requestExtra.auctionMinPricePerSlot = extra[2];
        requestExtra.lockerKey = extra[extra.length-1];

        for (uint i = 0; i < requestPricingRules.length; i++) {
            requestExtra.rules.push(requestPricingRules[i]);
        }

        return super.finishSubmitRequestExtra(requestID);
    }

    function validateAndBuildRequestPricingRulesFromRawArray(uint[] memory requestExtra, uint startIndex, uint endIndex)
        internal pure returns (uint8 statusCode, InstantRentPricingRule[] memory rules) {

        if (startIndex == endIndex+1) {   // Condition met if the array of pricing rules is empty (3 == extra.length-2+1).
            return (Successful, rules);
        }

        bool isEvenNumberOfRules = (endIndex-startIndex) % 2 == 1;

        if (!isEvenNumberOfRules) {       //Number of elements in requestExtra[startIndex...endIndex] must be even
            return (InvalidInput, rules);
        }

        uint numberOfRules = (endIndex - startIndex) / 2 + 1;
        InstantRentPricingRule[] memory _rules = new InstantRentPricingRule[](numberOfRules);
        uint requestDuration = requestExtra[1];

        for (uint i = startIndex; i < endIndex; i += 2) {
            uint newRangeMinimumMinutesAmount = requestExtra[i];
            uint newRangePricePerMinute = requestExtra[i+1];

            // Pricing rule cannot be specified for durations longer than the request itself
            if (newRangeMinimumMinutesAmount > requestDuration) {
                return (InvalidInput, rules);
            }

            if (i > startIndex) {           // If it is not the first iteration
                InstantRentPricingRule memory previousRangePricingRule = _rules[(i-1-startIndex)/2];
                if (previousRangePricingRule.minimumNumberOfMinutes >= newRangeMinimumMinutesAmount) {      // Ranges values for number of minutes must be strictly monotonically increasing.
                    return (InvalidInput, rules);
                }
            }
            InstantRentPricingRule memory currentRangePricingRule = InstantRentPricingRule(newRangeMinimumMinutesAmount, newRangePricePerMinute);
            _rules[(i-startIndex)/2] = currentRangePricingRule;
        }

        return (Successful, _rules);
    }

    function getRequestExtra(uint requestIdentifier) public view
        returns (uint8 status, uint startOfRentTime, uint duration, uint auctionMinPricePerSlot, uint[] memory instantBuyRules, uint lockerID) {
            (, bool isRequestDefined) = isRequestDefined(requestIdentifier);

            if (!isRequestDefined) {
                return (UndefinedID, 0, 0, 0, new uint[](0), 0);
            }

            RequestExtra storage requestExtra = requestsExtra[requestIdentifier];

            return (
                Successful,
                requestExtra.startOfRentTime,
                requestExtra.duration,
                requestExtra.auctionMinPricePerSlot,
                buildRawArrayFromRequestPricingRules(requestExtra.rules),
                requestExtra.lockerKey
            );
    }

    function buildRawArrayFromRequestPricingRules(InstantRentPricingRule[] storage requestRules) internal view returns (uint[] memory rules) {
        uint[] memory _rules = new uint[](requestRules.length*2);

        for (uint i = 0; i < requestRules.length; i += 1) {
            _rules[i*2] = requestRules[i].minimumNumberOfMinutes;
            _rules[(i*2)+1] = requestRules[i].minimumPricePerMinute;
        }

        return _rules;
    }

    function decideRequest(uint requestIdentifier, uint[] memory acceptedOfferIDs) public returns (uint8 status) {
        (, bool isRequestDefined) = isRequestDefined(requestIdentifier);

        if (!isRequestDefined) {
            emit FunctionStatus(UndefinedID);
            return UndefinedID;
        }

        Request storage request = requests[requestIdentifier];
        bool isCallerRequestCreator = isRequestCreator(request, msg.sender);

        if (!isCallerRequestCreator) {
            emit FunctionStatus(AccessDenied);
            return (AccessDenied);
        }

        bool integrity = checkIntegrityOfAcceptedOffersList(requestIdentifier, acceptedOfferIDs);

        if(!integrity) {
            emit FunctionStatus(ImproperList);
            return ImproperList;
        }

        return decideRequestInsecure(request, acceptedOfferIDs);
    }

    function emitRequestDecisionInterledgerEvent(uint[] memory acceptedOfferIDs) internal {
        for (uint i = 0; i < acceptedOfferIDs.length; i++) {
            uint acceptedOfferID = acceptedOfferIDs[i];
            OfferExtra storage offerExtra = offersExtra[acceptedOfferID];
            bytes memory interledgerEventPayload = getInterledgerPayloadFromOfferExtra(acceptedOfferID, offerExtra);
            emit InterledgerEventSending(uint8(InterledgerEventType.RequestDecision), interledgerEventPayload);
        }
    }

    // Returns either the concatenation of offer ID and winner DID (length = 64 hex chars), or the concatenation of offer ID, winner DID and winner authentication key (length = 96 hex chars).
    function getInterledgerPayloadFromOfferExtra(uint offerID, OfferExtra storage offerExtra) private view returns (bytes memory) {
        uint offerDID = offerExtra.offerCreatorDID;
        uint offerCreatorAuthenticationKey = offerExtra.offerCreatorAuthenticationKey;
        bytes memory offerIDBytes = toBytes(offerID);
        bytes memory offerDIDBytes = toBytes(offerDID);
        bytes memory result = concat(offerIDBytes, offerDIDBytes);
        if (offerCreatorAuthenticationKey != 0) {
            bytes memory offerCreatorAuthenticationKeyBytes = toBytes(offerCreatorAuthenticationKey);
            result = concat(result, offerCreatorAuthenticationKeyBytes);
        }
        return result;
    }

    // From https://ethereum.stackexchange.com/questions/4170/how-to-convert-a-uint-to-bytes-in-solidity/4177#4177
    function toBytes(uint256 x) internal pure returns (bytes memory b) {
        b = new bytes(32);
        assembly { mstore(add(b, 32), x) }
    }

    // From https://github.com/GNSPS/solidity-bytes-utils/blob/master/contracts/BytesLib.sol#L12
    function concat(
        bytes memory _preBytes,
        bytes memory _postBytes
    )
        internal
        pure
        returns (bytes memory)
    {
        bytes memory tempBytes;

        assembly {
            // Get a location of some free memory and store it in tempBytes as
            // Solidity does for memory variables.
            tempBytes := mload(0x40)

            // Store the length of the first bytes array at the beginning of
            // the memory for tempBytes.
            let length := mload(_preBytes)
            mstore(tempBytes, length)

            // Maintain a memory counter for the current write location in the
            // temp bytes array by adding the 32 bytes for the array length to
            // the starting location.
            let mc := add(tempBytes, 0x20)
            // Stop copying when the memory counter reaches the length of the
            // first bytes array.
            let end := add(mc, length)

            for {
                // Initialize a copy counter to the start of the _preBytes data,
                // 32 bytes into its memory.
                let cc := add(_preBytes, 0x20)
            } lt(mc, end) {
                // Increase both counters by 32 bytes each iteration.
                mc := add(mc, 0x20)
                cc := add(cc, 0x20)
            } {
                // Write the _preBytes data into the tempBytes memory 32 bytes
                // at a time.
                mstore(mc, mload(cc))
            }

            // Add the length of _postBytes to the current length of tempBytes
            // and store it as the new length in the first 32 bytes of the
            // tempBytes memory.
            length := mload(_postBytes)
            mstore(tempBytes, add(length, mload(tempBytes)))

            // Move the memory counter back from a multiple of 0x20 to the
            // actual end of the _preBytes data.
            mc := end
            // Stop copying when the memory counter reaches the new combined
            // length of the arrays.
            end := add(mc, length)

            for {
                let cc := add(_postBytes, 0x20)
            } lt(mc, end) {
                mc := add(mc, 0x20)
                cc := add(cc, 0x20)
            } {
                mstore(mc, mload(cc))
            }

            // Update the free-memory pointer by padding our last write location
            // to 32 bytes: add 31 bytes to the end of tempBytes to move to the
            // next 32 byte block, then round down to the nearest multiple of
            // 32. If the sum of the length of the two arrays is zero then add
            // one before rounding down to leave a blank 32 bytes (the length block with 0).
            mstore(0x40, and(
              add(add(end, iszero(add(length, mload(_preBytes)))), 31),
              not(31) // Round down to the nearest 32 bytes.
            ))
        }

        return tempBytes;
    }

    function checkIntegrityOfAcceptedOffersList(uint requestIdentifier, uint[] memory acceptedOfferIDs) private returns (bool isOffersListValid) {
        for (uint j = 0; j < acceptedOfferIDs.length; j++) {
            if (offers[acceptedOfferIDs[j]].requestID != requestIdentifier) {
                return false;
            }

            if (offers[acceptedOfferIDs[j]].offStage != Stage.Open) {
                emit Debug(acceptedOfferIDs[j]);
                return false;
            }

            for (uint i = 0; i < j; i++) {
                if (acceptedOfferIDs[j] == acceptedOfferIDs[i]) {
                    return false;
                }
            }
        }

        return true;
    }

    function closeRequest(uint requestIdentifier) public returns (uint8 status) {
        (, bool isRequestDefined) = isRequestDefined(requestIdentifier);

        if (!isRequestDefined) {
            emit FunctionStatus(UndefinedID);
            return UndefinedID;
        }

        Request storage request = requests[requestIdentifier];

        bool isCallerRequestCreator = isRequestCreator(request, msg.sender);
        if (!isCallerRequestCreator) {
            emit FunctionStatus(AccessDenied);
            return (AccessDenied);
        }

        // This control is missing in the SOFIE smart contract
        if(request.reqStage != Stage.Open) {
            emit FunctionStatus(RequestNotOpen);
            return RequestNotOpen;
        }

        return super.closeRequestInsecure(request);
    }

    function deleteRequest(uint requestIdentifier) public returns (uint8 status) {
        (, bool isRequestDefined) = isRequestDefined(requestIdentifier);

        if (!isRequestDefined) {
            emit FunctionStatus(UndefinedID);
            return UndefinedID;
        }

        Request storage request = requests[requestIdentifier];
        bool isCallerRequestCreator = isRequestCreator(request, msg.sender);

        if (!isCallerRequestCreator) {
            emit FunctionStatus(AccessDenied);
            return AccessDenied;
        }

        // This control is missing in the SOFIE smart contract
        if(request.reqStage != Stage.Closed) {
            emit FunctionStatus(ReqNotClosed);
            return ReqNotClosed;
        }

        if(request.closingBlock + waitBeforeDeleteBlocks > block.number) {
            emit FunctionStatus(NotTimeForDeletion);
            return NotTimeForDeletion;
        }

        return super.deleteRequestInsecure(request);
    }

    function submitOffer(uint requestID) public returns (uint8 status, uint offerID) {
        (, bool isRequestDefined) = isRequestDefined(requestID);

        if (!isRequestDefined) {
            emit FunctionStatus(UndefinedID);
            return (UndefinedID, 0);
        }

        Request storage request = requests[requestID];

        if(now > request.deadline) {
            emit FunctionStatus(DeadlinePassed);
            return (DeadlinePassed, 0);
        }

        if(request.reqStage != Stage.Open) {
            emit FunctionStatus(RequestNotOpen);
            return (RequestNotOpen, 0);
        }

        super.submitOffer(requestID);
    }

    function submitOfferArrayExtra(uint offerID, uint[] calldata extra) external returns (uint8 status, uint offID) {
        if (extra.length < minimumNumberOfOfferExtraElements || extra.length > maximumNumberOfOfferExtraElements) {
            emit FunctionStatus(InvalidInput);
            return (InvalidInput, 0);
        }

        Offer storage offer = offers[offerID];

        if(!offer.isDefined) {
            emit FunctionStatus(UndefinedID);
            return (UndefinedID, 0);
        }

        if(offer.offStage != Stage.Pending) {
            emit FunctionStatus(NotPending);
            return (NotPending, 0);
        }

        if(offer.offerMaker != msg.sender) {
            emit FunctionStatus(AccessDenied);
            return (AccessDenied, 0);
        }

        Request storage request = requests[offer.requestID];

        if(request.reqStage != Stage.Open) {
            emit FunctionStatus(RequestNotOpen);
            return (RequestNotOpen, 0);
        }

        RequestExtra storage requestExtra = requestsExtra[request.ID];
        OfferExtra memory offerExtra = buildOfferExtraFromRawArray(extra);

        uint8 validationStatusCode = validateOfferExtraAgainstRequestExtra(requestExtra, offerExtra);

        if (validationStatusCode != Successful) {
            emit FunctionStatus(validationStatusCode);
            return (validationStatusCode, 0);
        }

        offersExtra[offerID] = offerExtra;
        offer.offStage = Stage.Open;

        (uint8 _status, uint _offID) = super.finishSubmitOfferExtra(offerID);

        // If the instant rent offer is valid, decide the request with that offer as winning one.
        if (offerExtra.offerType == OfferType.InstantRent) {
            uint[] memory decidedOffers = new uint[](1);
            decidedOffers[0] = offerID;
            return (decideRequestInsecure(request, decidedOffers), offerID);
        } else {
            return (_status, _offID);
        }
    }

    function decideRequestInsecure(Request storage request, uint[] memory acceptedOfferIDs) internal returns (uint8 status) {
        super.decideRequestInsecure(request, acceptedOfferIDs);
        // Generate interledger event
        emitRequestDecisionInterledgerEvent(acceptedOfferIDs);
    }

    function buildOfferExtraFromRawArray(uint[] memory extra) private pure returns (OfferExtra memory offerExtra) {
        OfferExtra memory _offerExtra;
        _offerExtra.startOfRentTime = extra[0];
        _offerExtra.duration = extra[1];
        _offerExtra.offerType = OfferType(extra[2]);
        _offerExtra.pricePerMinute = extra[3];
        _offerExtra.offerCreatorDID = extra[4];
        if (extra.length == 6) {
            _offerExtra.offerCreatorAuthenticationKey = extra[5];
        }

        return _offerExtra;
    }

    function validateOfferExtraAgainstRequestExtra(RequestExtra storage requestExtra, OfferExtra memory offerExtra)
        private view returns (uint8 statusCode) {

            // The offer must start later than the request
            if (offerExtra.startOfRentTime < requestExtra.startOfRentTime) {
                return OfferExtraInvalid;
            }

            // The offer must finish earlier than the request
            if (offerExtra.startOfRentTime + offerExtra.duration > requestExtra.startOfRentTime + requestExtra.duration) {
                return OfferExtraInvalid;
            }

            // If it is an auction bid, the minimum price condition must be satisfied
            if (offerExtra.offerType == OfferType.Auction) {
                if (requestExtra.auctionMinPricePerSlot > offerExtra.pricePerMinute) {
                    return OfferExtraInvalid;
                }
            } else {    // If instant rent, match the pricing rules
                InstantRentPricingRule[] storage requestRules = requestExtra.rules;
                if (requestRules.length == 0) {         // Instant rent not supported
                    return InstantRentNotSupported;
                }

                uint minimumPriceToPay = getExpectedInstantRentPriceForOfferDuration(requestRules, offerExtra.duration);
                if (minimumPriceToPay > offerExtra.pricePerMinute) {
                    return OfferExtraInvalid;
                }
            }

            return Successful;
    }

    function getExpectedInstantRentPriceForOfferDuration(InstantRentPricingRule[] storage rules, uint offerDuration)
        private view returns (uint minimumPriceToPay) {
            for (uint i = 0; i < rules.length; i++) {
                if (rules[i].minimumNumberOfMinutes >= offerDuration) {
                    return rules[i].minimumPricePerMinute;
                }
            }

            //If offer duration is greater than anything specified in request rules, return the last value
            return rules[rules.length-1].minimumPricePerMinute;
    }

    function getOfferExtra(uint offerIdentifier)
    public view returns (uint8 status, uint startOfRentTime, uint duration, OfferType offerType, uint pricePerMinute, uint offerCreatorDID, uint offerCreatorAuthenticationKey) {
        Offer storage offer = offers[offerIdentifier];

        if(!offer.isDefined) {
            return (UndefinedID, 0, 0, offerType, 0, 0, 0);
        }

        OfferExtra storage offerExtra = offersExtra[offerIdentifier];

        return (
            Successful,
            offerExtra.startOfRentTime,
            offerExtra.duration,
            offerExtra.offerType,
            offerExtra.pricePerMinute,
            offerExtra.offerCreatorDID,
            offerExtra.offerCreatorAuthenticationKey
        );
    }

    function getType() external view returns (uint8 status, string memory) {
        return (Successful, "eu.sofie-iot.smaug-marketplace");
    }

    // Interledger sender interface support

    function interledgerCommit(uint256 id) public {}

    function interledgerAbort(uint256 id, uint256 reason) public {}

    function interledgerCommit(uint256 identity, bytes memory data) public {}    

    // Interledger receiver interface support

    // Called by IL when an access token has been issued on the authorisation blockchain. Data will contain the offer ID for which the token has been released and the encrypted token.
    // TODO: hard-coded for now. Metadata length is always 32 bytes (cause it contains offer ID). If metadata content changes, this method will also need to change.
    // TODO: Do something with the received access token as well (not used for now).
    function interledgerReceive(uint256 nonce, bytes memory data) public {

        // Only IL under a manager's account can call this function
        if(!(msg.sender == owner() || isManager(msg.sender))) {
            emit FunctionStatus(AccessDenied);
            emit InterledgerEventRejected(nonce);
            return;
        }

        uint offerID = abi.decode(slice(data, 0, 32), (uint256));
        (, bool isOfferDefined) = isOfferDefined(offerID);

        // Offer must be defined
        if (!isOfferDefined) {
            emit FunctionStatus(UndefinedID);
            emit InterledgerEventRejected(nonce);
            return;
        }

        Offer storage offer = offers[offerID];
        uint requestID = requests[offer.requestID].ID;
        (, bool isRequestDecided) = isRequestDecided(requestID);

        // Request must be decided
        if (!isRequestDecided) {
            emit FunctionStatus(ReqNotDecided);
            emit InterledgerEventRejected(nonce);
            return;
        }

        // TODO: Do something, i.e. move money and tokens around, store token somewhere.
        // bytes memory encryptedToken = slice(data, 32, data.length-32);
        emit InterledgerEventAccepted(nonce);
    }

    // From: https://github.com/GNSPS/solidity-bytes-utils/blob/master/contracts/BytesLib.sol#L227
    function slice(
        bytes memory _bytes,
        uint256 _start,
        uint256 _length
    )
        internal
        pure
        returns (bytes memory)
    {
        require(_bytes.length >= (_start + _length), "Read out of bounds");

        bytes memory tempBytes;

        assembly {
            switch iszero(_length)
            case 0 {
                // Get a location of some free memory and store it in tempBytes as
                // Solidity does for memory variables.
                tempBytes := mload(0x40)

                // The first word of the slice result is potentially a partial
                // word read from the original array. To read it, we calculate
                // the length of that partial word and start copying that many
                // bytes into the array. The first word we copy will start with
                // data we don't care about, but the last `lengthmod` bytes will
                // land at the beginning of the contents of the new array. When
                // we're done copying, we overwrite the full first word with
                // the actual length of the slice.
                let lengthmod := and(_length, 31)

                // The multiplication in the next line is necessary
                // because when slicing multiples of 32 bytes (lengthmod == 0)
                // the following copy loop was copying the origin's length
                // and then ending prematurely not copying everything it should.
                let mc := add(add(tempBytes, lengthmod), mul(0x20, iszero(lengthmod)))
                let end := add(mc, _length)

                for {
                    // The multiplication in the next line has the same exact purpose
                    // as the one above.
                    let cc := add(add(add(_bytes, lengthmod), mul(0x20, iszero(lengthmod))), _start)
                } lt(mc, end) {
                    mc := add(mc, 0x20)
                    cc := add(cc, 0x20)
                } {
                    mstore(mc, mload(cc))
                }

                mstore(tempBytes, _length)

                //update free-memory pointer
                //allocating the array padded to 32 bytes like the compiler does now
                mstore(0x40, and(add(mc, 31), not(31)))
            }
            //if we want a zero-length slice let's just return a zero-length array
            default {
                tempBytes := mload(0x40)

                mstore(0x40, add(tempBytes, 0x20))
            }
        }

        return tempBytes;
    }

    // Adapted from https://github.com/GNSPS/solidity-bytes-utils/blob/master/contracts/BytesLib.sol#L369
    function toUint256(bytes memory _bytes, uint256 _start) private pure returns (uint256) {
        require(_bytes.length >= (_start + 32), "Read out of bounds");
        uint256 tempUint;

        assembly { tempUint := mload(add(add(_bytes, 0x20), _start)) }

        return tempUint;
    }
}