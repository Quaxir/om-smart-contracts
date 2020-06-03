# Offer Marketplace smart contracts

This repo contains all the smart contracts that are under the control and are trusted by the offer marketplace owner.

## Fresh start

Run `npm install`. Will install all the needed npm dependencies, as well as generate all the Typescript bindings needed for further development.

### THINGS TO NOTICE

*The current version of SMAUG relies on some changes made to the smart contracts provided by Aalto. Hopefully this will be fixed after the April release. Anyway, for the time being, once the node packages, including `sofie-offer-marketplace`, one file needs to be changed in that package. So replace the content of `node_modules/sofie-offer-marketplace/contracts/abstract/AbstractMarketPlace.sol` with `contracts/sofie-om-tmp/AbstractMarketPlaceFixed.sol` (uncommenting it).*

### How to compile

Run `npm run build` to compile the smart contracts and their typings.

### How to test

Run `npm run test`.

### How to migrate

Run `npm run migrate [-- --network=<network_name>]`, and make sure you have the correct network configured in `truffle-config.js`. The double `-- --` is not a mistake, but is the syntax for passing arguments to an npm script.