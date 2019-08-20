# StandardBounties Relayer

A standalone(, centralized) relayer for the StandardBounties v2.0 smart contract. The server is implemented using Express and Redis as an in-memory key-value cache data storage for the management of user's requests quota limits

## Requirements

- Node 8+
- Docker
- Postman (for the demo & testing)

### Setup

- `.env` configuration

The following environment variables must be set prior executing the relayer server

1. `INFURA_HTTP_PROVIDER` Ethereum node endpoint (**e.g. Rinkeby Infura endpoint** )
1. `MNEMONIC` Mnemonic associated to the relayer account to be used by web3
1. `RELAYER_ACC_INDEX` Relayer account index on web3 (**default=0**)
1. `STANDARD_BOUNTIES_ADDRESS` _StandardBounties_ contract address (**default: Rinkeby 0xDA9B5E037bC6395A4ec350f9C6EDB698ea124871**)
1. `BOUNTIES_METATX_RELAYER_ADDRESS` _BountiesMetaTxRelayer_ contract address (**default: Rinkeby 0x471AC6ef531eE289667382a76cA1bF64dc9d6389**)
1. `RELAY_TIMEOUT` Time window between relay requests allowed by a user in seconds (**default=120**)
1. `REDIS_HOST` Redis server hostname (**default=localhost**)
1. `REDIS_PORT` Redis server port (**default=6379**)
1. `NO_ETH_USER_PK` Private key for a user account with no ETH. _Just for faster testing purposes on the server_

### Installation instructions

- In order to install the relayer server, run the following commands under the project's directory

```bash
$ npm install
$ cd client && npm install
```

- Before running the server, it is required to deploy an instance of Redis. The following command start an instance using Docker

```bash
$ npm run start-redis
```

### Deploying the relayer server

```
$ npm start
```

The relayer will start on port 3001

### Deploying the demo UI

```
$ cd client
$ npm start
```

## Demo instructions

You can directly play with a demo UI using the browser and Metamask by opening the client dApp on [http://localhost:3000](http://localhost:3000). You can create or query an existing bounty by Id and then execute a transaction to the `metaFulfillBounty` method through the relayer.

As an alternative, the file [relayer.postman_collection.json](relayer.postman_collection.json) contains all the HTTP request required to interact with the relayer server.

In order to test the relayer functionality, follow this steps:

1. Create a dummy bounty: POST http://localhost:3000/bounty - Use the `createDummyBounty` request on Postman.
2. Make sure what is the latest bounty id: GET http://localhost:3000/bounties - Use the `totalBounties` request on Postman.
3. Get bounty data by {bounty_id}: GET http://localhost:3000/get/bounty/{bounty_id} - Use the `getBounty` request on Postman. The console where the server is running will show that it does not have any fulfillments assigned.
4. Make a call to the `relay` endpoint using the corresponding {bounty_id} and {sender} parameters in the request body - Use the `relay` request on Postman.
5. Once the Tx is relayed. Try to execute the same method again. You'll get an error message saying "You have reached the limited quota for RelayedTx. Try again later.", as user can't make consecutive calls to this method after RELAY_TIMEOUT seconds.
6. Get the account's current cache info: GET http://localhost:3000/relay/list/{account}. It will return a `data` field until it expires
7. Get bounty data again for the same {bounty_id}. The console will show that it now has a value on the `fulfillments` property

## Bounty requirements (see [here](https://explorer.bounties.network/bounty/3078))

- [x] It should have an API endpoint which our front-end can send POST requests
- [x] Submit the signature and parameters of the function to the POST request. For instance, for the metaFulfillBounty function, the app would receive a request which includes the signature, bounty ID, array of fulfillers, data string, and nonce, along with the address which triggered it.
- [x] It's only necessary to create the endpoint for the metaFulfillBounty function, the other functions may be added at a later time.
- [x] The app should verify the integrity of the signature.
- [x] The app should verify that the user hasn't sent more than one of these transactions in the last hour.
- [x] The app should function using a wallet whose keys live within the project. It is sufficient to test this functionality using the Rinkeby network.
- [x] The app should submit txns to the infura node endpoints, and does not need to run a node as well.
