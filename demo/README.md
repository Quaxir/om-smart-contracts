# Marketplace demo

Very simple (and still incomplete) demo for the marketplace, mainly to be used to test Interledger operations (triggered upon request decision).

## Configures

Before running the demo, a couple of things need to be done:

1. Copy the SMAUGMarketplace ABI inside `config/abi` folder. The ABI is the result of the compilation process, usually in a Truffle project saved in `build/contracts/<SMART_CONTRACT_NAME>.json`. From the JSON file, copy only the value (usually an array) under the `abi` key.
2. Configure `config/network.yaml` with the values corresponding to IP and port number of the ganache instance running locally, and with the SMAUG marketplace smart contract, once it's been deployed on such ganache instance.

## Install dependencies

If the demo has never been run (and dependencies never been installed), run `npm install`. This will install all the needed dependencies as well as generated the needed Typescript typings for the Web3 smart contracts.

## Run

Run `npm start` to run the demo. The demo will connect to the provided ganache instance, connect to the smart contract at the address specified in the config file, and create a test request, a bunch of test offers, and then closes and decides the test requests, so that the Interledger protocol, if an Interledger instance has been set up, can be triggered.