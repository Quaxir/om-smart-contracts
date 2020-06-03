import Web3 from "web3"
import { AbiItem } from "web3-utils"
import fs from "fs"

import { SmaugMarketPlace as SMAUGMarketplace } from "../types/web3-v1-contracts/SMAUGMarketPlace"

import * as utils from "./utils"
import yargs from "yargs"
import inquirer, { QuestionCollection } from "inquirer"
import { EventEmitter } from "events"

main().catch(error => {
    console.error(error)
    process.exit(1)
}).then(  () => {
    console.log("Bye!")
    process.exit(0)
})

var web3MarketplaceInstance: Web3
var marketplaceOwner: string
var SMAUGMarketplaceInstance: SMAUGMarketplace

async function main() {
    const options = yargs
                        .usage("Usage: -c <marketplace_contract_address> -a <marketplace_contract_ABI> -n <Ethereum_Network_address> -o <marketplace_contract_owner_address>")
                        .option("c", {alias: "marketplace-address", describe: "The address of the marketplace to interact with.", type: "string", demandOption: true})
                        .option("a", {alias: "marketplace-abi-path", describe: "The path to the ABI of the marketplace to interact with.", type: "string", demandOption: true})
                        .option("n", {alias: "ethereum-address", describe: "The address of the marketplace Ethereum instance.", type: "string", demandOption: true})
                        .option("o", {alias: "marketplace-owner", describe: "The address of the owner of the marketplace smart contract.", type: "string", demandOption: true})
                        .argv

    console.log(`Connecting to ${options.n}...`)
    web3MarketplaceInstance = new Web3(options.n)
    console.log(`Retrieving contract at ${options.c}...`)
    let availableAccounts = await web3MarketplaceInstance.eth.getAccounts()
    console.log("Available accounts:")
    console.log(availableAccounts)
    SMAUGMarketplaceInstance = (new web3MarketplaceInstance.eth.Contract(JSON.parse(fs.readFileSync(options.a).toString()), options.c) as any) as SMAUGMarketplace

    if(!Web3.utils.isAddress(options.o)) {
        throw Error("Owner address is not a valid address format.")
    }
    marketplaceOwner = options.o

    await handleUserInput()
}

async function handleUserInput(): Promise<void> {
    while (true) {
        let answers = await inquirer.prompt([
            {
                type: "list",
                name: "choice", message: "What would you like to do?",
                choices: [
                    {
                        name: "1) Create auction-only request",
                        value: "createRequest"
                    },
                    {
                        name: "2) Create offer",
                        value: "createOffer"
                    },
                    {
                        name: "3) Decide request",
                        value: "decideRequest"
                    },
                    {
                        name: "4) Automatically create and decide request",
                        value: "automaticLifeCycle"
                    },
                    {
                        name: "5) Exit",
                        value: "exit"
                    }
                ]
            }
        ])

        switch (answers.choice) {
            case "createRequest": {
                await handleRequestCreation(); break;
            }
            case "createOffer": {
                await handleOfferCreation(); break;
            }
            case "decideRequest": {
                await handleRequestDecision(); break;
            }
            case "automaticLifeCycle": {
                await createAndDecideTestRequest(); break;
            }
            case "exit": { return }
        }
    }
}

async function handleRequestCreation(): Promise<void> {
    const requestDetails = await inquirer.prompt(getRequestCreationQuestions())
    console.log("Creating request...")

    // Create valid access token for request creation
    let requestCreationToken = await utils.generateFunctionSignedTokenWithAccount(SMAUGMarketplaceInstance.options.jsonInterface, "submitRequest", requestDetails.creatorAccount, SMAUGMarketplaceInstance.options.address, web3MarketplaceInstance, marketplaceOwner)

    // Create request
    let newRequestTransactionResult = await SMAUGMarketplaceInstance.methods.submitRequest(requestCreationToken.tokenDigest, requestCreationToken.signature, requestCreationToken.nonce,requestDetails.requestDeadline).send({from: requestDetails.creatorAccount, gas: 200000})
    let txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        console.error(`Request creation failed with status ${txStatus}`)
        return
    }
    let requestID = (newRequestTransactionResult.events!.RequestAdded.returnValues.requestID) as number
    
    // Create request extra
    let requestExtra = [requestDetails.requestStartingTime, requestDetails.requestDuration, requestDetails.minAuctionPrice, requestDetails.lockerID]
    let newRequestExtraTransactionResult = await SMAUGMarketplaceInstance.methods.submitRequestArrayExtra(requestID, requestExtra).send({from: requestDetails.creatorAccount, gas: 200000})
    txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        console.error(`Request creation failed with status ${txStatus}`)
        return
    }
    console.log(`Request created with ID ${requestID}! 🙂🙂🙂`)
}

