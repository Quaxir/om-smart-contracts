import Web3 from "web3"
import fs from "fs"
import BN from "bn.js"

import { SmaugMarketPlace as SMAUGMarketplace, OfferFulfilled, OfferClaimable, RequestDecided } from "../types/web3-v1-contracts/SMAUGMarketPlace"

import * as utils from "./utils"
import inquirer from "inquirer"
import { URL } from "url"
import fetch from "node-fetch"
import { EventLog } from "web3-core/types"
import jwtDecode from "jwt-decode";

const nacl = require("js-nacl")                         // Mismatch between types and actual library, so using module import fails for the functions we use in this app.

main().catch((error: Error) => {
    console.error(error.message)
    console.error(error.name)
    process.exit(1)
}).then(() => {
    console.log("Bye!")
    process.exit(0)
})

process.on('SIGINT', () => {
    console.log("Bye!");
    process.exit(0);
});

var web3MarketplaceInstance: Web3
var SMAUGMarketplaceInstance: SMAUGMarketplace
var backendURL: URL
var backendHost: string | undefined

var openRequests: Set<number> = new Set()
var unseenEvents: EventLog[] = []
var unseenOfferFulfilledEvents: OfferFulfilled[] = []
var unseenOfferUnFulfilledEvents: OfferClaimable[] = []

var keys: Map<string, [Uint8Array, Uint8Array]> = new Map()     // offerID -> (secret key, public key)

let crypto: any                                     // Mismatch between types and actual library, so using module import fails for the functions we use in this app.

var debug: Boolean

async function main(): Promise<void> {

    const variables = utils.parseAndReturnEnvVariables(process.env)

    try {
        backendURL = new URL(variables.MPBackendAddress)
    } catch(err){
        throw new Error("Marketplace URL is not a valid URL.")
    }

    web3MarketplaceInstance = new Web3(variables.ethereumMPAddress)
    SMAUGMarketplaceInstance = (new web3MarketplaceInstance.eth.Contract(JSON.parse(fs.readFileSync(variables.MPABIPath).toString()), variables.MPAddress) as any) as SMAUGMarketplace
    backendHost = variables.MPBackendHost

    utils.printArgumentsDetails(variables)

    await nacl.instantiate(nacl => crypto = nacl)

    configureEventListener(false)
    await handleUserInput()
}

function configureEventListener(debug: boolean = false) {
    debug && console.log("Configuring event listener...")
    SMAUGMarketplaceInstance.events

    SMAUGMarketplaceInstance.events.allEvents({}, (error, event) => {
        if (debug) {
            if (error != null) {
                console.error(`${error.name}\n${error.message}`)
            } else {
                console.log(`\nEvent ${event.event} received!`)
                console.log(event)
            }
        }
        if (event.event == "OfferFulfilled") {
            let castedEvent = event as OfferFulfilled
            unseenOfferFulfilledEvents.push(castedEvent)
        } else if (event.event == "OfferClaimable") {
            let castedEvent = event as OfferClaimable
            unseenOfferUnFulfilledEvents.push(castedEvent)
        } else if (event.event == "RequestDecided") {
            let castedEvent = event as RequestDecided
            let requestID = parseInt(castedEvent.returnValues.requestID)
            openRequests.delete(requestID)
        }
        unseenEvents.push(event)
    })

    debug && console.log("Event listener configured.")
}

async function handleUserInput(): Promise<void> {
    while (true) {
        var choiceIndex = 1
        let answers = await inquirer.prompt([
            {
                type: "list",
                name: "choice", message: "What would you like to do?",
                choices: [
                    {
                        name: `${choiceIndex++}) List accounts and balances`,
                        value: "listAccountBalances"
                    },
                    {
                        name: `${choiceIndex++}) Trigger Interledger`,
                        value: "triggerInterledger"
                    },
                    {
                        name: `${choiceIndex++}) Check for new acess tokens issued`,
                        value: "checkForOffersEvents"
                    },
                    {
                        name: `${choiceIndex++}) Check events emitted since last time`,
                        value: "checkForPendingEvents"
                    },
                    {
                        name: `${choiceIndex++}) Turn debug flag ON/OFF`,
                        value: "flipDebug"
                    },
                    {
                        name: `${choiceIndex++}) Exit`,
                        value: "exit"
                    }
                ]
            }
        ])

        switch (answers.choice) {
            case "listAccountBalances":
                await getAndPrintAccountsAndBalances(web3MarketplaceInstance); break;
            case "triggerInterledger": {
                await triggerInterledger(); break;
            }
            case "checkForOffersEvents": {
                printNewOffersFulfilled(true)
                printNewOffersUnfulfilled(true)
                break
            }
            case "checkForPendingEvents": {
                checkForEventsGenerated(true); break;
            }
            case "flipDebug": {
                flipDebug(); break;
            }
            case "exit": { return }
        }
    }
}

