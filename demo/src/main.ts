import Web3 from "web3"
import fs from "fs"

import { SmaugMarketPlace as SMAUGMarketplace, OfferFulfilled, OfferClaimable } from "../types/web3-v1-contracts/SMAUGMarketPlace"

import * as utils from "./utils"
import yargs from "yargs"
import inquirer, { QuestionCollection } from "inquirer"
import { EventEmitter } from "events"
import { URL } from "url"
import fetch from "node-fetch"
import { request } from "http"
import appendQuery from "append-query"
import urljoin from "url-join"
import { util } from "chai"
import EthCrypto from "eth-crypto"

main().catch(error => {
    console.error(error)
    process.exit(1)
}).then(() => {
    console.log("Bye!")
    process.exit(0)
})

var web3MarketplaceInstance: Web3
var SMAUGMarketplaceInstance: SMAUGMarketplace
var backendURL: URL

var openRequests: Set<number>
var pendingOffers: Set<number>
var unseenOfferFulfilledEvents: OfferFulfilled[]
var unseenOfferUnFulfilledEvents: OfferClaimable[]

async function main() {
    const options = yargs
                        .usage("Usage: -c <marketplace_contract_address> -b <marketplace_backend_url> -a <marketplace_contract_ABI> -n <Ethereum_Network_address> -o <marketplace_contract_owner_address>")
                        .option("c", {alias: "marketplace-address", describe: "The address of the marketplace to interact with.", type: "string", demandOption: true})
                        .option("a", {alias: "marketplace-abi-path", describe: "The path to the ABI of the marketplace to interact with.", type: "string", demandOption: true})
                        .option("b", {alias: "backend-url", describe: "The URL of the marketplace backend.", type: "string", demandOption: true})
                        .option("n", {alias: "ethereum-address", describe: "The address of the marketplace Ethereum instance.", type: "string", demandOption: true})
                        .argv

    try {
        backendURL = new URL(options.b)
    } catch {
        throw Error("Marketplace URL is not a valid URL.")
    }

    web3MarketplaceInstance = new Web3(options.n)
    SMAUGMarketplaceInstance = (new web3MarketplaceInstance.eth.Contract(JSON.parse(fs.readFileSync(options.a).toString()), options.c) as any) as SMAUGMarketplace

    printArgumentsDetails(options)

    openRequests = new Set()
    pendingOffers = new Set()
    unseenOfferFulfilledEvents = []
    unseenOfferUnFulfilledEvents = []

    configureEventListener(false)
    await handleUserInput()
}

function printArgumentsDetails(options: any) {
    console.log(`Arguments used:\n
        - MARKETPLACE ETHEREUM NETWORK ADDRESS: ${options.n}\n
        - MARKETPLACE SMART CONTRACT ADDRESS: ${options.c}\n
        - MARKETPLACE BACKEND ADDRESS: ${options.b}
    `)
}

function configureEventListener(debug: boolean = false) {
    if (debug) {
        console.log("Configuring event listener...")
    }
    SMAUGMarketplaceInstance.events.allEvents({}, (error, event) => {
        if (debug) {
            console.log(event)
            console.log(pendingOffers)
        }
        if (event.event == "OfferFulfilled") {
            let castedEvent = event as OfferFulfilled
            let offerID = parseInt(castedEvent.returnValues.offerID)
            if (pendingOffers.has(offerID)) {
                unseenOfferFulfilledEvents.push(castedEvent)
                pendingOffers.delete(offerID)
            }
        } else if (event.event == "OfferClaimable") {
            let castedEvent = event as OfferClaimable
            let offerID = parseInt(castedEvent.returnValues.offerID)
            if (pendingOffers.has(offerID)) {
                unseenOfferUnFulfilledEvents.push(castedEvent)
                pendingOffers.delete(offerID)
            }
        }
    })
    if (debug) {
        console.log("Event listener configured.")
    }
}