// Expected answers from these questions are {requestDeadline: string, requestStartingTime: string, requestDuration: string, minAuctionPrice: string, lockerID: string, creatorAccount: string}
function getRequestCreationQuestions(): inquirer.QuestionCollection {
    return [
        {
            type: "input",
            name: "requestDeadline",
            message: "Request deadline",
            validate: (input) => {
                try {
                    if (Web3.utils.toBN(input) > Web3.utils.toBN(0)) {
                        return true
                    }
                    return "Value must be > 0."
                } catch {
                    return "Value is not a number."
                }
            }
        },
        {
            type: "input",
            name: "requestStartingTime",
            message: "Request starting time",
            validate: (input) => {
                try {
                    if (Web3.utils.toBN(input) > Web3.utils.toBN(0)) {
                        return true
                    }
                    return "Value must be > 0."
                } catch {
                    return "Value is not a number."
                }
            }            
        },
        {
            type: "input",
            name: "requestDuration",
            message: "Request duration",
            validate: (input) => {
                try {
                    if (Web3.utils.toBN(input) > Web3.utils.toBN(0)) {
                        return true
                    }
                    return "Value must be > 0."
                } catch {
                    return "Value is not a number."
                }
            }            
        },
        {
            type: "input",
            name: "minAuctionPrice",
            message: "Minimum price/minute for auction",
            validate: (input) => {
                try {
                    if (Web3.utils.toBN(input) > Web3.utils.toBN(0)) {
                        return true
                    }
                    return "Value must be > 0."
                } catch {
                    return "Value is not a number."
                }
            }            
        },
        {
            type: "input",
            name: "lockerID",
            message: "Locker ID",
            validate: (input) => {
                try {
                    if (Web3.utils.toBN(input) > Web3.utils.toBN(0)) {
                        return true
                    }
                    return "Value must be > 0."
                } catch {
                    return "Value is not a number."
                }
            }            
        },
        {
            type: "input",
            name: "creatorAccount",
            message: "Request creator account",
            validate: (input) => {
                if (Web3.utils.isAddress(input)) {
                    return true
                }
                return "Value is not a valid address."
            }
        }
    ] as inquirer.QuestionCollection
}

// Automatically creates an auction offer (no instant-rent offer for the demo purposes)
async function handleOfferCreation(): Promise<void> {
    const offerDetails = await inquirer.prompt(getOfferCreationQuestions())
    console.log("Creating offer...")

    // Create offer
    let newOfferTransactionResult = await SMAUGMarketplaceInstance.methods.submitOffer(offerDetails.requestID).send({from: offerDetails.creatorAccount, gas: 200000})
    let txStatus = (newOfferTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        console.error(`Offer creation failed with status ${txStatus}`)
        return
    }
    let offerID = (newOfferTransactionResult.events!.OfferAdded.returnValues.offerID) as number
    
    // Create offer extra
    let offerType = 0           // Offer is an auction one (no instant rent)
    let offerExtra = [offerDetails.offerStartingTime, offerDetails.offerDuration, offerType, offerDetails.pricePerMinute, Web3.utils.toHex(offerDetails.creatorDID), Web3.utils.toHex(offerDetails.creatorAuthKey)]
    let newOfferExtraTransactionResult = await SMAUGMarketplaceInstance.methods.submitOfferArrayExtra(offerID, offerExtra).send({from: offerDetails.creatorAccount, gas: 200000})
    txStatus = (newOfferExtraTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        console.error(`Offer creation failed with status ${txStatus}`)
        return
    }
    console.log(`Offer created with ID ${offerID}! 💰💰💰`)
}

