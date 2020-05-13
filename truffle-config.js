require("ts-node/register")

module.exports = {
  migrations_directory: "./app/migrations",
  compilers: {
    solc: {
      version: "^0.5.0"
    }
  }
}