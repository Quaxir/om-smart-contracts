import * as fs from "fs"
import Web3 from "../../node_modules/web3/types"
import { AbiItem } from "../../node_modules/web3-utils"
import { soliditySha3 } from "../../node_modules/web3-utils"

export async function generateFunctionSignedTokenWithAccountPrivateKey(contractInterfacePath: string, functionName: string, actorAddress: string, targetAddress: string, web3Instance: Web3, privateKey: string) {
    const contractDefinition = JSON.parse(fs.readFileSync(contractInterfacePath, "utf8"))
    const contractInstance = new web3Instance.eth.Contract(contractDefinition.abi)
    const contractInterface = contractInstance.options.jsonInterface
    const testContractFunctionABI = contractInterface.filter(contractABI => contractABI.name == functionName)[0]
    const testContractFunctionParametersDeclarationABI = testContractFunctionABI.inputs!.map(functionInputABI => {
        return {type: functionInputABI.type, name: functionInputABI.name}
    })
    const functionDefinitionDictionary = {name: functionName, type: "function", inputs: testContractFunctionParametersDeclarationABI} as AbiItem
    const encodedFunction = web3Instance.eth.abi.encodeFunctionSignature(JSON.stringify(functionDefinitionDictionary))
    const randomNonce = web3Instance.utils.randomHex(32)
    const hash = randomNonce.slice+encodedFunction.slice(2)+actorAddress.slice(2)+targetAddress.slice(2)
    const signedResult = web3Instance.eth.accounts.sign(hash, privateKey)               //hash == signedResult.message
    return {messageHash: signedResult.messageHash, message: signedResult.message, signature: signedResult.signature, nonce: randomNonce, functionSelector: encodedFunction}
}

export async function generateFunctionSignedTokenWithAccount(contractInterfacePath: string, functionName: string, actorAddress: string, targetAddress: string, web3Instance: Web3, signerAccount: string) {
    const contractDefinition = JSON.parse(fs.readFileSync(contractInterfacePath, "utf8"))
    const contractInstance = new web3Instance.eth.Contract(contractDefinition.abi)
    const contractInterface = contractInstance.options.jsonInterface
    const testContractFunctionABI = contractInterface.filter(contractABI => contractABI.name == functionName)[0]
    const testContractFunctionParametersDeclarationABI = testContractFunctionABI.inputs!.map(functionInputABI => {
        return {type: functionInputABI.type, name: functionInputABI.name}
    })
    const functionDefinitionDictionary = {name: functionName, type: "function", inputs: testContractFunctionParametersDeclarationABI} as AbiItem
    const encodedFunction = web3Instance.eth.abi.encodeFunctionSignature(functionDefinitionDictionary)
    const randomNonce = web3Instance.utils.randomHex(32)
    const message = randomNonce+encodedFunction.slice(2)+actorAddress.slice(2)+targetAddress.slice(2)
    const hash = soliditySha3("\x19Ethereum Signed Message:\n76", randomNonce, encodedFunction, actorAddress, targetAddress)        //soliditySha3() == keccak256(abi.encodePacked())
    let signature = await web3Instance.eth.sign(message, signerAccount)
    signature = updateSignatureAgainstMalleability(signature, web3Instance)

    return {messageHash: hash as string, message: message, signature: signature, nonce: randomNonce, functionSelector: encodedFunction}
}

// From https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/cryptography/ECDSA.sol#L50
function updateSignatureAgainstMalleability(signature: string, web3Instance: Web3): string {
    let v = "0x" + signature.slice(-2)
    let vDecimal = web3Instance.utils.hexToNumber(v)

    if (vDecimal <= 1) {
        vDecimal += 27
        v = web3Instance.utils.numberToHex(vDecimal)
    }

    return signature.slice(0, signature.length-2) + v.slice(2)
}