// Expected answers from these questions are {requestID: string, offerStartingTime: string, offerDuration: string, pricePerMinute: string, creatorDID: string, creatorAuthKey: string, creatorAccount: string}
function getOfferCreationQuestions(): inquirer.QuestionCollection {
    return [
        {
            type: "input",
            name: "requestID",
            message: "Request ID",
            validate: (input) => {
                try {
                    if (Web3.utils.toBN(input) > Web3.utils.toBN(0)) {
                        return true
                    }
                    return "Value must be > 0."
                } catch {
                    return "Value is not a number."
                }
            }
        },
        {
            type: "input",
            name: "offerStartingTime",
            message: "Offer starting time",
            validate: (input) => {
                try {
                    if (Web3.utils.toBN(input) > Web3.utils.toBN(0)) {
                        return true
                    }
                    return "Value must be > 0."
                } catch {
                    return "Value is not a number."
                }
            }            
        },
        {
            type: "input",
            name: "offerDuration",
            message: "Offer duration",
            validate: (input) => {
                try {
                    if (Web3.utils.toBN(input) > Web3.utils.toBN(0)) {
                        return true
                    }
                    return "Value must be > 0."
                } catch {
                    return "Value is not a number."
                }
            }            
        },
        {
            type: "input",
            name: "pricePerMinute",
            message: "Price/minute willing to pay",
            validate: (input) => {
                try {
                    if (Web3.utils.toBN(input) > Web3.utils.toBN(0)) {
                        return true
                    }
                    return "Value must be > 0."
                } catch {
                    return "Value is not a number."
                }
            }            
        },
        {
            type: "string",
            name: "creatorDID",
            message: "Offer creator DID",
            validate: (input) => {
                if (!Web3.utils.isHex(input)) {
                    return true
                }
                return "Value must be a UTF-8 string, not HEX."
            }
        },
        {
            type: "input",
            name: "creatorAuthKey",
            message: "Offer creator authentication key",
            validate: (input) => {
                if (!Web3.utils.isHex(input)) {
                    return true
                }
                return "Value must be a UTF-8 string, not HEX."
            }
        },
        {
            type: "input",
            name: "creatorAccount",
            message: "Offer creator account",
            validate: (input) => {
                if (Web3.utils.isAddress(input)) {
                    return true
                }
                return "Value is not a valid address."
            }
        }
    ] as inquirer.QuestionCollection
}

async function handleRequestDecision(): Promise<void> {
    const decisionDetails = await inquirer.prompt(getRequestDecisionQuestions())
    console.log("Deciding offer...")

    let requestDetails = await SMAUGMarketplaceInstance.methods.getRequest(decisionDetails.requestID).call()
    let requestCreator = requestDetails.requestMaker
    if (Web3.utils.toBN(requestCreator).eq(Web3.utils.toBN(0))) {
        console.error("The given request ID does not match any existing request.")
        return
    }
    let parsedOfferIDs = String(decisionDetails.offerIDs).split(",").map(string => string.trim())   // Splits by comma and remove any leading and trailing space from each value

    let requestDecisionTransactionResults = await SMAUGMarketplaceInstance.methods.decideRequest(decisionDetails.requestID, parsedOfferIDs).send({from: requestCreator, gas: 200000})
    if (requestDecisionTransactionResults.events!.RequestDecided == undefined) {
        console.error("Request decision failed.")
        return
    }
    console.log("Request decision process succesfully completed! 💵💵💵")
    // let txStatus = (requestDecisionTransactionResults.events!.FunctionStatus.returnValues.status) as number
    // if (txStatus != 0) {
    //     console.error(`Request decision failed with status ${txStatus}`)
    //     return
    // }

    let promises = parsedOfferIDs.map(offerID => listenForOfferFulfillment(parseInt(offerID)))

    await Promise.all(promises)
}

async function listenForOfferFulfillment(offerID: number): Promise<void> {
    await SMAUGMarketplaceInstance.once("OfferFulfilled", {filter: {offerID: offerID}}, (error, offerInfo) => {
        if (error != null) {
            console.error(`Error while listening for OfferFulfilled events: ${error.message}`)
            return
        }

        let offerID = offerInfo.returnValues.offerID
        let encryptedToken = web3MarketplaceInstance.eth.abi.decodeParameter("string", offerInfo.returnValues.token)
        console.log(`New offer fulfilled! OfferID = ${offerID}, token = ${encryptedToken}`)
    })
}

// Expected answers from these questions are {requestID: string, offerIDs: string}
function getRequestDecisionQuestions(): inquirer.QuestionCollection {
    return [
        {
            type: "input",
            name: "requestID",
            message: "Request ID",
            validate: (input) => {
                try {
                    if (Web3.utils.toBN(input) > Web3.utils.toBN(0)) {
                        return true
                    }
                    return "Value must be > 0."
                } catch {
                    return "Value is not a number."
                }
            }
        },
        {
            type: "input",
            name: "offerIDs",
            message: "Offer IDs. Enter the IDs separated by a comma, e.g. 1, 4, 9, 15",
            validate: (input) => {
                let regexResult = String(input).search(/^\d+?(?:\s*?\,\s*?\d+)*?$/m)    // Matches sequences of comma-separated numbers with any number of whitespaces around each comma
                if (regexResult == -1) {
                    return "Values not in the expected format."
                } else {
                    return true
                }
            }            
        }
    ] as inquirer.QuestionCollection
}

