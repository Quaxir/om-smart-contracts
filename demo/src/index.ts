import Web3 from "web3"
import { AbiItem } from "web3-utils"
import yaml from "js-yaml"
import fs from "fs"

import { SmaugMarketPlace as SMAUGMarketplace } from "../types/web3-v1-contracts/SMAUGMarketPlace"

import * as utils from "./utils"

main().catch(error => {
    console.error(error)
    process.exit(1)
})

async function main() {
    let marketplaceParsedConfigFile = await readAndParseConfigFile()
    let {web3MarketplaceInstance, marketplaceContract} = getMarketplaceDetails(marketplaceParsedConfigFile)
    await createAndDecideTestRequest(web3MarketplaceInstance, marketplaceContract)
}

function readAndParseConfigFile(): any {
    let filePath = "./config/network.yaml"
    let configFileContent = fs.readFileSync(filePath, {flag: "r"}).toString()
    if (configFileContent == null) {
        throw new Error(`No config file at ${filePath}.`)
    }
    return yaml.safeLoad(configFileContent)
}

function getMarketplaceDetails(marketplaceConfiguration: any): {web3MarketplaceInstance: Web3, marketplaceContract: SMAUGMarketplace} {
    let host = marketplaceConfiguration.host
    let port = marketplaceConfiguration.port
    let smartContractAddress = marketplaceConfiguration.smart_contract_address
    let smartContractABI = JSON.parse(fs.readFileSync("./config/abi/SMAUGMarketplace.json").toString()) as AbiItem[]

    let web3MarketplaceInstance = new Web3(`${host}:${port}`)
    let marketplaceContract = (new web3MarketplaceInstance.eth.Contract(smartContractABI, smartContractAddress) as any) as SMAUGMarketplace

    return {web3MarketplaceInstance, marketplaceContract}
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