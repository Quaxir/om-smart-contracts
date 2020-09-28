import { AbiItem } from "web3-utils"
import Web3 from "web3"
import { URL } from "url"
import { url } from "inspector"

export interface MarketplaceAccessToken {
    digest: string
    encoded: string
    signature: string
    nonce: string
}

// export async function generateFunctionSignedTokenWithAccount(contractABI: AbiItem[], functionName: string, actorAddress: string, targetAddress: string, web3Instance: Web3, signerAccount: string): Promise<MarketplaceAccessToken> {
//     const contractFunctionABI = contractABI.filter(input => input.name == functionName)[0]
//     const encodedFunction = web3Instance.eth.abi.encodeFunctionSignature(contractFunctionABI)
//     const randomNonce = "0x" + "1234567891234567891234567891234567891234567891234567891234567890"
//     const message = randomNonce+encodedFunction.slice(2)+actorAddress.slice(2)+targetAddress.slice(2)
//     const digest = web3Instance.utils.soliditySha3("\x19Ethereum Signed Message:\n76", randomNonce, encodedFunction, actorAddress, targetAddress)        //soliditySha3() == keccak256(abi.encodePacked())
//     let signature = await web3Instance.eth.sign(message, signerAccount)
//     signature = updateSignatureAgainstMalleability(signature, web3Instance)

//     return {digest: digest as string, encoded: message, signature: signature, nonce: randomNonce}
// }

// // From https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/cryptography/ECDSA.sol#L50
// function updateSignatureAgainstMalleability(signature: string, web3Instance: Web3) {
//     let v = "0x" + signature.slice(-2)
//     let vDecimal = web3Instance.utils.hexToNumber(v)

//     if (vDecimal <= 1) {
//         vDecimal += 27
//         v = web3Instance.utils.numberToHex(vDecimal)
//     }

//     return signature.slice(0, signature.length-2) + v.slice(2)
// }

export async function waitForEnter() {
    const waitForEnter = require("wait-for-enter");
    console.log("Press Enter to continue...")
    await waitForEnter()
}