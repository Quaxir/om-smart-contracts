# Offer Marketplace smart contracts

This repo contains all the smart contracts that are under the control and are trusted by the offer marketplace owner. The set of smart contracts implements a decentralised, Ethereum-based marketplace that uses the [SOFIE Marketplace component](https://github.com/SOFIE-project/Marketplace) as the starting point.

## Fresh start

When the project is cloned for the first time, run `npm install`. This will install all the needed `npm` dependencies, as well as generate all the [Typechain](https://github.com/ethereum-ts/TypeChain) typescript bindings needed for development.

## Compile the smart contracts

From the root of the project, run `npm run build` to compile the smart contracts and their typescript typings.

## Migrate the smart contracts

Migration represents the process of deploying the smart contracts on a target blockchain.

### Spin up a local blockchain with a shared state

Migrations are run either as a standalone operation, in case a smart contract needs to be deployed on a target blockchain, or as the first step in the testing procedure. In doing so, Truffle spins up a local ganache instance which is then teared down at the end of the tests.

In our case, to make easier and faster to set up the development environment, some scripts are provided to spin up a blockchain locally on the machine on port 8545 using the [Truffle ganache-cli](https://hub.docker.com/r/trufflesuite/ganache-cli/) Docker image. To do so, run `npm run deploy:marketplace`. The Docker container uses a mounted volume for the blockchain database, meaning that restarting the container will preserve the state of the blockchain (all the contracts deployed and all the transactions issued). The state of the blockchain is saved in the `marketplace_state`, **so it is highly discouraged to touch the content of this directory, since that would invalidate the whole blockchain state**.

> In case the port that the script uses to configure the local blockchain is used, the port information needs to be changed in the following files: `truffle-config.js` (for the `marketplace` network), `scripts/lunch_marketplace_blockchain` (the `HOST_PORT` variable must be changed). Make sure the port numbers match in the two files.

### Run a migration

After spinning up the local development blockchain, run `npm run migrate:marketplace`, to deploy the SMAUG smart contracts on the provided marketplace test blockchain. 

If another blockchain network is to be used, then the command to execute will also need to include the name of that blockchain: `npm run migrate -- --network <NETWORK_NAME>`.

## Test the smart contracts

Run `npm run test` if tests must be run on the development blockchain started by Truffle, otherwise `npm run test:marketplace` to run the tests on the local development blockchain. Ignore any typescript-related errors that might be generated on the console.

If another blockchain network is to be used, then the command to execute will also need to include the name of that blockchain: `npm run test -- --network <NETWORK_NAME>`.

## Run the demo application

A demo application is provided in the `demo` folder. To run it, follow the instructions in `demo/README.md`.