async function handleUserInput(): Promise<void> {
    while (true) {
        let answers = await inquirer.prompt([
            {
                type: "list",
                name: "choice", message: "What would you like to do?",
                choices: [
                    {
                        name: "1) List accounts and balances",
                        value: "listAccountBalances"
                    },
                    {
                        name: "2) Create instant-rent request",
                        value: "createRequest"
                    },
                    {
                        name: "3) Create instant-rent offer",
                        value: "createOffer"
                    },
                    {
                        name: "4) Decide request",
                        value: "decideRequest"
                    },
                    {
                        name: "5) Automatically create and decide request",
                        value: "automaticLifeCycle"
                    },
                    {
                        name: "6) Check for new acess tokens issued",
                        value: "checkForOffersEvents"
                    },
                    {
                        name: "7) Exit",
                        value: "exit"
                    }
                ]
            }
        ])

        switch (answers.choice) {
            case "listAccountBalances":
                await printAccountsAndBalances(web3MarketplaceInstance); break;
            case "createRequest": {
                await handleRequestCreation(); break;
            }
            case "createOffer": {
                await handleOfferCreation(); break;
            }
            case "decideRequest": {
                await handleRequestDecision(); break;
            }
            // case "automaticLifeCycle": {
            //     await createAndDecideTestRequest(); break;
            // }
            case "checkForOffersEvents": {
                printNewOffersFulfilled(true)
                printNewOffersUnfulfilled(true)
                break
            }
            case "exit": { return }
        }
    }
}

async function printAccountsAndBalances(web3Instance: Web3) {
    let accounts = await web3MarketplaceInstance.eth.getAccounts()
    let balances = await Promise.all(accounts.map(async (account) => {
        return await web3MarketplaceInstance.eth.getBalance(account)
    }))

    let output = accounts.map((account, index) => {
        return `${account} - ${balances[index]} wei`
    })

    console.log(output)
}

async function handleRequestCreation(): Promise<void> {
    const requestDetails = await inquirer.prompt(getRequestCreationQuestions())
    console.log(`Creating request using Ethereum address: ${requestDetails.creatorAccount}...`)

    let backendEndpoint = urljoin(backendURL.toString(), "api", "marketplace", "gettoken")
    backendEndpoint = appendQuery(backendEndpoint, {ethereum_address: requestDetails.creatorAccount})
    console.log(`Requesting new access token from marketplace backend at ${backendEndpoint}...`)

    let requestCreationTokenResponse = await fetch(backendEndpoint)
    let requestCreationToken = await requestCreationTokenResponse.json() as utils.MarketplaceAccessToken
    console.log("Request token obtained from backend:")
    // Hard-coded values, but it works
    console.log(requestCreationToken)
    console.log()
    console.log("Token content decoded:")
    console.log(getTokenDetails(requestCreationToken.encoded))

    await utils.waitForEnter()
    
    // Create request
    const deadlineInMilliseconds = new Date(requestDetails.requestDeadline).getTime() / 1000
    const durationInMinutes = requestDetails.requestDuration * 60
    console.log(`Creating request for ${requestDetails.creatorAccount} with deadline: ${requestDetails.requestDeadline} (${deadlineInMilliseconds} s in UNIX epoch)...`)

    let newRequestTransactionResult = await SMAUGMarketplaceInstance.methods.submitRequest(requestCreationToken.digest, requestCreationToken.signature, requestCreationToken.nonce, deadlineInMilliseconds).send({from: requestDetails.creatorAccount, gas: 200000})

    let txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        console.error(`Request creation failed with status ${txStatus}`)
        return
    }
    let requestID = (newRequestTransactionResult.events!.RequestAdded.returnValues.requestID) as number
    console.log(`New request created with ID ${requestID}.`)

    await utils.waitForEnter()
    
    // Create request extra
    const startTimeInMilliseconds = new Date(requestDetails.requestStartingTime).getTime() / 1000

    let requestExtra = [startTimeInMilliseconds, durationInMinutes, requestDetails.minAuctionPrice]
    let instantRulesFormatted = getFormattedInstantRules(requestDetails.instantRules)
    requestExtra = requestExtra.concat(instantRulesFormatted)
    requestExtra.push(requestDetails.lockerID)

    console.log(`Adding request extra to request with ID ${requestID}...`)
    console.log("Request extra:")
    console.log(requestExtra)

    let newRequestExtraTransactionResult = await SMAUGMarketplaceInstance.methods.submitRequestArrayExtra(requestID, requestExtra).send({from: requestDetails.creatorAccount, gas: 1000000})

    txStatus = (newRequestExtraTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        console.error(`Request extra submission failed with status ${txStatus}`)
        return
    }

    openRequests.add(requestID)
    console.log("Request creation complete!")

    await utils.waitForEnter()
}

