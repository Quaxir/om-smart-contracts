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

export async function waitForEnter() {
    const waitForEnter = require("wait-for-enter");
    console.log("Press Enter to continue...")
    await waitForEnter()
}