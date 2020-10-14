import appendQuery from "append-query";
import atob from "atob"
import { sys } from "typescript";
import urljoin from "url-join"
import BN from "bn.js";
import { URL } from "url";

export async function waitForEnter(message?: string) {
    const waitForEnter = require("wait-for-enter");
    message = message || "Press Enter to continue..."
    console.log(message)
    await waitForEnter()
}

export function base64ToUint8Array(base64String: string): Uint8Array {
    let binaryString = atob(base64String.replace(/_/g, "/").replace(/-/g, "+"))
    let binaryStringLength = binaryString.length;
    let bytes = new Uint8Array(binaryStringLength);

    for (let i = 0; i < binaryStringLength; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

export function parseAndReturnEnvVariables(environment: NodeJS.ProcessEnv): EnvVariables {
    const MPAddress = process.env["MP_ADDRESS"] as string
    const MPABIPath = process.env["MP_ABI_PATH"] as string
    const ethereumMPAddress = process.env["ETHEREUM_MP_ADDRESS"] as string
    const MPOwner = process.env["MP_OWNER"] as string
    const MPBackendAddress = process.env["MP_BACKEND_ADDRESS"] as string
    const MPBackendHost = process.env["MP_BACKEND_HOST"] as string              // Optional

    if (MPAddress == undefined) {
        console.error("MP_ADDRESS env variable missing.")
        sys.exit(1)
    }
    if (MPABIPath == undefined) {
        console.error("MP_ABI_PATH env variable missing.")
        sys.exit(1)
    }
    if (ethereumMPAddress == undefined) {
        console.error("ETHEREUM_MP_ADDRESS env variable missing.")
        sys.exit(1)
    }
    if (MPOwner == undefined) {
        console.error("MP_OWNER env variable missing.")
        sys.exit(1)
    }
    if (MPBackendAddress == undefined) {
        console.error("MP_BACKEND_ADDRESS env variable missing.")
        sys.exit(1)
    }
    
    return { MPAddress, MPABIPath, ethereumMPAddress, MPOwner, MPBackendAddress, MPBackendHost }
}

export function printArgumentsDetails(options: EnvVariables) {
    console.log(`Arguments used:\n
        - MARKETPLACE ETHEREUM NETWORK ADDRESS: ${options.ethereumMPAddress}\n
        - MARKETPLACE SMART CONTRACT ADDRESS: ${options.MPAddress}\n
        - MARKETPLACE BACKEND ADDRESS: ${options.MPBackendAddress}
    `)
}

export function getBackendEndpoint(backendURL: URL, ethereumAddress: string): string {
    let backendEndpoint = urljoin(backendURL.toString(), "api", "marketplace", "gettoken")
    return appendQuery(backendEndpoint, {ethereum_address: ethereumAddress})
}

export function getTokenDetails(tokenEncoded: string): MarketplaceAccessTokenComponents {
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

export function getFormattedInstantRules(details: string): number[] {
    if (details == "-1") {
        return []
    }
    return details.substring(1, details.length-1).split(",").map(value => parseInt(value))
}

export interface EnvVariables {
    MPAddress: string,
    MPABIPath: string,
    ethereumMPAddress: string,
    MPOwner: string,
    MPBackendAddress: string,
    MPBackendHost?: string
}

export interface MarketplaceAccessToken {
    digest: string
    encoded: string
    signature: string
    nonce: string
}

export interface MarketplaceAccessTokenComponents {
    nonce: string,
    methodSelector: string,
    requestCreatorAddress: string,
    contractAddress: string
}

export interface AuctionRequestCompleteDetails {
    deadline: Date,
    startTime: Date,
    durationInMinutes: BN,
    minAuctionPricePerMinute: BN
    lockerID: BN,
    creatorAccount: string
}

export interface AuctionOfferCompleteDetails {
    startTime: Date,
    durationInMinutes: BN,
    amount: BN,
    encryptionKey: Uint8Array,
    decryptionKey: Uint8Array,
    creatorAccount: string
}