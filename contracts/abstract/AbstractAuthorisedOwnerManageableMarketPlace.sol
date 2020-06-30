pragma solidity ^0.5.0;

import { AbstractMarketPlace } from "sofie-offer-marketplace/contracts/abstract/AbstractMarketPlace.sol";
import { MultiManagersBaseContract } from "sofie-offer-marketplace/contracts/base/MultiManagersBaseContract.sol";

import { AuthorisedManageableMarketPlace } from "../interfaces/AuthorisedManageableMarketPlace.sol";
import { SMAUGStatusCodes } from "../SMAUGStatusCodes.sol";
import { AccessTokenLibrary } from "../libraries/AccessTokenLibrary.sol";

/**
@notice An abstract contract implementing the `AuthorisedManageableMarketPlace`, `AbstractMarketPlace` and `MultiManagersBaseContract` contract from the SOFIE Marketplace component. The contract extends the functionality of request creation by requiring the presentation of a valid access token by the calling entity.
@author Antonio Antonino <antonio.antonino@ericsson.com>
@dev The contract is abstract, so it can only be instantiated via one of its subclasses. As of today, the only known subclass is `SMAUGMarketPlace.sol`.
*/
contract AbstractAuthorisedOwnerManageableMarketPlace is
AbstractMarketPlace, MultiManagersBaseContract, AuthorisedManageableMarketPlace, SMAUGStatusCodes {

    event RequestDecided(uint requestID, uint[] winningOffersIDs);        // Event generated whenever the winning offers for a request are chosen

    // Keeps track of what access tokens have been used already (to avoid token re-usage)
    mapping(bytes32 => bool) private usedTokens;
    bytes32[] private tokenReferences;

    /**
    @notice Provides initialisation instructions for all subclassing contracts. It registers the management interface conformance (submitRequest, closeRequest, decideRequest, deleteRequest).
    @dev Interface compliance follows the ERC165 standard.
    */
    constructor() AbstractMarketPlace() MultiManagersBaseContract(msg.sender) public {
        _registerInterface(this.submitRequest.selector ^
                            this.closeRequest.selector ^
                            this.decideRequest.selector ^
                            this.deleteRequest.selector
        );
    }

    /**
    @notice Reset the history of used access tokens.
    @dev DANGEROUS SINCE OWNERS OF OLD ACCESS TOKENS COULD RE-USE THEM WITHOUT SUPERVISION OF THE MARKETPLACE OWNER. Only the marketplace owner or a manager can call this function.
    @return The status code of the operation.
    */
    function resetAccessTokens() public returns (uint8 status) {
        if(!(msg.sender == owner() || isManager(msg.sender))) {
            emit FunctionStatus(AccessDenied);
            return AccessDenied;
        }

        for (uint tokenReferenceIndex = 0; tokenReferenceIndex < tokenReferences.length; tokenReferenceIndex++) {
            bytes32 tokenReference = tokenReferences[tokenReferenceIndex];
            delete usedTokens[tokenReference];
        }
        delete tokenReferences;

        emit FunctionStatus(Successful);
    }

    function finishSubmitRequestExtra(uint requestIdentifier) internal returns (uint8 status, uint requestID) {
        openRequest(requestIdentifier);

        emit FunctionStatus(Successful);
        emit RequestExtraAdded(requestIdentifier);
        return (Successful, requestIdentifier);
    }

    function openRequest(uint requestIdentifier) internal {
        requests[requestIdentifier].reqStage = Stage.Open;
        openRequestIDs.push(requests[requestIdentifier].ID);
    }

    /**
    @notice Create a new a request.
    @param tokenDigest The digest of the access token used to invoke this function.
    @param signature The signature over the token digest.
    @param nonce A nonce used to generate the token digest
    @param deadline The deadline after which the request will not be accepting new offers anymore.
    @dev
    The following requirements are to be met for a successful operation:
        - the token used must be valid. Specifically, it must fulfill the following requirements:
            * The account calling this function must match the token subject.
            * The smart contract account must match the token audience.
            * The function selector of the token must match the ABI of this function.
            * The nonce of the token must not have been previously used.
            * The access token must have been signed by a marketplace manager.
    This operation will create a request which is pending (not open), meaning that to be considered by potential offer creators the request creator must also submit the extra information by calling `submitRequestArrayExtra`.
    @return The tuple (status, requestID) where status is the status code of the transaction, and requestID is the request ID created by the smart contract.
    */
    function submitRequest
        (bytes32 tokenDigest, bytes memory signature, bytes32 nonce, uint deadline)
        public returns (uint8 status, uint requestID) {

            bool isTokenValid = isValidAccessTokenForFunctionAndNonce(
                tokenDigest, signature, nonce, this.submitRequest.selector, msg.sender, address(this)
            );

            if (!isTokenValid) {
                emit FunctionStatus(AccessDenied);
                return (AccessDenied, 0);
            }

            if (isTokenUsed(tokenDigest)) {
                emit FunctionStatus(TokenAlreadyUsed);
                return (TokenAlreadyUsed, 0);
            }
            consumeToken(tokenDigest);

            Request storage request = requests[reqNum];

            request.deadline = deadline;
            request.ID = reqNum;
            reqNum += 1;
            request.isDefined = true;
            request.reqStage = Stage.Pending;
            request.isDecided = false;
            request.requestMaker = msg.sender;

            emit FunctionStatus(Successful);
            emit RequestAdded(request.ID, request.deadline);
            return (Successful, request.ID);
    }

    function isValidAccessTokenForFunctionAndNonce
        (bytes32 digest, bytes memory signature, bytes32 nonce, bytes4 functionSelector, address subjectAddress, address audienceAddress)
        private view returns (bool isValidToken) {
            (bool isValid, address signer) =
            AccessTokenLibrary.validateAndReturnTokenSigner(digest, signature, nonce, functionSelector, subjectAddress, audienceAddress);

            return isValid && isManager(signer);
    }

    function isTokenUsed(bytes32 tokenDigest) private view returns (bool) {
        return usedTokens[tokenDigest];
    }

    function consumeToken(bytes32 token) private {
        tokenReferences.push(token);
        usedTokens[token] = true;
    }

    /*
    When offer marketplace will be updated, the AbstractManageableMarketplace contract will check that a request exists before doing any operation.
    Functionality missing in the original SOFIE AbstractManageableMarketPlace smart contract. Issue reported on 01/04/2020 at 13:20.
    */
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

        return closeRequestInsecure(request);
    }

    function isRequestCreator(Request storage request, address _address) internal view returns (bool) {
        return request.requestMaker == _address;
    }

    function closeRequestInsecure(Request storage request) internal returns (uint8 status) {
        uint requestIdentifier = request.ID;

        request.reqStage = Stage.Closed;
        request.closingBlock = block.number;

        closedRequestIDs.push(requestIdentifier);

        for (uint j = 0; j < openRequestIDs.length; j++) {
            if (openRequestIDs[j] == requestIdentifier) {
                for (uint i = j; i < openRequestIDs.length - 1; i++){
                    openRequestIDs[i] = openRequestIDs[i+1];
                }
                delete openRequestIDs[openRequestIDs.length-1];
                openRequestIDs.length--;
                emit FunctionStatus(Successful);
                return Successful;
            }
        }
    }

    function decideRequestInsecure(Request storage request, uint[] memory acceptedOfferIDs) internal returns (uint8 status) {
        closeRequestInsecure(request);

        request.acceptedOfferIDs = acceptedOfferIDs;
        request.isDecided = true;

        emit FunctionStatus(Successful);
        emit RequestDecided(request.ID, acceptedOfferIDs);
        return Successful;
    }

    function deleteRequest(uint requestIdentifier) public returns (uint8 status) {
        (, bool isRequestDefined) = isRequestDefined(requestIdentifier);
        if (!isRequestDefined) {
            emit FunctionStatus(UndefinedID);
            return (UndefinedID);
        }

        Request storage request = requests[requestIdentifier];

        bool isCallerRequestCreator = isRequestCreator(request, msg.sender);
        if (!isCallerRequestCreator) {
            emit FunctionStatus(AccessDenied);
            return (AccessDenied);
        }

        if(request.reqStage != Stage.Closed) {
            emit FunctionStatus(ReqNotClosed);
            return ReqNotClosed;
        }

        if(request.closingBlock + waitBeforeDeleteBlocks > block.number) {
            emit FunctionStatus(NotTimeForDeletion);
            return NotTimeForDeletion;
        }

        return deleteRequestInsecure(request);
    }

    function deleteRequestInsecure(Request storage request) internal returns (uint8 status) {
        for (uint k = 0; k < request.offerIDs.length; k++) {
            delete offers[request.offerIDs[k]];
        }

        uint requestID = request.ID;

        delete requests[requestID];

        for (uint j = 0; j < closedRequestIDs.length; j++) {
            if (closedRequestIDs[j] == requestID) {
                for (uint i = j; i < closedRequestIDs.length - 1; i++){
                    closedRequestIDs[i] = closedRequestIDs[i+1];
                }
                delete closedRequestIDs[closedRequestIDs.length-1];
                closedRequestIDs.length--;
                emit FunctionStatus(Successful);
                return Successful;
            }
        }
    }

    /**
    @notice Get the marketplace information, i.e., the owner address of the marketplace.
    @return The tuple (status, ownerAddress) where status is the status code of the transaction, and ownerAddress is the owner of the marketplace.
    */
    function getMarketInformation() public view returns (uint8 status, address ownerAddress) {
        return (Successful, owner());
    }
}