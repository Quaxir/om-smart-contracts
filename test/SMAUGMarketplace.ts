//TODO: Test instant rent with contract that does not support it

import { generateFunctionSignedTokenWithAccount } from "../../src/utils"
import * as path from "path"

let Web3 = require("web3")
let SMAUGMarketPlace = artifacts.require("SMAUGMarketPlace")

contract("SMAUGMarketPlace", async accounts => {

    const Web3 = require("web3")
    const SMAUGMarketPlace = artifacts.require("SMAUGMarketPlace")
    const SMAUGSmartContractJSONInterfacePath = path.resolve(__dirname, "..", "build", "contracts", "SMAUGMarketPlace.json")
    const submitRequestMethodName = "submitRequest"

    it("RequestArrayExtra interface conformance", async () => {
        let contract = await SMAUGMarketPlace.deployed()
        let interfaceMethodSelectorEncoded = web3.eth.abi.encodeFunctionSignature("submitRequestArrayExtra(uint256,uint256[])")
        let isContractConformant = await contract.supportsInterface(web3.utils.hexToBytes(interfaceMethodSelectorEncoded))
        assert.equal(isContractConformant, true, "Contract should support the RequestArrayExtra interface.")
    })
    
    it("OfferArrayExtra interface conformance", async () => {
        let contract = await SMAUGMarketPlace.deployed()
        let interfaceMethodSelectorEncoded = web3.eth.abi.encodeFunctionSignature("submitOfferArrayExtra(uint256,uint256[])")
        let isContractConformant = await contract.supportsInterface(web3.utils.hexToBytes(interfaceMethodSelectorEncoded))
        assert.equal(isContractConformant, true, "Contract should support the OfferArrayExtra interface.")
    })    

    it("getType", async () => {
        let contract = await SMAUGMarketPlace.deployed()
        let expectedType = "eu.sofie-iot.smaug-marketplace"

        let marketType = (await contract.getType())[1]
        assert.equal(marketType, expectedType, "Wrong marketplace type returned.")
    })

    it("closeRequest & getClosedRequestIdentifiers (AbstractMarketPlace)", async () => {
        let owner = accounts[0]
        let requestCreator = accounts[1]
        let contract = await SMAUGMarketPlace.new({from: owner})

        // Valid request closure

        let requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        let tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 10, {from: requestCreator})
        let requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        tx = await contract.closeRequest(requestID, {from: requestCreator})
        let txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 0, "Request closing should succeed.")
        let closedRequestsResult = await contract.getClosedRequestIdentifiers()
        let closedRequestIDs = closedRequestsResult[1].map(requestID => requestID.toNumber())
        assert.equal(closedRequestIDs.length, 1, "Contract should only have one closed request.")
        assert.equal(closedRequestIDs[0], requestID, "ID of closed request different than expected.")
        let requestDetails = await contract.getRequest(requestID)
        let requestStage = requestDetails.stage
        assert.equal(requestStage, 2, "Request stage should be closed.")

        // Request not defined

        tx = await contract.closeRequest(99999, {from: requestCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 2, "closeRequest() should fail because there is not open request with given ID.")

        // closeRequest() called by someone who is not the request creator

        let otherRequestCreator = accounts[9]
        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 10, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        tx = await contract.closeRequest(requestID, {from: otherRequestCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 1, "closeRequest() should fail because the caller is not the creator of the request.")        
    })
    
    it("decideRequest & isRequestDecided (AbstractMarketPlace) & getRequestDecision (AbstractMarketPlace)", async () => {
        let owner = accounts[0]
        let requestCreator = accounts[1]
        let offerCreator = accounts[2]
        let contract = await SMAUGMarketPlace.new({from: owner})

        // Valid request decision

        let requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        let tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 100000000000, {from: requestCreator})
        let requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 500, 1, 1], {from: requestCreator})
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        let offerID1 = tx.logs[1].args.offerID.toNumber()
        let offer1DID = 1
        let offer1AuthenticationKey = 2
        await contract.submitOfferArrayExtra(offerID1, [2, 5, 0, 5, offer1DID, offer1AuthenticationKey], {from: offerCreator})        // This one also includes the optional authentiction key
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        let offerID2 = tx.logs[1].args.offerID.toNumber()
        let offer2DID = 3
        await contract.submitOfferArrayExtra(offerID2, [2, 5, 0, 5, offer2DID], {from: offerCreator})
        tx = await contract.decideRequest(requestID, [offerID1, offerID2], {from: requestCreator})

        let offer1DecisionInterledgerEventType = tx.logs[3].event
        assert.equal(offer1DecisionInterledgerEventType, "InterledgerEventSending", "decideRequest() did not produce the expected interledger event.")
        let offer1DecisionInterledgerEventID = tx.logs[3].args.id
        assert.equal(0, offer1DecisionInterledgerEventID, "Interledger event ID should have been of value 0.")
        let offer1DecisionInterledgerEventData = web3.utils.hexToBytes(tx.logs[3].args.data)
        assert.equal(offer1DecisionInterledgerEventData.length, 96, "Offer decision interledger event should contain both keys -> a byte array long 64 bytes.")
        let offer1DecisionInterledgerEventOfferID = web3.utils.hexToNumber(web3.utils.bytesToHex(offer1DecisionInterledgerEventData.slice(0, 32)))
        assert.equal(offer1DecisionInterledgerEventOfferID, offerID1, "Offer decision interledger event returned wrong offer ID.")
        let offer1DecisionInterledgerEventDID = web3.utils.hexToNumber(web3.utils.bytesToHex(offer1DecisionInterledgerEventData.slice(32, 64)))
        assert.equal(offer1DecisionInterledgerEventDID, offer1DID, "Offer decision interledger event returned wrong DID.")
        let offer1DecisionInterledgerEventAuthenticationKey = web3.utils.hexToNumber(web3.utils.bytesToHex(offer1DecisionInterledgerEventData.slice(64, 96)))
        assert.equal(offer1DecisionInterledgerEventAuthenticationKey, offer1AuthenticationKey, "Offer decision interledger event returned wrong authentication key.")
        let offer2DecisionInterledgerEventType = tx.logs[4].event
        assert.equal(offer2DecisionInterledgerEventType, "InterledgerEventSending", "decideRequest() did not produce the expected interledger event.")
        let offer2DecisionInterledgerEventID = tx.logs[4].args.id
        assert.equal(0, offer2DecisionInterledgerEventID, "Interledger event ID should have been of value 0.")
        let offer2DecisionInterledgerEventData = web3.utils.hexToBytes(tx.logs[4].args.data)
        assert.equal(offer2DecisionInterledgerEventData.length, 64, "Offer decision interledger event should contain only DID -> a byte array long 32 bytes.")
        let offer2DecisionInterledgerEventOfferID = web3.utils.hexToNumber(web3.utils.bytesToHex(offer2DecisionInterledgerEventData.slice(0, 32)))
        assert.equal(offer2DecisionInterledgerEventOfferID, offerID2, "Offer decision interledger event returned wrong offer ID.")
        let offer2DecisionInterledgerEventDID = web3.utils.hexToNumber(web3.utils.bytesToHex(offer2DecisionInterledgerEventData.slice(32, 64)))
        assert.equal(offer2DecisionInterledgerEventDID, offer2DID, "Offer decision interledger event returned wrong DID.")

        let winningOfferIDs = tx.logs[2].args.winningOffersIDs.map(offerID => offerID.toNumber())
        assert.equal(winningOfferIDs.length, 2, "Number of winning offer IDs should be 2.")
        assert.equal(winningOfferIDs[0], offerID1, "The ID of the winning should match the ID of the offer made.")
        let isRequestDecided = (await contract.isRequestDecided(requestID))[1]
        assert.isTrue(isRequestDecided, "Request should be decided after a valid instant rent offer has been submitted.")
        let requestDecision = await contract.getRequestDecision(requestID)
        winningOfferIDs = requestDecision.acceptedOfferIDs.map(offerID => offerID.toNumber())
        assert.equal(winningOfferIDs.length, 2, "Number of winning offer IDs should be 1.")
        assert.equal(winningOfferIDs[0], offerID1, "The ID of the first winning offer should match the ID of the offer made.")
        assert.equal(winningOfferIDs[1], offerID2, "The ID of the second winning offer should match the ID of the offer made.")

        // Undefined request

        tx = await contract.decideRequest(99999, [], {from: requestCreator})
        let txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 2, "decideRequest() should fail becase request with given ID is not present.")

        // Unauthorised user to decide the request

        let anauthorisedUser = accounts[9]
        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 100000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        tx = await contract.decideRequest(requestID, [], {from: anauthorisedUser})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 1, "decideRequest() should fail becase caller is different than request creator.")
    })

    it("deleteRequest", async () => {
        let owner = accounts[0]
        let requestCreator = accounts[1]
        let offerCreator = accounts[2]
        let contract = await SMAUGMarketPlace.new({from: owner})

        // Valid request deletion

        let requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        let tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 100000000000, {from: requestCreator})
        let requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        await contract.closeRequest(requestID, {from: requestCreator})
        tx = await contract.deleteRequest(requestID, {from: requestCreator})
        let txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 0, "deleteRequest() should succeed.")
        let requestInfo = await contract.getRequest(requestID)
        let requestInfoStatus = requestInfo.status.toNumber()
        assert.equal(requestInfoStatus, 2, "getRequest() should return status code 2 since the request has been deleted.")

        // Undefined request

        tx = await contract.deleteRequest(99999, {from: requestCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 2, "decideRequest() should fail becase request with given ID is not present.")

        // Unauthorised user to decide the request

        let anauthorisedUser = accounts[9]
        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 100000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        tx = await contract.deleteRequest(requestID, {from: anauthorisedUser})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 1, "decideRequest() should fail becase caller is different than request creator.")        

        // Request not closed

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 100000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        tx = await contract.deleteRequest(requestID, {from: requestCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 7, "decideRequest() should fail becase request is not closed yet.")
    })

    it("submitRequestArrayExtra & getRequestExtra & getOpenRequestIdentifiers (AbstractMarketPlace)", async () => {
        let owner = accounts[0]
        let requestCreator = accounts[1]
        let contract = await SMAUGMarketPlace.new({from: owner})
        let expectedlockerID = "0xa5b9d60f32436310afebcfda832817a68921beb782fabf7915cc0460b443116a"

        // Valid request extra submission

        let validPricingRules = [
            [],
            [1, 1],
            [1, 50, 5, 40, 10, 30, 30, 20, 60, 10]
        ]
        for (let validPricingRule of validPricingRules) {
            let requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
            let tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000, {from: requestCreator})
            let requestID = tx.logs[1].args.requestID.toNumber()
            tx = await contract.submitRequestArrayExtra(requestID, [1, 100, 1].concat(validPricingRule).concat([web3.utils.toBN(expectedlockerID)]), {from: requestCreator})
            let txStatusCode = tx.logs[0].args.status.toNumber()
            assert.equal(txStatusCode, 0, "Request extra submission should succeed.")
            let requestDetails = await contract.getRequest(requestID)
            let requestStage = requestDetails.stage
            assert.equal(requestStage, 1, "getRequest() should succeed.")
            let requestExtraDetails = await contract.getRequestExtra(requestID)
            txStatusCode = requestExtraDetails.status
            let startOfRentTime = requestExtraDetails.startOfRentTime
            let duration = requestExtraDetails.duration
            let auctionMinPricePerSlot = requestExtraDetails.auctionMinPricePerSlot
            let instantBuyRules = requestExtraDetails.instantBuyRules.map(rule => rule.toNumber())
            let lockerID = web3.utils.toHex(requestExtraDetails.lockerID)
            assert.equal(txStatusCode, 0, "Wrong status code returned.")
            assert.equal(startOfRentTime, 1, "Wrong startOfRentTime returned.")
            assert.equal(duration, 100, "Wrong duration returned.")
            assert.equal(auctionMinPricePerSlot, 1, "Wrong auctionMinPricePerSlot returned.")
            assert.equal(JSON.stringify(instantBuyRules), JSON.stringify(validPricingRule), "Wrong instantBuyRules returned.")
            assert.equal(lockerID, expectedlockerID, "Wrong lockerID returned.")
        }

        // Invalid request extra submission (array needs to be at least 4-element long)

        let invalidExtras = [
            [],
            [1],
            [1, 2],
            [1, 2, 3]
        ]

        for (let invalidExtra of invalidExtras) {
            let requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
            let tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000, {from: requestCreator})
            let requestID = tx.logs[1].args.requestID.toNumber()
            tx = await contract.submitRequestArrayExtra(requestID, invalidExtra, {from: requestCreator})
            let txStatusCode = tx.logs[0].args.status.toNumber()
            assert.equal(txStatusCode, 12, "Request extra submission should fail because number of extra elements is wrong.")
        }

        // Invalid request ID

        let requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000, {from: requestCreator})
        let tx = await contract.submitRequestArrayExtra(99999, [1, 1, 1, 1], {from: requestCreator})
        let txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 2, "Request extra submission should fail because request does not exist.")

        // Request not pending

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000, {from: requestCreator})
        let requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        tx = await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 5, "Request extra submission should fail because request is not pending.")

        // Request extra submitter != request creator

        let unauthorisedUser = accounts[2]
        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        tx = await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: unauthorisedUser})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 1, "Request extra submission should fail because request creator != request extra submitter.")

        // Pricing rule extending beyong the request duration

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        let requestDuration = 1
        let pricingStartRange = 5
        tx = await contract.submitRequestArrayExtra(requestID, [1, requestDuration, 1, pricingStartRange, 2, 1], {from: requestCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 12, "Request extra submission should fail because pricing rules contain duration start range beyong the request duration.")

        // Invalid instant buy pricing rules

        let invalidPricingRules = [
            [1],                                                    // # of values must be even
            [1, 2, 3],                                              // # of values must be even
            [1, 50, 5, 40, 10, 30, 7, 20, 60, 10]                   // # 1st, 3rd, 5th.... values must be monotonically increasing
        ]

        for (let invalidPricingRule of invalidPricingRules) {
            let requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
            let tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000, {from: requestCreator})
            let requestID = tx.logs[1].args.requestID.toNumber()
            tx = await contract.submitRequestArrayExtra(requestID, [1, 1, 1].concat(invalidPricingRule).concat([1]), {from: requestCreator})
            let txStatusCode = tx.logs[0].args.status.toNumber()
            assert.equal(txStatusCode, 12, "Request extra submission should fail because pricing rules for instant rent are not valid.")
        }
    })

    it("submitOffer & isOfferDefined (AbstractMarketPlace) & getOffer (AbstractMarketPlace) & getRequestOfferIDs (AbstractMarketPlace)", async () => {

        let owner = accounts[0]
        let requestCreator = accounts[1]
        let offerCreator = accounts[2]
        let contract = await SMAUGMarketPlace.new({from: owner})

        // Valid offer creation

        let requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        let tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000000, {from: requestCreator})
        let requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        let txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 0, "Offer submission should succeed.")
        let offerID = tx.logs[1].args.offerID.toNumber()
        let offerDetails = await contract.getOffer(offerID)
        let offerRequestID = offerDetails.requestID.toNumber()
        let offerMaker = offerDetails.offerMaker
        let stage = offerDetails.stage
        assert.equal(offerRequestID, requestID, "Wrong offerRequestID returned.")
        assert.equal(offerMaker, offerCreator, "Wrong offerMaker returned.")
        assert.equal(stage, 0, "Wrong stage returned.")

        // Offer for request not defined

        tx = await contract.submitOffer(99999, {from: offerCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 2, "Offer submission should fail because the request is not defined.")

        // Offer for past deadline

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 3, "Offer submission should fail because the deadline for submitting offer has passed.")

        // Offer for not open request

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 4, "Offer submission should fail because the request is not open.")
    })

    it("submitOfferArrayExtra & getOfferExtra", async () => {
        let owner = accounts[0]
        let requestCreator = accounts[1]
        let offerCreator = accounts[2]
        let contract = await SMAUGMarketPlace.new({from: owner})

        // Valid auction offer extra submission with no authentication key

        let requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        let tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000000, {from: requestCreator})
        let requestID = tx.logs[1].args.requestID.toNumber()
        let requestStartingTime = 1
        let requestDuration = 5
        let requestMinAuctionPrice = 10
        await contract.submitRequestArrayExtra(requestID, [requestStartingTime, requestDuration, requestMinAuctionPrice, 1], {from: requestCreator})
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        let offerID = tx.logs[1].args.requestID.toNumber()
        let inputOfferCreatorDID = web3.utils.stringToHex("2wJPyULfLLnYTEFYzByfUR")
        tx = await contract.submitOfferArrayExtra(offerID, [requestStartingTime, requestDuration, 0, requestMinAuctionPrice, web3.utils.toBN(inputOfferCreatorDID)], {from: offerCreator})
        let txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 0, "Offer extra submission should succeed.")
        let offerExtraDetails = await contract.getOfferExtra(offerID)
        let txStatus = offerExtraDetails.status
        let offerStartingTime = offerExtraDetails.startOfRentTime
        let offerType = offerExtraDetails.offerType
        let offerCreatorDID = offerExtraDetails.offerCreatorDID
        let offerCreatorAuthenticationKey = offerExtraDetails.offerCreatorAuthenticationKey
        assert.equal(txStatus, 0, "getOfferExtra() should succeed.")
        assert.equal(offerStartingTime, requestStartingTime, "Wrong offerStartingTime returned.")
        assert.equal(offerType, 0, "Wrong offerType returned.")
        assert.equal(web3.utils.toHex(offerCreatorDID), inputOfferCreatorDID, "Wrong offerCreatorDID returned")
        assert.equal(web3.utils.toHex(offerCreatorAuthenticationKey), "0x0", "Wrong offerCreatorAuthenticationKey returned")

        // Valid auction offer extra submission with authentication key

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        requestStartingTime = 1
        requestDuration = 5
        requestMinAuctionPrice = 10
        await contract.submitRequestArrayExtra(requestID, [requestStartingTime, requestDuration, requestMinAuctionPrice, 1], {from: requestCreator})
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        offerID = tx.logs[1].args.requestID.toNumber()
        let inputAuthenticationKey = "0xa5b9d60f32436310afebcfda832817a68921beb782fabf7915cc0460b443116a"
        tx = await contract.submitOfferArrayExtra(offerID, [requestStartingTime, requestDuration, 0, requestMinAuctionPrice, web3.utils.toBN(inputOfferCreatorDID), web3.utils.toBN(inputAuthenticationKey)], {from: offerCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 0, "Offer extra submission should succeed.")
        offerExtraDetails = await contract.getOfferExtra(offerID)
        txStatus = offerExtraDetails.status
        offerStartingTime = offerExtraDetails.startOfRentTime
        offerType = offerExtraDetails.offerType
        offerCreatorDID = offerExtraDetails.offerCreatorDID
        offerCreatorAuthenticationKey = offerExtraDetails.offerCreatorAuthenticationKey
        assert.equal(txStatus, 0, "getOfferExtra() should succeed.")
        assert.equal(offerStartingTime, requestStartingTime, "Wrong offerStartingTime returned.")
        assert.equal(offerType, 0, "Wrong offerType returned.")
        assert.equal(web3.utils.toHex(offerCreatorDID), inputOfferCreatorDID, "Wrong offerCreatorDID returned")
        assert.equal(web3.utils.toHex(offerCreatorAuthenticationKey), inputAuthenticationKey, "Wrong offerCreatorAuthenticationKey returned")
        
        // Valid instant rent offer extra submission with no authentication key

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 5, 0, 1, 1, 1], {from: requestCreator})           // Instant rent costs 1 token/minute
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        offerID = tx.logs[1].args.requestID.toNumber()
        tx = await contract.submitOfferArrayExtra(offerID, [1, 5, 1, 1, web3.utils.toBN(inputOfferCreatorDID)], {from: offerCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 0, "Offer extra submission should succeed.")
        let winningOfferIDs = tx.logs[4].args.winningOffersIDs.map(offerID => offerID.toNumber())
        assert.equal(winningOfferIDs.length, 1, "Number of winning offer IDs should be 1.")
        assert.equal(winningOfferIDs[0], offerID, "The ID of the winning should match the ID of the instant rent offer made.")
        let isRequestDecided = (await contract.isRequestDecided(requestID))[1]
        assert.isTrue(isRequestDecided, "Request should be decided after a valid instant rent offer has been submitted.")
        let requestDecision = await contract.getRequestDecision(requestID)
        winningOfferIDs = requestDecision.acceptedOfferIDs.map(offerID => offerID.toNumber())
        assert.equal(winningOfferIDs.length, 1, "Number of winning offer IDs should be 1.")
        assert.equal(winningOfferIDs[0], offerID, "The ID of the winning should match the ID of the instant rent offer made.")
        offerExtraDetails = await contract.getOfferExtra(offerID)
        txStatus = offerExtraDetails.status
        offerStartingTime = offerExtraDetails.startOfRentTime
        offerType = offerExtraDetails.offerType
        offerCreatorDID = offerExtraDetails.offerCreatorDID
        offerCreatorAuthenticationKey = offerExtraDetails.offerCreatorAuthenticationKey
        assert.equal(txStatus, 0, "getOfferExtra() should succeed.")
        assert.equal(offerStartingTime, requestStartingTime, "Wrong offerStartingTime returned.")
        assert.equal(offerType, 1, "Wrong offerType returned.")
        assert.equal(web3.utils.toHex(offerCreatorDID), inputOfferCreatorDID, "Wrong offerCreatorDID returned")
        assert.equal(web3.utils.toHex(offerCreatorAuthenticationKey), "0x0", "Wrong offerCreatorAuthenticationKey returned")

        // Valid instant rent offer extra submission with authentication key

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 5, 0, 1, 1, 1], {from: requestCreator})           // Instant rent costs 1 token/minute
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        offerID = tx.logs[1].args.requestID.toNumber()
        tx = await contract.submitOfferArrayExtra(offerID, [1, 5, 1, 1, web3.utils.toBN(inputOfferCreatorDID), web3.utils.toBN(inputAuthenticationKey)], {from: offerCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 0, "Offer extra submission should succeed.")
        winningOfferIDs = tx.logs[4].args.winningOffersIDs.map(offerID => offerID.toNumber())
        assert.equal(winningOfferIDs.length, 1, "Number of winning offer IDs should be 1.")
        assert.equal(winningOfferIDs[0], offerID, "The ID of the winning should match the ID of the instant rent offer made.")
        isRequestDecided = (await contract.isRequestDecided(requestID))[1]
        assert.isTrue(isRequestDecided, "Request should be decided after a valid instant rent offer has been submitted.")
        requestDecision = await contract.getRequestDecision(requestID)
        winningOfferIDs = requestDecision.acceptedOfferIDs.map(offerID => offerID.toNumber())
        assert.equal(winningOfferIDs.length, 1, "Number of winning offer IDs should be 1.")
        assert.equal(winningOfferIDs[0], offerID, "The ID of the winning should match the ID of the instant rent offer made.")
        offerExtraDetails = await contract.getOfferExtra(offerID)
        txStatus = offerExtraDetails.status
        offerStartingTime = offerExtraDetails.startOfRentTime
        offerType = offerExtraDetails.offerType
        offerCreatorDID = offerExtraDetails.offerCreatorDID
        offerCreatorAuthenticationKey = offerExtraDetails.offerCreatorAuthenticationKey
        assert.equal(txStatus, 0, "getOfferExtra() should succeed.")
        assert.equal(offerStartingTime, requestStartingTime, "Wrong offerStartingTime returned.")
        assert.equal(offerType, 1, "Wrong offerType returned.")
        assert.equal(web3.utils.toHex(offerCreatorDID), inputOfferCreatorDID, "Wrong offerCreatorDID returned")
        assert.equal(web3.utils.toHex(offerCreatorAuthenticationKey), inputAuthenticationKey, "Wrong offerCreatorAuthenticationKey returned")

        // Invalid request extra submission (array needs to be at least 5-element long)

        let invalidExtras = [
            [],
            [1],
            [1, 2],
            [1, 2, 3],
            [1, 2, 3, 4],
            [1, 2, 3, 4, 5, 6, 7]
        ]
        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 2000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        for (let invalidExtra of invalidExtras) {
            tx = await contract.submitOffer(requestID, {from: offerCreator})
            offerID = tx.logs[1].args.offerID.toNumber()
            tx = await contract.submitOfferArrayExtra(offerID, invalidExtra, {from: offerCreator})
            txStatusCode = tx.logs[0].args.status.toNumber()
            assert.equal(txStatusCode, 12, "Offer extra addition should failed because extra array is invalid.")
        }

        // Undefined offer ID

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 2000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        tx = await contract.submitOfferArrayExtra(99999, [1, 1, 0, 1, 1], {from: offerCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 2, "Offer extra submission should fail because offer specified does not exist.")

        // Not-pending offer

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 2000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        offerID = tx.logs[1].args.offerID.toNumber()
        await contract.submitOfferArrayExtra(offerID, [1, 1, 0, 1, 1], {from: offerCreator})           // Closing the request
        tx = await contract.submitOfferArrayExtra(offerID, [1, 1, 0, 1, 1], {from: offerCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 5, "Offer extra submission should fail because the request has alredy been opened (not pending anymore).")

        // Offer extra creator != offer creator

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 2000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        let offerExtraCreator = accounts[9]
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        offerID = tx.logs[1].args.offerID.toNumber()
        tx = await contract.submitOfferArrayExtra(offerID, [1, 1, 0, 1, 1], {from: offerExtraCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 1, "Offer extra submission should fail because the creator of the offer extra != offer creator.")

         // Not-open request

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 2000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 4, "Offer extra submission should fail because the request is still pending (not open yet).")

        // Offer start time < request start time

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 2000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        requestStartingTime = 1
        await contract.submitRequestArrayExtra(requestID, [requestStartingTime, 1, 1, 1], {from: requestCreator})
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        offerID = tx.logs[1].args.requestID.toNumber()
        tx = await contract.submitOfferArrayExtra(offerID, [requestStartingTime-1, 1, 0, 1, 1], {from: offerCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 102, "Offer extra submission should fail because the offer starts earlier than the request starting time.")

        // Offer end time > request end time

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 2000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        requestStartingTime = 1
        requestDuration = 5
        await contract.submitRequestArrayExtra(requestID, [requestStartingTime, requestDuration, 1, 1], {from: requestCreator})
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        offerID = tx.logs[1].args.offerID.toNumber()
        tx = await contract.submitOfferArrayExtra(offerID, [requestStartingTime, requestDuration+1, 0, 1, 1], {from: offerCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 102, "Offer extra submission should fail because the offer ends later than the request end time.")  

        // Auction offer price < min price asked in the request

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 2000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        let minAuctionPrice = 5
        await contract.submitRequestArrayExtra(requestID, [1, 1, minAuctionPrice, 1], {from: requestCreator})
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        offerID = tx.logs[1].args.offerID.toNumber()
        tx = await contract.submitOfferArrayExtra(offerID, [1, 1, 0, minAuctionPrice-1, 1], {from: offerCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 102, "Offer extra submission should fail because the offer ends later than the request end time.")

        // Instant rent offer for auction-only request

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 2000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})             // Extra array length == 4 -> No pricing rule is specified -> Instant rent not supported
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        offerID = tx.logs[1].args.offerID.toNumber()
        tx = await contract.submitOfferArrayExtra(offerID, [1, 1, 1, 1, 1], {from: offerCreator})           // Offer type == 1 -> instant rent offer
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 103, "Offer extra submission for instant rent should fail becase request only accepts auction requests.")

        // Instant rent prices tests

        let requestInstantRentRules = [
            [1, 50],
            [5, 50],
            [1, 50, 5, 40],
            [1, 50, 5, 40, 10, 40],
            [1, 50, 5, 40, 10, 30]
        ]

        let offerOfferedPrices = [
            [
                [[1, 49], [1, 50], [2, 50], [2, 49]],
                [102, 0, 0, 102]
            ],
            [
                [[4, 49], [4, 50], [5, 50], [5, 49]],
                [102, 0, 0, 102]
            ],
            [
                [[1, 49], [1, 50], [4, 50], [4, 49], [5, 40], [5, 39], [6, 40], [6, 39]],
                [102, 0, 0, 102, 0, 102, 0, 102]
            ],
            [
                [[9, 40], [9, 39], [10, 40], [10, 39], [11, 40], [11, 39]],
                [0, 102, 0, 102, 0, 102]
            ],
            [
                [[9, 40], [9, 39], [10, 30], [10, 29], [11, 30], [11, 29]],
                [0, 102, 0, 102, 0, 102]
            ]
        ]

        for (let i = 0; i < requestInstantRentRules.length; i++) {
            let requestInstantRules = requestInstantRentRules[i]
            let offerDetails = offerOfferedPrices[i][0]
            let expectedStatusCodes = offerOfferedPrices[i][1]

            for (let j = 0; j < offerDetails.length; j++) {
                let offerDuration = offerDetails[i][0]
                let offerPrice = offerDetails[i][1]
                let expectedStatusCode = expectedStatusCodes[i]

                requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
                tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 2000000000, {from: requestCreator})
                requestID = tx.logs[1].args.requestID.toNumber()
                await contract.submitRequestArrayExtra(requestID, [1, 100, 1].concat(requestInstantRules).concat(1), {from: requestCreator})
                tx = await contract.submitOffer(requestID, {from: offerCreator})
                offerID = tx.logs[1].args.offerID.toNumber()
                tx = await contract.submitOfferArrayExtra(offerID, [1, offerDuration, 1, offerPrice, 1], {from: offerCreator})      // OfferType = 1 -> Instant rent offer
                txStatusCode = tx.logs[0].args.status.toNumber()
                assert.equal(txStatusCode, expectedStatusCode, "Offer extra submission returned a wrong status code.")
            }
        }
    })

    it("interledgerReceive()", async () => {
        let owner = accounts[0]
        let requestCreator = accounts[1]
        let offerCreator = accounts[2]
        let contract = await SMAUGMarketPlace.new({from: owner})

        // Valid flow

        let requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        let tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000000, {from: requestCreator})
        let requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        tx = await contract.submitOffer(requestID, {from: offerCreator})
        let offerID = tx.logs[1].args.requestID.toNumber()
        tx = await contract.submitOfferArrayExtra(offerID, [1, 1, 0, 1, 1], {from: offerCreator})
        await contract.decideRequest(requestID, [offerID], {from: requestCreator})
        let givenNonce = 1
        let givenOfferID = "0x" + `${offerID}`.padStart(64, "0")
        tx = await contract.interledgerReceive(givenNonce, givenOfferID, {from: owner})
        let eventGeneratedNonce = tx.logs[0].args.nonce
        assert.equal(givenNonce, eventGeneratedNonce, "Nonce given in interledgerReceive() should be = to the one in the event generated.")

        // IL function called by someone that is not a manager

        const unauthorisedAddress = accounts[4]

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        await contract.submitOffer(requestID, {from: offerCreator})
        offerID = tx.logs[1].args.requestID.toNumber()
        tx = await contract.submitOfferArrayExtra(offerID, [1, 1, 0, 1, 1], {from: offerCreator})
        await contract.decideRequest(requestID, [offerID], {from: requestCreator})
        givenNonce = 1
        givenOfferID = "0x" + `${offerID}`.padStart(64, "0")
        tx = await contract.interledgerReceive(givenNonce, givenOfferID, {from: unauthorisedAddress})
        let txStatusCode = tx.logs[0].args.status
        let generatedEventType = tx.logs[1].event
        eventGeneratedNonce = tx.logs[1].args.nonce
        assert.equal(txStatusCode, 1, "interledgerReceive() should fail and emit AccessDenied status code.")
        assert.equal(generatedEventType, "InterledgerEventRejected", "interledgerReceive() should fail because caller unauthorised.")
        assert.equal(givenNonce, eventGeneratedNonce, "Nonce given in interledgerReceive() should be = to the one in the event generated.")

        // Offer not defined

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        await contract.submitOffer(requestID, {from: offerCreator})
        offerID = tx.logs[1].args.requestID.toNumber()
        tx = await contract.submitOfferArrayExtra(offerID, [1, 1, 0, 1, 1], {from: offerCreator})
        await contract.decideRequest(requestID, [offerID], {from: requestCreator})
        givenNonce = 1
        givenOfferID = "0x" + "999".padStart(64, "0")
        tx = await contract.interledgerReceive(givenNonce, givenOfferID, {from: owner})
        txStatusCode = tx.logs[0].args.status
        generatedEventType = tx.logs[1].event
        eventGeneratedNonce = tx.logs[1].args.nonce
        assert.equal(txStatusCode, 2, "interledgerReceive() should fail and emit UndefinedID status code.")
        assert.equal(generatedEventType, "InterledgerEventRejected", "interledgerReceive() should fail because offer specified is not defined.")
        assert.equal(givenNonce, eventGeneratedNonce, "Nonce given in interledgerReceive() should be = to the one in the event generated.")

        // Request not decided

        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 1000000000000, {from: requestCreator})
        requestID = tx.logs[1].args.requestID.toNumber()
        await contract.submitRequestArrayExtra(requestID, [1, 1, 1, 1], {from: requestCreator})
        await contract.submitOffer(requestID, {from: offerCreator})
        offerID = tx.logs[1].args.requestID.toNumber()
        tx = await contract.submitOfferArrayExtra(offerID, [1, 1, 0, 1, 1], {from: offerCreator})
        givenNonce = 1
        givenOfferID = "0x" + `${offerID}`.padStart(64, "0")
        tx = await contract.interledgerReceive(givenNonce, givenOfferID, {from: owner})
        txStatusCode = tx.logs[0].args.status
        generatedEventType = tx.logs[1].event
        eventGeneratedNonce = tx.logs[1].args.nonce
        assert.equal(txStatusCode, 6, "interledgerReceive() should fail and emit ReqNotDecided status code.")
        assert.equal(generatedEventType, "InterledgerEventRejected", "interledgerReceive() should fail because offer specified is not defined.")
        assert.equal(givenNonce, eventGeneratedNonce, "Nonce given in interledgerReceive() should be = to the one in the event generated.")
    })
})