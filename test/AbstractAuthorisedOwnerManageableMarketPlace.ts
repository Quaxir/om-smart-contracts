import { generateFunctionSignedTokenWithAccount } from "./utils"
import * as path from "path"

contract("AbstractAuthorisedOwnerManageableMarketPlace", async accounts => {

    const Web3 = require("web3")
    const SMAUGMarketPlace = artifacts.require("SMAUGMarketPlace")
    const SMAUGSmartContractJSONInterfacePath = path.resolve(__dirname, "..", "build", "contracts", "SMAUGMarketPlace.json")
    const submitRequestMethodName = "submitRequest"

    it("AuthorisedManageableMarketPlace interface conformance", async () => {
        let contract = await SMAUGMarketPlace.deployed()
        let interfaceFunctions = [
            "submitRequest(bytes32,bytes,bytes32,uint256)",     //If using AccessToken struct -> submitRequest((bytes32,bytes,bytes32),uint256)
            "closeRequest(uint256)",
            "decideRequest(uint256,uint256[])",
            "deleteRequest(uint256)"
        ]

        let interfaceID = interfaceFunctions.map(web3.eth.abi.encodeFunctionSignature).map((x) => parseInt(x as string, 16)).reduce((x, y) => x ^ y)
        interfaceID = interfaceID > 0 ? interfaceID : 0xFFFFFFFF + interfaceID + 1
        let interfaceIDString = "0x" + interfaceID.toString(16)
        let isContractCompliantToInterface = await contract.supportsInterface(web3.utils.hexToBytes(interfaceIDString))
        assert.equal(isContractCompliantToInterface, true, "Contract should support the AuthorisedManageableMarketPlace interface.")
    })

    it("getMarketInformation", async () => {
        let owner = accounts[0]
        let contract = await SMAUGMarketPlace.new({from: owner})

        let ownerAddress = await contract.getMarketInformation().ownerAddress as string
        assert.equal(ownerAddress, ownerAddress, "Wrong marketplace info returned.")
    })
    
    it("resetAccessTokens", async () => {

        let owner = accounts[0]
        let requestCreator = accounts[1]
        let contract = await SMAUGMarketPlace.new({from: owner})

        // Trying to call the method from someone different than the managers

        let tx = await contract.resetAccessTokens({from: requestCreator})
        let txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 1, "Operation should fail becase token is not signed by a smart contract manager.")

        // Valid token generation and usage

        let requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 10, {from: requestCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 0, "Request submission should succeed.")
        
        // Trying again with same token

        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 10, {from: requestCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 101, "Request submission should fail because access token is re-used.")

        // Cleaning tokens

        tx = await contract.resetAccessTokens()
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 0, "Token storage cleaning should succeed.")

        // Re-trying with the previously used (and then cleaned) token

        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 10, {from: requestCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 0, "Request submission should succeed because token storage has been cleaned.")
    })

    it("submitRequest & isRequestDefined (AbstractMarketPlace) & getRequest (AbstractMarketPlace)", async () => {
        let owner = accounts[0]
        let requestCreator = accounts[1]
        let contract = await SMAUGMarketPlace.new({from: owner})
        let givenRequestDeadline = 10
    
        // Valid request creation (with valid access token)

        let requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        let tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, givenRequestDeadline, {from: requestCreator})
        let txStatusCode = tx.logs[0].args.status.toNumber()
        let requestID = tx.logs[1].args.requestID.toNumber()
        assert.equal(txStatusCode, 0, "Request submission should succeed.")
        let isRequestDefined = (await contract.isRequestDefined(requestID))[1]
        assert.equal(isRequestDefined, true, "Request should be defined.")
        let requestDetails = await contract.getRequest(requestID)
        txStatusCode = requestDetails.status
        let requestDeadline = requestDetails.deadline
        let requestState = requestDetails.stage
        let requestMaker = requestDetails.requestMaker
        assert.equal(txStatusCode, 0, "getRequest() should succeed.")
        assert.equal(requestDeadline, givenRequestDeadline, "Wrong deadline returned.")
        assert.equal(requestState, 0, "Wrong state returned.")
        assert.equal(requestMaker, requestCreator, "Wrong creator returned.")
        
        // Trying again with same token

        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 10, {from: requestCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 101, "Request submission should fail because access token is re-used.")

        // Invalid token for a different method

        let alternativeFunctionName = "submitOffer"
        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, alternativeFunctionName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 10, {from: requestCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 1, "Request submission should fail because access token is issued for a different method.")

        // Invalid token for a different user

        let alternativeRequestCreatorAddress = accounts[2]
        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 10, {from: alternativeRequestCreatorAddress})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 1, "Request submission should fail because access token is issued to a different user.")

        // Invalid token for a different contract address

        let alternativeContractAddress = accounts[3]
        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, alternativeContractAddress, web3, owner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 10, {from: requestCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 1, "Request submission should fail because access token is issued for a different contract address.")

        // Invalid token from a different signer than a contract manager

        let alternativeSigner = accounts[4]
        requestCreationAccessToken = await generateFunctionSignedTokenWithAccount(SMAUGSmartContractJSONInterfacePath, submitRequestMethodName, requestCreator, contract.address, web3, alternativeSigner)
        tx = await contract.submitRequest(requestCreationAccessToken.messageHash, requestCreationAccessToken.signature, requestCreationAccessToken.nonce, 10, {from: requestCreator})
        txStatusCode = tx.logs[0].args.status.toNumber()
        assert.equal(txStatusCode, 1, "Request submission should fail because access token has not been issued by a manager of the contract.")
    })
})