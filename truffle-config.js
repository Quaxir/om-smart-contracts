require("ts-node/register")

module.exports = {
  migrations_directory: "./app/solidity/migrations",
  compilers: {
    solc: {
      version: "^0.5.0"
    }
  }
}