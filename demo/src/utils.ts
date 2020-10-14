import atob from "atob"

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

export interface EnvVariables {
    MPAddress: string,
    MPABIPath: string,
    ethereumMPAddress: string,
    MPOwner: string,
    MPBackendAddress: string,
    MPBackendHost?: string
}