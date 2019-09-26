"use strict";

const express = require("express");
const helmet = require("helmet");
const app = express();
const fs = require("fs");
const bodyParser = require("body-parser");
const cors = require("cors");
const Redis = require("ioredis");
const JSONCache = require("redis-json");
const Web3 = require("web3");
const _ = Web3.utils._;
const HDWalletProvider = require("truffle-hdwallet-provider");
require("dotenv").config();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(helmet());
app.use(cors());

/**
 * Redis configuration
 *
 */
let networkId;
let accounts;
let redis;
let transactions = {};
let web3;
let jsonCache;

/**
 * Event listener (under development)
 *
 */
// function eventListener(contract) {
//     const eventJsonInterfaces = web3.utils._.filter(
//         contract._jsonInterface,
//         o => o.type === 'event');
//     // console.log('Subscribing to contract events', eventJsonInterfaces);
//
//     web3.eth.subscribe('logs',
//         {
//             address: contract.options.address,
//             topics: [ web3.utils._.map(eventJsonInterfaces, o => o.signature) ]
//         },
//         async (error, result) => {
//           if (!error) {
//               console.log('New Event Call!', result);
//             // const eventObj = web3.eth.abi.decodeLog(eventJsonInterface.inputs, result.data, result.topics.slice(1));
//             // console.log(`New ${eventName}!`, eventObj);
//           } else {
//               console.error('Error during logs subscription', error);
//           }
//         }
//     );
//     console.log('Subscribed to contract events');
// }

/**
 * Contract loader
 *
 */
console.log("LOADING CONTRACTS...");
const bountiesMetaTxRelayer = require("./contracts/BountiesMetaTxRelayer.abi.json");
const standardBounties = require("./contracts/StandardBounties.abi.json");
let BountiesMetaTxRelayer;
let StandardBounties;

///////////////////////

/**
 * Query data on Redis cache
 *
 */
