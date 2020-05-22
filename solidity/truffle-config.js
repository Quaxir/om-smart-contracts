require("ts-node/register")

module.exports = {
  migrations_directory: "./app/migrations",
  networks: {
    local_ganache: {
      host: "127.0.0.1",
      port: 32771,
      network_id: "*"
    }
  },
  compilers: {
    solc: {
      version: "^0.5.0"
    }
  }
}