// Returns a list of tuples where each tuple is [acount: string, balance: BN]
async function getAndPrintAccountsAndBalances(web3Instance: Web3): Promise<[string, BN][]> {
    let accounts = await web3MarketplaceInstance.eth.getAccounts()
    let balances = await Promise.all(accounts.map(async (account) => {
        let balance = await web3MarketplaceInstance.eth.getBalance(account)
        return web3Instance.utils.toBN(balance)
    }))

    let output = accounts.map((account, index) => {
        return `${account} - ${balances[index].toString()} wei`
    })

    console.log(output)

    return accounts.map((acc, index) => [acc, balances[index]] as [string, BN])
}

async function triggerInterledger(): Promise<void> {

    // On a freshly-started Docker Compose environment, this batch of operations takes ~ 1s to complete, so delay is not even noticeable

    const testRequestCreatorAccount = (await web3MarketplaceInstance.eth.getAccounts())[0]
    const testRequestDetails = getInterledgerAuctionRequest(testRequestCreatorAccount)
    const testRequestID = await createInterledgerAuctionRequest(testRequestDetails)
    const testOffer1CreatorAccount = (await web3MarketplaceInstance.eth.getAccounts())[6]
    const testOffer1Details = getInterledgerAuctionOffer1(testRequestDetails, testOffer1CreatorAccount)
    const testOffer2CreatorAccount = (await web3MarketplaceInstance.eth.getAccounts())[7]
    const testOffer2Details = getInterledgerAuctionOffer2(testRequestDetails, testOffer2CreatorAccount)
    const testOffer3CreatorAccount = (await web3MarketplaceInstance.eth.getAccounts())[8]
    const testOffer3Details = getInterledgerAuctionOffer3(testRequestDetails, testOffer3CreatorAccount)
    const testOffer1ID = await createInterledgerAuctionOffer(testOffer1Details, testRequestID)
    const testOffer2ID = await createInterledgerAuctionOffer(testOffer2Details, testRequestID)
    const testOffer3ID = await createInterledgerAuctionOffer(testOffer3Details, testRequestID)

    await utils.waitForEnter("Request pending decision:")
    console.log(`Request ${testRequestID})`)
    console.log(utils.requestToString(testRequestDetails))

    await utils.waitForEnter("Offers made:")

    console.log(`Offer ${testOffer1ID})`)
    console.log(utils.offerToString(testOffer1Details, (encryptionKey) => "0x" + crypto.to_hex(encryptionKey)))
    console.log("*****")
    console.log(`Offer ${testOffer2ID})`)
    console.log(utils.offerToString(testOffer2Details, (encryptionKey) => "0x" + crypto.to_hex(encryptionKey)))
    console.log("*****")
    console.log(`Offer ${testOffer3ID})`)
    console.log(utils.offerToString(testOffer3Details, (encryptionKey) => "0x" + crypto.to_hex(encryptionKey)))

    await utils.waitForEnter(`Deciding request ${testRequestID} by selecting offers ${testOffer1ID} and ${testOffer3ID}:`)

    unseenEvents = []                       // Clean unseen events, no interested in the ones generated before the interledger
    await decideTestAuctionRequest(testRequestDetails, testRequestID, [testOffer1ID, testOffer3ID])
    console.log("Request decided. Interledger event triggered.")
}

function getInterledgerAuctionRequest(creatorAccount: string): utils.AuctionRequestCompleteDetails {
    const deadline = new Date("2020-12-31:23:59:59Z")
    const startTime = new Date("2021-01-01:00:00:00Z")
    const durationInMinutes = new BN(44640)          // 31 days * 24 hours * 60 minutes
    const minAuctionPricePerMinute = new BN(50)
    const lockerID = new BN(1434123)

    return { deadline, startTime, durationInMinutes, minAuctionPricePerMinute, lockerID, creatorAccount }
}