function queryCache(key) {
  return new Promise(async (resolve, reject) => {
    try {
      const cache = await jsonCache.get(key);
      resolve(cache);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Cache data related to a user relayed transaction
 * @key Record key composed by ${sender_address}-${method_name}
 * @method Method name being called by relayed Tx
 * @signer Account of owner who signed the Tx
 * @params Parameters associated to the method executed by relayed Tx
 *
 */
function cacheRelayedTx(key, method, signer, params, txHash) {
  return new Promise(async (resolve, reject) => {
    try {
      const transaction = {
        method,
        signer,
        params,
        txHash,
        timestamp: Date.now()
      };
      await jsonCache.set(key, transaction, {
        expire: process.env.RELAY_TIMEOUT || 60 * 60
      });
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Return relayer config parameters
 *
 */
app.get("/", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.set("Content-Type", "application/json");
  const config = {
    http_provider: process.env.INFURA_HTTP_PROVIDER,
    network_id: networkId,
    relayer_address: accounts[process.env.RELAYER_ACC_INDEX || 0],
    relayer_contract: process.env.BOUNTIES_METATX_RELAYER_ADDRESS,
    bounties_contract: process.env.STANDARD_BOUNTIES_ADDRESS,
    status: "live"
  };
  console.log("/", config);
  res.end(JSON.stringify(config));
});

/**
 * Gets latest relayed information about an account
 *
 */
app.get("/relay/list/:address", async (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.set("Content-Type", "application/json");
  console.log("/sub/list", req.params);

  const method = "metaFulfillBounty"; // TODO:
  const key = `${req.params.address}-${method}`;
  const latestNonce = await BountiesMetaTxRelayer.methods.replayNonce(req.params.address).call();
  const nonce = web3.utils.hexToNumber(latestNonce);
  try {
    const data = await queryCache(key);
    let result = {
      data,
      // nonce: await getNonce(req.params.address)
      nonce
    };
    console.log(!result.data);
    res.end(JSON.stringify(result));
  } catch (err) {
    console.log(err);
    next(err);
  }
});

/**
 * Just for testing Redis cache expiry
 *
 */
// app.get('/relay/new/:address', async(req, res) => {
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.set('Content-Type', 'application/json');
//   console.log('/sub/new', req.params);

//   const method = 'metaFulfillBounty';
//   const key = `${req.params.address}-${method}`;

//   await cacheRelayedTx(key, method, req.params.address, {});
//   await updateNonce(req.params.address, 0);
//   res.end(JSON.stringify({'done': 'done'}))
// });

/**
 * Just for testing purposes. Get total created bounties
 */
app.get("/bounties", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.set("Content-Type", "application/json");

  let totalBounties = await StandardBounties.methods.numBounties().call();
  res.end(JSON.stringify({ totalBounties: totalBounties.toString(10) }));
});

/**
 * Just for testing purposes. It creates a new dummy bounty
 *
 */
app.post("/bounty", async (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.set("Content-Type", "application/json");

  // const sender = web3.utils.toChecksumAddress("0x6c72959f2b9523e9e9b8f99549fe65e7080f18aa", networkId);
  let sender = accounts[process.env.RELAYER_ACC_INDEX || 0];
  const issuers = [sender];
  const approvers = [sender];
  const data = "QmQJiZBaiHybUBRuEngcZGY9PzUEtyNDYt8RaCWPNzanrV";
  const deadline = "1569760282";
  const token = "0x0000000000000000000000000000000000000000";
  const tokenVersion = 0;
  const depositAmount = web3.utils.toWei("0.001", "ether");

  // const owner = await StandardBounties.methods.owner.call();
  // res.end(JSON.stringify( owner ));
  console.log("estimating gas...");
  const estimateGas = await StandardBounties.methods
    .issueAndContribute(sender, issuers, approvers, data, deadline, token, tokenVersion, depositAmount)
    .estimateGas({ from: sender, value: depositAmount });
  console.log("/bounty - estimateGas", estimateGas);
  StandardBounties.methods
    .issueAndContribute(sender, issuers, approvers, data, deadline, token, tokenVersion, depositAmount)
    .send({
      from: sender,
      gas: estimateGas + 21000,
      gasPrice: 20000000000,
      value: depositAmount
    })
    .on("error", (error, receipt) => {
      console.log("IssueBounty ERROR", error, receipt);
      next(error);
    })
    .on("transactionHash", txHash => {
      console.log("IssueBounty TxHash", txHash);
      res.end(JSON.stringify(txHash));
    })
    .on("receipt", receipt => console.log("IssueBounty Receipt", receipt));

  // res.end(JSON.stringify( estimateGas ));
});

/**
 * Just for testing purposes. Get bounty data by its id
 *
 */
app.get("/get/bounty/:id", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  console.log("/get/bounty/", req.params.id);

  const bounty = await StandardBounties.methods.getBounty(req.params.id).call();
  console.log(bounty);
  res.end(JSON.stringify(bounty));
});

/**
 * Just for testing purposes. Set the metaTxRelayer address on the StandardBounties contract
 * It it currently done during smart contract deployment with truffle (deprecated)
 */
// app.get('/relay/set', async (req, res) => {
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   console.log("/relay/set", req.body);
//   const currentRelayer = await StandardBounties.methods.metaTxRelayer.call()
//   console.log('CURRENT RELAYER', currentRelayer, typeof(currentRelayer))
//   console.log('Relayer contract address', BountiesMetaTxRelayer.address)
//   // res.end(JSON.stringify({done: 'done'}))
//   if (currentRelayer == "0x0000000000000000000000000000000000000000") {

//     const estimateGas = await StandardBounties.methods.setMetaTxRelayer(BountiesMetaTxRelayer.address).estimateGas()
//     StandardBounties.methods.setMetaTxRelayer(BountiesMetaTxRelayer.address)
//       .send({
//         from: accounts[process.env.RELAYER_ACC_INDEX || 0],
//         gas: estimateGas, gasPrice: 20000000000
//       })
//       .on('error', (error, receipt) => {
//         console.log('setMetaTxRelayer ERROR', error, receipt);
//         res.end(JSON.stringify( error ));
//       })
//       .on('transactionHash', (txHash) => {
//         console.log('setMetaTxRelayer TxHash', txHash);
//         res.end(JSON.stringify({done: 'done'}))
//       })
//       .on('receipt', (receipt) => console.log('setMetaTxRelayer Receipt', receipt))
//   } else {
//     res.end(JSON.stringify({done: 'Relayer already set'}))
//   }
// })

/**
 * Get the next available nonce on the relayer for an account
 */
app.get("/relay/nonce/:account", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.set("Content-Type", "application/json");
  console.log("/relay/nonce/", req.params);

  let latestNonce;
  if (req.params.account) {
    latestNonce = await BountiesMetaTxRelayer.methods.replayNonce(req.params.account).call();
  }
  res.end(
    JSON.stringify({
      latestNonce: latestNonce ? web3.utils.hexToNumber(latestNonce) : null
    })
  );
});

/**
 * Main method to relay a transaction. The parameters needed to be sent in the request body are:
 * {
 * sender
 * method
 * bountyId
 * fulfillers
 * data
 * }
 *
 * Logic: Tx is relayed if no associated data is found on cache (a user either never used the relayer or data
 * has expired due to time window configuration).
 *
 * Function verifies that the sender actually signed the Tx
 *
 * For testing purposes, tx is signed within this method by an account
 * with NO_ETH_USER_PK as private key.
 *
 */
app.post("/relaydemo", async (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.set("Content-Type", "application/json");
  console.log("/relaydemo", req.body);

  const RELAYER_ADDRESS = accounts[process.env.RELAYER_ACC_INDEX || 0];

  // Just for testing purposes
  const accountPK = process.env.NO_ETH_USER_PK;

  const relayedTxKey = `${req.body.sender}-${req.body.method}`;
  try {
    const cache = await queryCache(relayedTxKey);

    if (!cache) {
      // const nonce = parseInt(await getNonce(req.body.sender)) || 0;
      const latestNonce = await BountiesMetaTxRelayer.methods.replayNonce(req.body.sender).call();
      const nonce = await web3.utils.hexToNumber(latestNonce);
      const sender = web3.utils.toChecksumAddress(req.body.sender);
      const bountyId = req.body.bountyId;
      const fulfillers = JSON.parse(req.body.fulfillers);
      const data = req.body.data;

      // Metafulfill
      const params = [
        ["address", "string", "uint", "address[]", "string", "uint256"],
        [BountiesMetaTxRelayer.options.address, req.body.method, bountyId, fulfillers, data, nonce]
      ];

      console.log("Params", params);
      const paramsHash = web3.eth.abi.encodeParameters(...params);
      console.log("Params hash", paramsHash);

      let signed = web3.eth.accounts.sign(paramsHash, accountPK);
      const signature = signed.signature;
      console.log("Signed msg", signature);
      // // "0x9550c53e9ea599bb8a71e2064a8d0f7a749874eb7a50179500fa538aed5ec99b351e5f459abb9a738bd4f345bcad4cb550f6743437a3d24c2611d2968839f2351c", "0x19408022fEF63aCc8A69CdCDc66822688A8F25cc", 0, ["0x0aD7dc90A03BAc20284Df4b70Dc4CAF3c74Cc3fA"], "Qmd5u7XVJuN3WiZ1o1R7GphVCcp6Njefx7veDTmW5C9vsp", 0

      let signer = web3.eth.accounts.recover(paramsHash, signature);
      console.log("Is that equal?", sender, signer);

      if (signer == sender) {
        // // Actual relayed TX
        const estimateGas = await BountiesMetaTxRelayer.methods
          .metaFulfillBounty(signature, bountyId, fulfillers, data, nonce)
          .estimateGas({ from: RELAYER_ADDRESS });
        console.log("ESTIMATED GAS", estimateGas);
        BountiesMetaTxRelayer.methods
          .metaFulfillBounty(signature, bountyId, fulfillers, data, nonce)
          .send({
            from: RELAYER_ADDRESS,
            gas: estimateGas,
            gasPrice: 20000000000
          })
          .on("error", (error, receipt) => {
            console.log("metaFulfillBounty ERROR", error, receipt);
            res.end(JSON.stringify({ status: 500, message: error }));
          })
          .on("transactionHash", async txHash => {
            console.log("metaFulfillBounty TxHash", txHash);
            // UPDATE CACHE TO CONTROL RELAYED META TX QUOTA PER USER
            await cacheRelayedTx(relayedTxKey, req.body.method, sender, {
              signature,
              bountyId,
              fulfillers,
              data,
              nonce
            });
            res.end(JSON.stringify({ status: 200, next_nonce: nonce + 1 }));
          })
          .on("receipt", receipt => console.log("metaFulfillBounty Receipt", receipt));
      } else {
        res.end(
          JSON.stringify({
            status: 400,
            message: "Sender didn't signed this transaction"
          })
        );
      }
    } else {
      res.end(
        JSON.stringify({
          status: 400,
          message: "You have reached the limited quota for RelayedTx. Try again later."
        })
      );
    }
  } catch (err) {
    console.error(err);
    next(err);
  }
});

/**
 * Main method to relay a transaction. The parameters needed to be sent in the request body are:
 * {
 * sender
 * method
 * bountyId
 * fulfillers
 * data
 * }
 *
 * Logic: Tx is relayed if no associated data is found on cache (a user either never used the relayer or data
 * has expired due to time window configuration).
 *
 * Function verifies that the sender actually signed the Tx
 *
 * For testing purposes, tx is signed within this method by an account
 * with NO_ETH_USER_PK as private key.
 *
 */
app.post("/relay", async (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.set("Content-Type", "application/json");
  console.log("/relay", req.body);

  const RELAYER_ADDRESS = accounts[process.env.RELAYER_ACC_INDEX || 0];

  const sender = req.body.sender;
  const method = req.body.method;
  const params = req.body.params;
  const signature = req.body.signature;

  const relayedTxKey = `${sender}-${method}`;
  try {
    const cache = await queryCache(relayedTxKey);

    if (!cache) {
      console.log("Params", params);

      const paramsHash = web3.eth.abi.encodeParameters(...params);
      console.log("Params hash", paramsHash);

      console.log("Signed msg", signature);
      // // "0x9550c53e9ea599bb8a71e2064a8d0f7a749874eb7a50179500fa538aed5ec99b351e5f459abb9a738bd4f345bcad4cb550f6743437a3d24c2611d2968839f2351c", "0x19408022fEF63aCc8A69CdCDc66822688A8F25cc", 0, ["0x0aD7dc90A03BAc20284Df4b70Dc4CAF3c74Cc3fA"], "Qmd5u7XVJuN3WiZ1o1R7GphVCcp6Njefx7veDTmW5C9vsp", 0

      let signer = web3.eth.accounts.recover(paramsHash, signature);
      console.log("Is that equal?", sender, signer);

      if (signer == sender) {
        // Omit the firt two parameters (BountiesMetaTxRelayer address, method)
        const methodParams = params[1].slice(2, params[1].length);
        console.log("MetaTX contract method Params list", methodParams);

        try {
          const estimateGas = await BountiesMetaTxRelayer.methods[req.body.method](
            signature,
            ...methodParams
          ).estimateGas({
            from: RELAYER_ADDRESS
          });
          console.log(`ESTIMATED GAS for ${method}`, estimateGas);

          BountiesMetaTxRelayer.methods[method](signature, ...methodParams)
            .send({
              from: RELAYER_ADDRESS,
              gas: estimateGas,
              gasPrice: 200000000
            })
            .on("error", (error, receipt) => {
              if (typeof error.message === "string" && error.message.includes("nonce too low")) {
                console.info("*** KILLING PROCESS because nonce is to low; web3 instance most likely out of sync ***");
                process.exit(1);
              }
              console.log(`ERROR while executing method ${method}`, error, receipt);
              res.end(
                JSON.stringify({
                  status: 500,
                  message: `ERROR while executing method ${method}`
                })
              );
            })
            .on("transactionHash", async txHash => {
              console.log(`${req.body.method} TxHash`, txHash);
              // UPDATE CACHE TO CONTROL RELAYED META TX QUOTA PER USER
              await cacheRelayedTx(relayedTxKey, method, sender, methodParams, txHash);
              res.end(JSON.stringify({ status: 200, txHash }));
            })
            .on("receipt", receipt => console.log(`${method} Receipt`, receipt));
        } catch (error) {
          console.error(`ERROR while relaying method "${method}"`, error);
          res.end(
            JSON.stringify({
              status: 500,
              message: `ERROR while relaying method "${method}"`
            })
          );
        }
      } else {
        res.end(
          JSON.stringify({
            status: 400,
            message: "Sender didn't signed this transaction"
          })
        );
      }
    } else {
      res.end(
        JSON.stringify({
          status: 400,
          message: "You have reached the limited quota for RelayedTx. Try again later."
        })
      );
    }
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// Deploying the relayer
(async () => {
  redis = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379
  });

  redis.on("error", error => {
    console.error("Error while trying to connect to Redis", error);
    process.exit(1);
  });
  redis.on("connect", () => {
    console.info("REDIS CONNECTED to: ", process.env.REDIS_HOST);
  });
  jsonCache = new JSONCache(redis, { prefix: "cache:" });
  /**
   * Connecting to a Web3 endpoint and loading relayer accounts
   *
   */
  console.log("Loading Web3 with Provider", process.env.INFURA_HTTP_PROVIDER);
  if (!process.env.INFURA_HTTP_PROVIDER) {
    console.error("INFURA_HTTP_PROVIDER not found");
    process.exit(1);
  }

  if (process.env.MNEMONIC) {
    console.log("Loading Web3 with MNEMONIC");
    web3 = new Web3(new HDWalletProvider(process.env.MNEMONIC, process.env.INFURA_HTTP_PROVIDER));
  } else {
    web3 = new Web3(new Web3.providers.HttpProvider(process.env.INFURA_HTTP_PROVIDER));
  }

  const contractsPromise = new Promise(async (resolve, reject) => {
    try {
      let BountiesMetaTxRelayer = await new web3.eth.Contract(
        bountiesMetaTxRelayer.abi,
        process.env.BOUNTIES_METATX_RELAYER_ADDRESS
      );
      let StandardBounties = await new web3.eth.Contract(standardBounties.abi, process.env.STANDARD_BOUNTIES_ADDRESS);
      // eventListener(StandardBounties)
      resolve([BountiesMetaTxRelayer, StandardBounties]);
    } catch (error) {
      reject(error);
    }
  });

  contractsPromise
    .then(contracts => {
      console.log("CONTRACTS LOADED!!");
      BountiesMetaTxRelayer = contracts[0];
      StandardBounties = contracts[1];
    })
    .catch(err => {
      console.error("ERROR Loading contracts", err);
      process.exit(1);
    });

  web3.eth.net.getId().then(id => {
    networkId = id;
    console.log(`Setting Network config: networkId: ${networkId}`);
  });

  const BN = web3.utils.BN;

  async function getAccountBalance(account) {
    const balance = await web3.eth.getBalance(accounts[0]);
    console.log("Relay account current balance:", `${balance} Wei = ${web3.utils.fromWei(balance, "ether")} ETH`);
    return balance;
  }

  async function hasEnoughBalance(account, minBalance) {
    const balance = await getAccountBalance(account);
    return new BN(balance).gt(new BN(minBalance));
  }

  web3.eth
    .getAccounts()
    .then(async _accounts => {
      accounts = _accounts;
      console.log("UNLOCKED ACCOUNTS? ", accounts);
      const balanceResultGT = await hasEnoughBalance(accounts[process.env.RELAYER_ACC_INDEX], "0");
      console.log("balanceResultGT", balanceResultGT);

      if (!balanceResultGT) {
        console.error("Relay account does not have enough funds");
        // process.exit(1);
      }
      app.listen(process.env.PORT || 3000);
      console.log(`Relayer is running on port ${process.env.PORT || 3000}`);
    })
    .catch(err => {
      console.error("ERROR LOADING ACCOUNTS");
      console.error(err);
      process.exit(1);
    });
})();