// Expected answers from these questions are {requestDeadline: datetime, requestStartingTime: datetime, requestDuration: string, minAuctionPrice: string, lockerID: string, creatorAccount: string}
function getRequestCreationQuestions(): inquirer.QuestionCollection {
    return [
        {
            type: "string",
            name: "requestDeadline",
            message: "Request deadline",
            validate: (input) => {
                let datetime = new Date(input).getTime()
                if (isNaN(datetime)) {
                    return "Not a valid date."
                }
                let secondsSinceEpoch = datetime / 1000                 // Operations are in seconds, not milliseconds
                if (secondsSinceEpoch < new Date().getTime() / 1000) {
                    return "Deadline must not be already past."
                }
                return true
            }
        },
        {
            type: "input",
            name: "requestStartingTime",
            message: "Request starting time",
            validate: (input) => {
                let datetime = new Date(input).getTime()
                if (isNaN(datetime)) {
                    return "Not a valid date."
                }
                let secondsSinceEpoch = datetime / 1000                 // Operations are in seconds, not milliseconds
                if (secondsSinceEpoch < new Date().getTime() / 1000) {
                    return "Starting time must not be already past."
                }
                return true
            }
        },
        {
            type: "input",
            name: "requestDuration",
            message: "Request duration (in minutes)",
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
            message: "Starting price/minute value for auction",
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
            name: "instantRules",
            message: "Instant rent rules (in array format). Enter -1 to only allow auction-based offers",
            validate: (input: string) => {
                if (input === "-1") {
                    return true;
                }

                let cleanedInput = input.substring(1, input.length-1)
                let values = cleanedInput.split(",")
                if (values.filter((value) => {              // Check if there's any value that cannot be parsed as an integer
                    return !parseInt(value)
                }).length > 0) {
                    return "Some values are not valid numbers."
                }
                return true
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

function getTokenDetails(tokenEncoded: string): utils.MarketplaceAccessTokenComponents {
    const nonceLength = 64
    const selectorLength = 8
    const addressLength = 40

    let startIndex = 2
    return {
        nonce: "0x" + tokenEncoded.substr(startIndex, nonceLength),
        methodSelector: "0x" + tokenEncoded.substr(startIndex+nonceLength, selectorLength),
        requestCreatorAddress: "0x" + tokenEncoded.substr(startIndex+nonceLength+selectorLength, addressLength),
        contractAddress: "0x" + tokenEncoded.substr(startIndex+nonceLength+selectorLength+addressLength)
    }
}

function getFormattedInstantRules(details: string): number[] {
    if (details == "-1") {
        return []
    }
    return details.substring(1, details.length-1).split(",").map(value => parseInt(value))
}

async function handleOfferCreation(): Promise<void> {
    const offerDetails = await inquirer.prompt(getOfferCreationQuestions())

    // Create offer
    console.log(`Creating offer using Ethereum address: ${offerDetails.creatorAccount}...`)
    let newOfferTransactionResult = await SMAUGMarketplaceInstance.methods.submitOffer(offerDetails.requestID).send({from: offerDetails.creatorAccount, gas: 200000})

    let txStatus = (newOfferTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        console.error(`Offer creation failed with status ${txStatus}`)
        return
    }
    let offerID = (newOfferTransactionResult.events!.OfferAdded.returnValues.offerID) as number
    console.log(`New offer created with ID ${offerID}`)

    await utils.waitForEnter("Generating new ECDSA keypair for JWT encryption. Press Enter to continue:")

    const newIdentity = EthCrypto.createIdentity()
    console.log({private: newIdentity.privateKey, public: newIdentity.publicKey})

    await utils.waitForEnter()
    
    // Create offer extra
    const offerType = 1           // Offer is an auction one (no instant rent)
    const startTimeInMillisecond = new Date(offerDetails.offerStartingTime).getTime() / 1000

    let offerExtra = [startTimeInMillisecond, offerDetails.offerDuration, offerType, Web3.utils.toBN(newIdentity.publicKey)]

    console.log(`Adding offer extra to offer with ID ${offerID}...`)
    console.log("Offer extra:")
    console.log(offerExtra)

    let newOfferExtraTransactionResult = await SMAUGMarketplaceInstance.methods.submitOfferArrayExtra(offerID, offerExtra).send({from: offerDetails.creatorAccount, gas: 1000000, value: offerDetails.offerPrice})

    if (newOfferExtraTransactionResult.events!.FunctionStatus.returnValues == undefined) {
        // All good
        pendingOffers.add(offerID)
        console.log("Offer created!")
    } else {
        txStatus = (newOfferExtraTransactionResult.events!.FunctionStatus.returnValues.status) as number
        if (txStatus != 0) {
            console.error(`Offer creation failed with status ${txStatus}`)
            return
        }
    }
    await utils.waitForEnter()
}

// Expected answers from these questions are {requestID: string, offerStartingTime: string, offerDuration: string, pricePerMinute: string, creatorEncryptionKey: string, creatorAuthKey: string, creatorAccount: string}
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
                let datetime = new Date(input).getTime()
                if (isNaN(datetime)) {
                    return "Not a valid date."
                }
                let secondsSinceEpoch = datetime / 1000                 // Operations are in seconds, not milliseconds
                if (secondsSinceEpoch < new Date().getTime() / 1000) {
                    return "Starting time must not be already past."
                }
                return true
            }
        },
        {
            type: "input",
            name: "offerDuration",
            message: "Offer duration (in minutes)",
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
            name: "offerPrice",
            message: "Total amount willing to pay",
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
        // {
        //     type: "string",
        //     name: "creatorEncryptionKey",
        //     message: "Offer creator encryption key",
        //     validate: (input) => {
        //         if (!Web3.utils.isHex(input)) {
        //             return true
        //         }
        //         return "Value must be a UTF-8 string, not HEX."
        //     }
        // },
        // {
        //     type: "input",
        //     name: "creatorAuthKey",
        //     message: "Offer creator authentication key",
        //     validate: (input) => {
        //         if (!Web3.utils.isHex(input)) {
        //             return true
        //         }
        //         return "Value must be a UTF-8 string, not HEX."
        //     }
        // },
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

function printNewOffersFulfilled(force: boolean = false) {
    if (unseenOfferFulfilledEvents.length > 0) {
        console.log(`!!! ${unseenOfferFulfilledEvents.length} new offers have been fulfilled since last time!`)
        unseenOfferFulfilledEvents.forEach((offer, index) => {
            console.log(`${index+1}) Offer ID: ${offer.returnValues.offerID} - token: ${offer.returnValues.token}`)
        })
        unseenOfferFulfilledEvents = []
    } else if (force) {     //unseenOfferFulfilledEvents.length == 0
        console.log("No new offers have been fulfilled!")
    }
}

function printNewOffersUnfulfilled(force: boolean = false) {
    if (unseenOfferUnFulfilledEvents.length > 0) {
        console.log(`!!! ${unseenOfferUnFulfilledEvents.length} new offers have not been fulfilled since last time!`)
        unseenOfferUnFulfilledEvents.forEach((offer, index) => {4
            console.log(`${index+1}) Offer ID: ${offer.returnValues.offerID}`)
        })
        unseenOfferUnFulfilledEvents = []
    } else if (force) {     //unseenOfferUnFulfilledEvents.length == 0
        console.log("No new offers have not been fulfilled!")
    }
}

// async function createAndDecideTestRequest() {
//     // Assuming a ganache test network with unlocked accuonts is used
//     let availableAccounts = await web3MarketplaceInstance.eth.getAccounts()
//     let marketplaceOwner = availableAccounts[0]
//     let requestCreator = availableAccounts[1]
//     let offerer1Creator = availableAccounts[2]
//     let offerer2Creator = availableAccounts[3]
//     let offerer3Creator = availableAccounts[4]
//     let requestCreationToken = await utils.generateFunctionSignedTokenWithAccount(SMAUGMarketplaceInstance.options.jsonInterface, "submitRequest", requestCreator, SMAUGMarketplaceInstance.options.address, web3MarketplaceInstance, marketplaceOwner)
    
//     let defaultExtra = [1, 100, 1, 1]           // [start time, duration, min auction price, locker key]
//     console.log(`Creating new request with extra [${defaultExtra}]...`)
//     let newRequestTransactionResult = await SMAUGMarketplaceInstance.methods.submitRequest(requestCreationToken.tokenDigest, requestCreationToken.signature, requestCreationToken.nonce, 10000000000).send({from: requestCreator, gas: 200000})
//     let txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
//     if (txStatus != 0) {
//         console.error(`submitRequest failed with status ${txStatus}`)
//         return
//     }
//     let requestID = (newRequestTransactionResult.events!.RequestAdded.returnValues.requestID) as number
//     let newRequestExtraTransactionResult = await SMAUGMarketplaceInstance.methods.submitRequestArrayExtra(requestID, defaultExtra).send({from: requestCreator, gas: 200000})
//     txStatus = (newRequestExtraTransactionResult.events!.FunctionStatus.returnValues.status) as number
//     if (txStatus != 0) {
//         console.error(`submitRequest failed with status ${txStatus}`)
//         return
//     }
//     console.log(`New request with extra [${defaultExtra}] and ID ${requestID} created! 🙂🙂🙂`)

//     let offer1Extra = [1, 5, 0, "0x" + web3MarketplaceInstance.utils.toHex("ENC-KEY1").substr(2).padStart(64, "0")]
//     console.log(`Creating test offer 1 with extra [${offer1Extra}]...`)
//     let offer1TransactionResult = await SMAUGMarketplaceInstance.methods.submitOffer(requestID).send({from: offerer1Creator, gas: 200000})
//     txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
//     if (txStatus != 0) {
//         console.error(`submitOffer failed with status ${txStatus}`)
//         return
//     }
//     let offer1ID = parseInt(offer1TransactionResult.events!.OfferAdded.returnValues.offerID)
//     try {
//         await SMAUGMarketplaceInstance.methods.submitOfferArrayExtra(offer1ID, offer1Extra).send({from: offerer1Creator, gas: 1000000, value: "5"})
//     } catch (e) {
//         console.error(`submitOfferArrayExtra failed with error ${e}`)
//         return
//     }
//     console.log(`New offer with extra [${offer1Extra}] and ID ${offer1ID} created! 💰💰💰`)
//     pendingOffers.add(offer1ID)

//     let offer2Extra = [1, 5, 0, "0x" + web3MarketplaceInstance.utils.toHex("ENC-KEY2").substr(2).padStart(64, "0"), "0x" + web3MarketplaceInstance.utils.toHex("AUTH-KEY2").substr(2).padStart(64, "0")]
//     console.log(`Creating test offer 2 with extra [${offer2Extra}]...`)
//     let offer2TransactionResult = await SMAUGMarketplaceInstance.methods.submitOffer(requestID).send({from: offerer2Creator, gas: 200000})
//     txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
//     if (txStatus != 0) {
//         console.error(`submitOffer failed with status ${txStatus}`)
//         return
//     }
//     let offer2ID = parseInt(offer2TransactionResult.events!.OfferAdded.returnValues.offerID)
//     try {
//         await SMAUGMarketplaceInstance.methods.submitOfferArrayExtra(offer2ID, offer2Extra).send({from: offerer2Creator, gas: 1000000, value: "5"})
//     } catch (e) {
//         console.error(`submitOfferArrayExtra failed with error ${e}`)
//         return
//     }
//     console.log(`New offer with extra [${offer2Extra}] and ID ${offer2ID} created! 💰💰💰`)
//     pendingOffers.add(offer2ID)

//     let offer3Extra = [1, 5, 0, "0x" + web3MarketplaceInstance.utils.toHex("ENC-KEY3").substr(2).padStart(64, "0"), "0x" + web3MarketplaceInstance.utils.toHex("AUTH-KEY3").substr(2).padStart(64, "0")]
//     console.log(`Creating test offer 3 with extra [${offer3Extra}]...`)
//     let offer3TransactionResult = await SMAUGMarketplaceInstance.methods.submitOffer(requestID).send({from: offerer3Creator, gas: 200000})
//     txStatus = parseInt(newRequestTransactionResult.events!.FunctionStatus.returnValues.status)
//     if (txStatus != 0) {
//         console.error(`submitOffer failed with status ${txStatus}`)
//         return
//     }
//     let offer3ID = parseInt(offer3TransactionResult.events!.OfferAdded.returnValues.offerID)
//     try {
//         await SMAUGMarketplaceInstance.methods.submitOfferArrayExtra(offer3ID, offer3Extra).send({from: offerer3Creator, gas: 1000000, value: "9"})
//     } catch (e) {
//         console.error(`submitOfferArrayExtra failed with error ${e}`)
//         return
//     }
//     console.log(`New offer with extra [${offer3Extra}] and ID ${offer3ID} created! 💰💰💰`)
//     pendingOffers.add(offer3ID)
    
//     console.log(`Closing and deciding request ${requestID} by selecting ${[offer1ID, offer2ID]} as winning offers...`)
//     let requestDecisionTransactionResults = await SMAUGMarketplaceInstance.methods.decideRequest(requestID, [offer1ID, offer2ID]).send({from: requestCreator, gas: 2000000})
//     if (requestDecisionTransactionResults.events!.RequestDecided == undefined) {
//         console.error("Request decision failed.")
//         return
//     }
//     console.log("Request decision process succesfully completed! 💵💵💵")
// }