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