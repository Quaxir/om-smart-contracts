import Web3 from "web3"
import { AbiItem } from "web3-utils"
import fs from "fs"

import { SmaugMarketPlace as SMAUGMarketplace } from "../types/web3-v1-contracts/SMAUGMarketPlace"

import * as utils from "./utils"
import yargs from "yargs"
import inquirer, { QuestionCollection } from "inquirer"

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
                        name: "4) Exit",
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
            case "exit": {
                return
            }
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
        throw new Error(`Request creation failed with status ${txStatus}`)
    }
    let requestID = (newRequestTransactionResult.events!.RequestAdded.returnValues.requestID) as number
    
    // Create request extra
    let requestExtra = [requestDetails.requestStartingTime, requestDetails.requestDuration, requestDetails.minAuctionPrice, requestDetails.lockerID]
    let newRequestExtraTransactionResult = await SMAUGMarketplaceInstance.methods.submitRequestArrayExtra(requestID, requestExtra).send({from: requestDetails.creatorAccount, gas: 200000})
    txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        throw new Error(`Request creation failed with status ${txStatus}`)
    }
    console.log(`Request created with ID ${requestID}!`)
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

async function handleOfferCreation(): Promise<void> {
    console.log("createOffer")
}

async function handleRequestDecision(): Promise<void> {
    console.log("decideRequest")
}

async function createAndDecideTestRequest(marketplaceWeb3Instance: Web3, marketplaceContract: SMAUGMarketplace) {
    // Assuming a ganache test network with unlocked accuonts is used
    let availableAccounts = await marketplaceWeb3Instance.eth.getAccounts()
    let marketplaceOwner = availableAccounts[0]
    let requestCreator = availableAccounts[1]
    let offererCreator = availableAccounts[2]
    let requestCreationToken = await utils.generateFunctionSignedTokenWithAccount(marketplaceContract.options.jsonInterface, "submitRequest", requestCreator, marketplaceContract.options.address, marketplaceWeb3Instance, marketplaceOwner)
    console.log(`Request access token nonce: ${requestCreationToken.nonce}`)
    
    let defaultExtra = [1, 100, 1, 1]           // [start time, duration, min auction price, locker key]
    console.log(`Creating new request with extra [${defaultExtra}]...`)
    let newRequestTransactionResult = await marketplaceContract.methods.submitRequest(requestCreationToken.tokenDigest, requestCreationToken.signature, requestCreationToken.nonce, 2**50).send({from: requestCreator, gas: 200000})
    console.log(newRequestTransactionResult.events)
    let txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        throw new Error(`submitRequest failed with status ${txStatus}`)
    }
    let requestID = (newRequestTransactionResult.events!.RequestAdded.returnValues.requestID) as number
    let newRequestExtraTransactionResult = await marketplaceContract.methods.submitRequestArrayExtra(requestID, defaultExtra).send({from: requestCreator, gas: 200000})
    txStatus = (newRequestExtraTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        throw new Error(`submitRequestArrayExtra failed with status ${txStatus}`)
    }
    console.log(`New request with extra [${defaultExtra}] created.`)
    
    let offer1Extra = [1, 5, 0, 5, 1234567890]
    console.log(`Creating test offer 1 with extra [${offer1Extra}]`)
    let offer1TransactionResult = await marketplaceContract.methods.submitOffer(requestID).send({from: offererCreator, gas: 200000})
    txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        throw new Error(`submitOffer failed with status ${txStatus}`)
    }
    let offer1ID = offer1TransactionResult.events!.OfferAdded.returnValues.offerID as number
    let offer1ExtraTransactionResult = await marketplaceContract.methods.submitOfferArrayExtra(offer1ID, offer1Extra).send({from: offererCreator, gas: 200000})
    txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        throw new Error(`submitOfferArrayExtra failed with status ${txStatus}`)
    }
    console.log(`New offer with extra [${defaultExtra}] created.`)

    let offer2Extra = [1, 5, 0, 5, 1234567890, 9876543210]
    console.log(`Creating test offer  with extra [${offer1Extra}]`)
    let offer2TransactionResult = await marketplaceContract.methods.submitOffer(requestID).send({from: offererCreator, gas: 200000})
    txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        throw new Error(`submitOffer failed with status ${txStatus}`)
    }
    let offer2ID = offer1TransactionResult.events!.OfferAdded.returnValues.offerID as number
    let offer2ExtraTransactionResult = await marketplaceContract.methods.submitOfferArrayExtra(offer1ID, offer1Extra).send({from: offererCreator, gas: 200000})
    txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        throw new Error(`submitOfferArrayExtra failed with status ${txStatus}`)
    }
    console.log(`New offer with extra [${defaultExtra}] created.`)

    console.log(`Closing and deciding request by selecting ${[offer1ID, offer2ID]} as winning offers...`)
    let requestDecisionTransactionResult = await marketplaceContract.methods.decideRequest(requestID, [offer1ID, offer2ID]).send({from: requestCreator, gas: 200000})
    txStatus = (newRequestTransactionResult.events!.FunctionStatus.returnValues.status) as number
    if (txStatus != 0) {
        throw new Error(`decideRequest failed with status ${txStatus}`)
    }
    console.log("Request closed and decided. Interledger events emitted.")
}