async function createInterledgerAuctionRequest(requestDetails: utils.AuctionRequestCompleteDetails): Promise<BN> {
    const backendEndpoint = utils.getBackendEndpoint(backendURL, requestDetails.creatorAccount)
    const requestCreationTokenHeaders = backendHost == undefined ? null : {"Host": backendHost}
    const requestCreationTokenResponse = await fetch(backendEndpoint, {headers: requestCreationTokenHeaders})
    const requestCreationToken = await requestCreationTokenResponse.json() as utils.MarketplaceAccessToken
    debug && console.log(requestCreationToken)

    const newRequestTransactionResult = await SMAUGMarketplaceInstance.methods.submitRequest(requestCreationToken.digest, requestCreationToken.signature, requestCreationToken.nonce, requestDetails.deadline.getTime()/1000).send({from: requestDetails.creatorAccount, gas: 2000000, gasPrice: "1"})

    let txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        throw new Error(`Request creation failed with status ${txStatus}`)
    }
    const requestID = (newRequestTransactionResult.events!.RequestAdded.returnValues.requestID) as BN

    debug && console.log(`Request submitted with ID: ${requestID}`)
    
    // No instant rent rules, since that is not the goal here
    const requestExtra = [requestDetails.startTime.getTime()/1000, requestDetails.durationInMinutes.toString(), requestDetails.minAuctionPricePerMinute.toString(), requestDetails.lockerID.toString()]
    debug && console.log(`Submitting request extra [${requestExtra}]...`)
    const newRequestExtraTransactionResult = await SMAUGMarketplaceInstance.methods.submitRequestArrayExtra(requestID.toString(), requestExtra).send({from: requestDetails.creatorAccount, gas: 2000000, gasPrice: "1"})

    txStatus = (newRequestExtraTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        throw new Error(`Request extra submission failed with status ${txStatus}`)
    }

    debug && console.log(`Request extra submitted for ID: ${requestID}`)
    
    return requestID
}

function getInterledgerAuctionOffer1(requestDetails: utils.AuctionRequestCompleteDetails, creatorAccount: string): utils.AuctionOfferCompleteDetails {
    const startTime = new Date("2021-01-05:00:00:00Z")
    const durationInMinutes = new BN(21600)                    // 15 days * 24 hours * 60 minutes
    const amount = requestDetails.minAuctionPricePerMinute.mul(new BN(durationInMinutes))

    const newKeyPair = crypto.crypto_box_seed_keypair([1])
    const encryptionKey = newKeyPair.boxPk
    const decryptionKey = newKeyPair.boxSk

    return { startTime, durationInMinutes, amount, creatorAccount, encryptionKey, decryptionKey }
}

function getInterledgerAuctionOffer2(requestDetails: utils.AuctionRequestCompleteDetails, creatorAccount: string): utils.AuctionOfferCompleteDetails {
    const startTime = new Date("2021-01-10:00:00:00Z")
    const durationInMinutes = new BN(4320)                    // 3 days * 24 hours * 60 minutes
    const amount = requestDetails.minAuctionPricePerMinute.mul(new BN(durationInMinutes))

    const newKeyPair = crypto.crypto_box_seed_keypair([2])
    const encryptionKey = newKeyPair.boxPk
    const decryptionKey = newKeyPair.boxSk

    return { startTime, durationInMinutes, amount, creatorAccount, encryptionKey, decryptionKey }
}

function getInterledgerAuctionOffer3(requestDetails: utils.AuctionRequestCompleteDetails, creatorAccount: string): utils.AuctionOfferCompleteDetails {
    const startTime = new Date("2021-01-20:00:00:00Z")
    const durationInMinutes = new BN(14400)                    // 10 days * 24 hours * 60 minutes
    const amount = requestDetails.minAuctionPricePerMinute.mul(new BN(durationInMinutes))

    const newKeyPair = crypto.crypto_box_seed_keypair([3])
    const encryptionKey = newKeyPair.boxPk
    const decryptionKey = newKeyPair.boxSk

    return { startTime, durationInMinutes, amount, creatorAccount, encryptionKey, decryptionKey }
}

