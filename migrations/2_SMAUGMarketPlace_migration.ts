const AccessTokenLibrary = artifacts.require("AccessTokenLibrary")
const SMAUGMarketPlace = artifacts.require("SMAUGMarketPlace")

module.exports = (async (deployer, accounts) => {
    await deployer.deploy(AccessTokenLibrary)
    deployer.link(AccessTokenLibrary, SMAUGMarketPlace)
    await deployer.deploy(SMAUGMarketPlace)
}) as Truffle.Migration

// because of https://stackoverflow.com/questions/40900791/cannot-redeclare-block-scoped-variable-in-unrelated-files
export {}