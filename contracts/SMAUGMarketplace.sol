pragma solidity ^0.5.0;

import { InterledgerReceiverInterface } from "sofie-interledger-contracts/contracts/InterledgerReceiverInterface.sol";
import { InterledgerSenderInterface } from "sofie-interledger-contracts/contracts/InterledgerSenderInterface.sol";

import { AbstractAuthorisedOwnerManageableMarketPlace } from "./abstract/AbstractAuthorisedOwnerManageableMarketPlace.sol";
import { RequestArrayExtra, OfferArrayExtra } from "./interfaces/ArrayExtraData.sol";
import { UtilsLibrary } from "./libraries/UtilsLibrary.sol";

contract SMAUGMarketPlace is AbstractAuthorisedOwnerManageableMarketPlace, RequestArrayExtra, OfferArrayExtra, InterledgerSenderInterface, InterledgerReceiverInterface {

    event Debug(uint value);         // Temporary event, used for debugging purposes
    event Debug2(bytes valueBytes);
    event OfferFulfilled(uint indexed offerID, bytes token);
    event PaymentCashedOut(uint indexed requestID, uint indexed offerID, uint amount);

    enum InterledgerEventType {
        RequestDecision
    }

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
        uint priceOffered;                     // The amount of Ethers that the offer contained.
        uint offerCreatorDID;                    // The DID to decrypt the issued access token, in case the offer is selected.
        uint offerCreatorAuthenticationKey;      // OPTIONAL. This key would be used by the receiver of the access token to authenticate him/her self to the smart locker. If no key is provided in the offer, the generated token will be a bearer token.
    }

    struct PaymentDetails {
        bool created;
        bool resolved;
        uint amount;
        Request request;
    }

    enum OfferType { Auction, InstantRent }


    uint private minimumNumberOfRequestExtraElements = 4;               // rules is optional

    uint private minimumNumberOfOfferExtraElements = 4;                 // offerCreatorAuthenticationKey is optional
    uint private maximumNumberOfOfferExtraElements = 5;


    mapping (uint => RequestExtra) private requestsExtra;
    mapping (uint => OfferExtra) private offersExtra;

    mapping (uint => PaymentDetails) private pendingPayments;                     // offerID -> true if the offer is pending


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

    function decideRequestInsecure(Request storage request, uint[] memory acceptedOfferIDs) internal returns (uint8) {
        uint8 status = super.decideRequestInsecure(request, acceptedOfferIDs);
        // Generate interledger event
        emitRequestDecisionInterledgerEvent(acceptedOfferIDs);
        return status;
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

    function submitOfferArrayExtra(uint offerID, uint[] calldata extra) external payable returns (uint8 status, uint offID) {
        require(
            extra.length >= minimumNumberOfOfferExtraElements && extra.length <= maximumNumberOfOfferExtraElements,
            UtilsLibrary.stringifyStatusCode(InvalidInput)
        );

        Offer storage offer = offers[offerID];

        require(
            offer.isDefined,
            UtilsLibrary.stringifyStatusCode(UndefinedID)
        );

        require(
            offer.offStage == Stage.Pending,
            UtilsLibrary.stringifyStatusCode(NotPending)
        );

        require(
            offer.offerMaker == msg.sender,
            UtilsLibrary.stringifyStatusCode(AccessDenied)
        );

        Request storage request = requests[offer.requestID];

        require(
            request.reqStage == Stage.Open,
            UtilsLibrary.stringifyStatusCode(RequestNotOpen)
        );

        RequestExtra storage requestExtra = requestsExtra[request.ID];
        OfferExtra memory offerExtra = buildOfferExtraFromRawArray(extra);

        validateOfferExtraAndPaymentAgainstRequestExtra(requestExtra, offerExtra, msg.value);

        updateOfferAndRegisterPendingPayment(offerExtra, request, offerID, msg.value);
        offersExtra[offerID] = offerExtra;
        offer.offStage = Stage.Open;

        (uint8 _offerSubmissionStatus,) = super.finishSubmitOfferExtra(offerID);

        require(
            _offerSubmissionStatus == Successful,
            UtilsLibrary.stringifyStatusCode(_offerSubmissionStatus)
        );

        // If the instant rent offer is valid, decide the request with that offer as winning one.
        if (offerExtra.offerType == OfferType.InstantRent) {
            uint[] memory decidedOffers = new uint[](1);
            decidedOffers[0] = offerID;
            uint8 _requestDecisionStatus = decideRequestInsecure(request, decidedOffers);

            require(
                _requestDecisionStatus == Successful,
                UtilsLibrary.stringifyStatusCode(_requestDecisionStatus)
            );
        }
        return (Successful, offerID);
    }

    function buildOfferExtraFromRawArray(uint[] memory extra) private pure returns (OfferExtra memory offerExtra) {
        OfferExtra memory _offerExtra;
        _offerExtra.startOfRentTime = extra[0];
        _offerExtra.duration = extra[1];
        _offerExtra.offerType = OfferType(extra[2]);
        _offerExtra.offerCreatorDID = extra[3];
        if (extra.length == 5) {
            _offerExtra.offerCreatorAuthenticationKey = extra[4];
        }

        return _offerExtra;
    }

    function validateOfferExtraAndPaymentAgainstRequestExtra(RequestExtra storage requestExtra, OfferExtra memory offerExtra, uint paymentAmount)
    private view {

            // The offer must start later than the request
            require(
                offerExtra.startOfRentTime >= requestExtra.startOfRentTime,
                UtilsLibrary.stringifyStatusCode(OfferExtraInvalid)
            );

            // The offer must finish earlier than the request
            require(
                offerExtra.startOfRentTime + offerExtra.duration <= requestExtra.startOfRentTime + requestExtra.duration,
                UtilsLibrary.stringifyStatusCode(OfferExtraInvalid)
            );

            if (offerExtra.offerType == OfferType.Auction) {    // If it is an auction bid, the minimum price condition must be satisfied
                require(
                    requestExtra.auctionMinPricePerSlot * offerExtra.duration <= paymentAmount,
                    UtilsLibrary.stringifyStatusCode(InsufficientEscrowPayment)
                );
            } else {    // If instant rent, it must match the pricing rules
                InstantRentPricingRule[] storage requestRules = requestExtra.rules;
                require(
                    requestRules.length > 0,                        // Instant rent not supported
                    UtilsLibrary.stringifyStatusCode(InstantRentNotSupported)
                );

                uint minimumPriceToPay = getExpectedInstantRentPriceForOfferDuration(requestRules, offerExtra.duration);
                require(
                    minimumPriceToPay <= paymentAmount,
                    UtilsLibrary.stringifyStatusCode(InsufficientEscrowPayment)
                );
            }
    }

    function updateOfferAndRegisterPendingPayment
    (OfferExtra memory offerExtra, Request storage request, uint offerID, uint paymentAmount) internal {
        offerExtra.priceOffered = paymentAmount;

        pendingPayments[offerID] = PaymentDetails(true, false, paymentAmount, request);
    }

    function emitRequestDecisionInterledgerEvent(uint[] memory acceptedOfferIDs) internal {
        bytes memory payload = new bytes(0);

        for (uint i = 0; i < acceptedOfferIDs.length; i++) {
            uint acceptedOfferID = acceptedOfferIDs[i];
            OfferExtra storage offerExtra = offersExtra[acceptedOfferID];
            bytes memory interledgerEventPayload = getInterledgerPayloadFromOfferExtra(acceptedOfferID, offerExtra);
            payload = abi.encodePacked(payload, interledgerEventPayload);
        }
        emit InterledgerEventSending(uint256(InterledgerEventType.RequestDecision), payload);
    }

    /*
    Returns either the concatenation of all the offer IDs winner DIDs, and winner authKey, if present.
    Each entry in the list has the following format:
        x + offerID + offerDID [+ offerAuthKey]
            byte x = 1 if offerAuthKey is not null, 0 otherwise
            bytes offerID = the value of the offer ID
            bytes offerDID = the value of the offer creator DID (max 32)
            bytes offerAuthKey = the value of the offer creator auth key (OPTIONAL, max 32)
    DIDs and authKey are max 32 bytes because given as array extra parameters which allow for uint256 values max. Might be worth creating another way of passing data via bytes.
    So, each entry in the list is long either 33 or 65 bytes, depending on the value of the first byte (33 if first byte is 0, 65 if 1).
    */
    function getInterledgerPayloadFromOfferExtra(uint offerID, OfferExtra storage offerExtra) private view returns (bytes memory) {
        uint offerDID = offerExtra.offerCreatorDID;
        uint offerCreatorAuthenticationKey = offerExtra.offerCreatorAuthenticationKey;
        byte authKeyPresenceByte = byte(offerCreatorAuthenticationKey == 0 ? 0 : 1);
        bytes memory offerIDBytes = UtilsLibrary.toBytes(offerID);
        bytes memory offerDIDBytes = UtilsLibrary.toBytes(offerDID);
        bytes memory result = abi.encodePacked(authKeyPresenceByte, offerIDBytes, offerDIDBytes);
        if (offerCreatorAuthenticationKey != 0) {
            bytes memory offerCreatorAuthenticationKeyBytes = UtilsLibrary.toBytes(offerCreatorAuthenticationKey);
            result = abi.encodePacked(result, offerCreatorAuthenticationKeyBytes);
        }
        return result;
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
    public view returns (uint8 status, uint startOfRentTime, uint duration, OfferType offerType, uint priceOffered, uint offerCreatorDID, uint offerCreatorAuthenticationKey) {
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
            offerExtra.priceOffered,
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

    function interledgerCommit(uint256 id, bytes memory data) public {}    

    // Interledger receiver interface support

    // Called by IL when an access token has been issued on the authorisation blockchain. Data will contain the offer ID for which the token has been released and the encrypted token.
    // Hard-coded for now. Metadata length is always 32 bytes (cause it contains offer ID). If metadata content changes, this method will also need to change.
    // TODO: Perhaps interledger should contain all the IDs of the winning offers for a request, so that the remaning offers can be claimed back by the offer makers.
    // TODO: Do something with the received access token as well (not used for now).
    function interledgerReceive(uint256 nonce, bytes memory data) public {

        // Only IL under a manager's account can call this function
        if(!(msg.sender == owner() || isManager(msg.sender))) {
            emit FunctionStatus(AccessDenied);
            emit InterledgerEventRejected(nonce);
            return;
        }

        uint offerID = abi.decode(UtilsLibrary.slice(data, 0, 32), (uint256));
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

        // Set money that can be claimed by the request creator
        PaymentDetails storage payment = pendingPayments[offerID];
        payment.resolved = true;

        bytes memory encryptedToken = UtilsLibrary.slice(data, 32, data.length-32);
        emit InterledgerEventAccepted(nonce);
        emit OfferFulfilled(offerID, encryptedToken);
    }

    // Money operations

    function withdraw(uint offerID) public returns (uint8 status, uint amount) {
        PaymentDetails storage paymentDetails = pendingPayments[offerID];

        if (!paymentDetails.created) {
            emit FunctionStatus(PaymentNotExisting);
            return (PaymentNotExisting, 0);
        }

        if (!paymentDetails.resolved) {
            emit FunctionStatus(PaymentNotResolved);
            return (PaymentNotResolved, 0);
        }

        uint requestID = paymentDetails.request.ID;

        Request storage request = requests[requestID];
        address expectedPaymentReceiver = request.requestMaker;

        if (expectedPaymentReceiver != msg.sender) {
            emit FunctionStatus(AccessDenied);
            return (AccessDenied, 0);
        }

        uint paymentAmount = paymentDetails.amount;

        delete pendingPayments[offerID];
        msg.sender.transfer(paymentAmount);
        emit PaymentCashedOut(requestID, offerID, paymentAmount);
        emit FunctionStatus(Successful);
        return (Successful, paymentAmount);
    }
}