async function createInterledgerAuctionOffer(offerDetails: utils.AuctionOfferCompleteDetails, requestID: BN): Promise<BN> {

    const newOfferTransactionResult = await SMAUGMarketplaceInstance.methods.submitOffer(requestID.toString()).send({from: offerDetails.creatorAccount, gas: 2000000, gasPrice: "1"})

    let txStatus = (newOfferTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        throw new Error(`Offer creation failed with status ${txStatus}`)
    }
    const offerID = (newOfferTransactionResult.events!.OfferAdded.returnValues.offerID) as BN

    debug && console.log(`Offer submitted with ID: ${offerID}`)
    
    // Automatically isntant-rent offer
    const offerExtra = [offerDetails.startTime.getTime()/1000, offerDetails.durationInMinutes.toString(), 0, "0x" + crypto.to_hex(offerDetails.encryptionKey)]
    debug && console.log(`Submitting offer extra [${offerExtra}]...`)
    const newOfferExtraTransactionResult = await SMAUGMarketplaceInstance.methods.submitOfferArrayExtra(offerID.toString(), offerExtra).send({from: offerDetails.creatorAccount, gas: 2000000, gasPrice: "1", value: offerDetails.amount.toString()})

    if (newOfferExtraTransactionResult.events!.FunctionStatus.returnValues == undefined) {
        // All good
        debug && console.log(`Offer extra submitted for ID: ${offerID}`)
    } else {
        txStatus = (newOfferExtraTransactionResult.events!.FunctionStatus.returnValues.status) as number
        if (txStatus != 0) {
            throw new Error(`Offer creation failed with status ${txStatus}`)
        } else {
            debug && console.log(`Offer extra submitted for ID: ${offerID}`)
        }
    } 

    keys.set(offerID.toString(), [offerDetails.decryptionKey, offerDetails.encryptionKey])
    
    return offerID
}

async function decideTestAuctionRequest(requestDetails: utils.AuctionRequestCompleteDetails, requestID: BN, winningOfferIDs: BN[]) {
    const requestDecisonTransactionResult = await SMAUGMarketplaceInstance.methods.decideRequest(requestID.toString(), winningOfferIDs.map(offerID => offerID.toString())).send({from: requestDetails.creatorAccount, gas: 2000000, gasPrice: "1"})

    let txStatus = (requestDecisonTransactionResult.events!.FunctionStatus[0].returnValues.status) as number
    if (txStatus != 0) {
        throw new Error(`Request decision failed with status ${txStatus}`)
    }

    debug && console.log(`Request ${requestID} decided with winning offers: [${winningOfferIDs}] and Interledger process triggered.`)
}

function printNewOffersFulfilled(cleanAfterPrint: Boolean = false) {
    if (unseenOfferFulfilledEvents.length > 0) {
        console.log(`!!! ${unseenOfferFulfilledEvents.length} new offers have been fulfilled since last time!`)
        unseenOfferFulfilledEvents.forEach((offer, index) => {
            console.log(`${index+1})`)
            console.log(`- Offer ID: ${offer.returnValues.offerID}`)
            console.log(`- Encrypted token: ${offer.returnValues.token}`)
            let offerKeypair = keys.get(offer.returnValues.offerID)
            // Token decoding and decryption
            let tokenDecoded = web3MarketplaceInstance.utils.toUtf8(offer.returnValues.token)
            let cipherText = utils.base64ToUint8Array(tokenDecoded)
            let decryptedToken = crypto.crypto_box_seal_open(cipherText, offerKeypair[1], offerKeypair[0])
            let decodedDecryptedToken = crypto.decode_utf8(decryptedToken)
            console.log(`- Decrypted token: ${decodedDecryptedToken}`)

            let jwtHeader = jwtDecode(decodedDecryptedToken, {header: true})
            let jwtPayload = jwtDecode(decodedDecryptedToken)
            console.log("- JWT:")
            console.log({header: jwtHeader, payload: jwtPayload})

            if (index < unseenOfferFulfilledEvents.length-1) {
                console.log("*****")
            }
        })
        if (cleanAfterPrint) {
            unseenOfferFulfilledEvents = []
        }
    } else {
        console.log("No new offers have been fulfilled!")
    }
}

function printNewOffersUnfulfilled(cleanAfterPrint: Boolean = false) {
    if (unseenOfferUnFulfilledEvents.length > 0) {
        console.log(`!!! ${unseenOfferUnFulfilledEvents.length} new offers have not been fulfilled since last time!`)
        unseenOfferUnFulfilledEvents.forEach((offer, index) => {
            console.log(`${index+1}) Offer ID: ${offer.returnValues.offerID}`)
        })
        if (cleanAfterPrint) {
            unseenOfferUnFulfilledEvents = []
        }
    } else {
        console.log("No new offers have not been fulfilled!")
    }
}

function checkForEventsGenerated(cleanAfterPrint: Boolean = false) {
    if (unseenEvents.length == 0) {
        console.log("No pending events.")
        return
    }

    console.log("Events emitted:")

    unseenEvents.forEach((event, index) => {
        console.log(event)
    })

    if (cleanAfterPrint) {
        unseenEvents = []
    }
}

function flipDebug() {
    debug = !debug
    console.log(`Debug switch now ${debug ? "ON" : "OFF"}!`)
}