pragma solidity ^0.5.0;

import { ECDSA } from "@openzeppelin/contracts/cryptography/ECDSA.sol";

/*
An access token is a tuple containing:
    - a nonce
    - a digest, which is the hash of the access token content
    - a signature, over the digest, to verify the signed of the token

An access token digest contains the following information:
    - a nonce;
    - the function selector, which makes the access token usable only to invoke a specific method;
    - the subject address, i.e. the address authorised to use the access token (it is not a bearer access token);
    - the audience address, i.e. the address of the smart contract for which the access token has been issued;
This information gives right to a specific user to invoke a specific method on a smart contract at a specific address.
If token usage is recorded, the access token can be made so that they can only be used once.
*/
library AccessTokenLibrary {

    // struct AccessToken {
    //     bytes32 nonce;
    //     bytes32 digest;
    //     bytes signature;
    // }

    // Verifies that the token matches the expected nonce, function selector, subject address and audience address.
    function validateAndReturnTokenSigner
        (bytes32 digest, bytes calldata signature, bytes32 nonce, bytes4 functionSelector, address subjectAddress, address audienceAddress)
        external pure returns (bool isTokenValid, address signer) {

            if (digest != getHashForFunctionAndNonce(nonce, functionSelector, subjectAddress, audienceAddress)) {
                return (false, address(0));
            }

            return (true, ECDSA.recover(digest, signature));
    }

    function getHashForFunctionAndNonce
        (bytes32 nonce, bytes4 functionSelector, address sourceAddress, address targetAddress)
        internal pure returns (bytes32 functionSelectorHash) {
            /*
                Total length of the message is 76 =
                32 (nonce) + 4 (function selector) + 20 (source address = entity interacting with this contract) + 20 (destination address = this contract)
            */
            return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n76", nonce, functionSelector,  sourceAddress, targetAddress));
    }
}