async function createAndDecideTestRequest() {
    // Assuming a ganache test network with unlocked accuonts is used
    let availableAccounts = await web3MarketplaceInstance.eth.getAccounts()
    let marketplaceOwner = availableAccounts[0]
    let requestCreator = availableAccounts[1]
    let offererCreator = availableAccounts[2]
    let requestCreationToken = await utils.generateFunctionSignedTokenWithAccount(SMAUGMarketplaceInstance.options.jsonInterface, "submitRequest", requestCreator, SMAUGMarketplaceInstance.options.address, web3MarketplaceInstance, marketplaceOwner)
    
    let defaultExtra = [1, 100, 1, 1]           // [start time, duration, min auction price, locker key]
    console.log(`Creating new request with extra [${defaultExtra}]...`)
    let newRequestTransactionResult = await SMAUGMarketplaceInstance.methods.submitRequest(requestCreationToken.tokenDigest, requestCreationToken.signature, requestCreationToken.nonce, 10000000000).send({from: requestCreator, gas: 200000})
    let txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        console.error(`submitRequest failed with status ${txStatus}`)
        return
    }
    let requestID = (newRequestTransactionResult.events!.RequestAdded.returnValues.requestID) as number
    let newRequestExtraTransactionResult = await SMAUGMarketplaceInstance.methods.submitRequestArrayExtra(requestID, defaultExtra).send({from: requestCreator, gas: 200000})
    txStatus = (newRequestExtraTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        console.error(`submitRequest failed with status ${txStatus}`)
        return
    }
    console.log(`New request with extra [${defaultExtra}] and ID ${requestID} created! 🙂🙂🙂`)
    
    let offer1Extra = [1, 5, 0, 5, web3MarketplaceInstance.utils.toHex("DID1")]
    console.log(`Creating test offer 1 with extra [${offer1Extra}]...`)
    let offer1TransactionResult = await SMAUGMarketplaceInstance.methods.submitOffer(requestID).send({from: offererCreator, gas: 200000})
    txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        console.error(`submitOffer failed with status ${txStatus}`)
        return
    }
    let offer1ID = offer1TransactionResult.events!.OfferAdded.returnValues.offerID as number
    let offer1ExtraTransactionResult = await SMAUGMarketplaceInstance.methods.submitOfferArrayExtra(offer1ID, offer1Extra).send({from: offererCreator, gas: 200000})
    txStatus = (offer1ExtraTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        console.error(`submitOfferArrayExtra failed with status ${txStatus}`)
        return
    }
    console.log(`New offer with extra [${defaultExtra}] and ID ${offer1ID} created! 💰💰💰`)

    // let offer2Extra = [1, 5, 0, 5, web3MarketplaceInstance.utils.toHex("DID2"), web3MarketplaceInstance.utils.toHex("AuthKey2")]
    // console.log(`Creating test offer 2 with extra [${offer1Extra}]...`)
    // let offer2TransactionResult = await SMAUGMarketplaceInstance.methods.submitOffer(requestID).send({from: offererCreator, gas: 200000})
    // txStatus = (offer2TransactionResult.events!.FunctionStatus.returnValues.status) as number
    // if (txStatus != 0) {
    //     console.error(`submitOffer failed with status ${txStatus}`)
    //     return
    // }
    // let offer2ID = offer2TransactionResult.events!.OfferAdded.returnValues.offerID as number
    // let offer2ExtraTransactionResult = await SMAUGMarketplaceInstance.methods.submitOfferArrayExtra(offer2ID, offer2Extra).send({from: offererCreator, gas: 200000})
    // txStatus = (offer2ExtraTransactionResult.events!.FunctionStatus.returnValues.status) as number
    // if (txStatus != 0) {
    //     console.error(`submitOfferArrayExtra failed with status ${txStatus}`)
    //     return
    // }
    // console.log(`New offer with extra [${defaultExtra}] and ID ${offer2ID} created! 💰💰💰`)

    console.log(`Closing and deciding request ${requestID} by selecting ${[offer1ID]} as winning offers...`)
    let requestDecisionTransactionResults = await SMAUGMarketplaceInstance.methods.decideRequest(requestID, [offer1ID]).send({from: requestCreator, gas: 200000})
    if (requestDecisionTransactionResults.events!.RequestDecided == undefined) {
        console.error("Request decision failed.")
        return
    }
    console.log("Request decision process succesfully completed! 💵💵💵")

    await listenForOfferFulfillment(offer1ID)
}