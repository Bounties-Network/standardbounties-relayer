"use strict";
const express = require('express');
const helmet = require('helmet');
const app = express();
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const Redis = require('ioredis');
const JSONCache = require('redis-json');
const Web3 = require('web3');
const HDWalletProvider = require("truffle-hdwallet-provider");
require('dotenv').config();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(helmet());
app.use(cors())

const redis = (true) ? new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379
}):null;

const jsonCache = new JSONCache(redis, {prefix: 'cache:'});

let transactions = {};
let web3;

console.log("Loading Web3 with Provider", process.env.HTTP_ETH_PROVIDER);
if (!process.env.HTTP_ETH_PROVIDER) {
  process.exit(1)
}

if (process.env.MNEMONIC) {
  console.log("Loading Web3 with MNEMONIC");
  web3 = new Web3(new HDWalletProvider(process.env.mnemonic, process.env.HTTP_ETH_PROVIDER));
} else {
  web3 = new Web3(new Web3.providers.HttpProvider(process.env.HTTP_ETH_PROVIDER));
}

let networkId;
let relayedTxListKey;
web3.eth.net.getId().then((id) => {
  networkId = id;
  relayedTxListKey = `relayed_tx_net_${networkId}`;
  console.log(`Setting Network config: networkId: ${networkId} Redis Relayed Tx List: ${relayedTxListKey}`);
});

let accounts;
web3.eth.getAccounts().then( (_accounts) => {
  accounts = _accounts;
  console.log("UNLOCKED ACCOUNTS? ", accounts);
});

console.log("LOADING CONTRACTS");
const bountiesMetaTxRelayer = require('./contracts/BountiesMetaTxRelayer.abi.json');
const standardBounties = require('./contracts/StandardBounties.abi.json');
let BountiesMetaTxRelayer;
let StandardBounties;

function eventListener(contract) {
  contract.events.BountyIssued({fromBlock: 0}, (error, event) => {
    console.log('new BountyIssued event ==> ', event && event.returnValues)
    console.log('BountyIssued error?    ==> ', error && 'yes')
  })
}

const contractsPromise = new Promise(async (resolve, reject) => {
  try {
    let BountiesMetaTxRelayer = await new web3.eth.Contract(bountiesMetaTxRelayer.abi, process.env.BOUNTIES_METATX_RELAYER_ADDRESS);
    let StandardBounties = await new web3.eth.Contract(standardBounties.abi, process.env.STANDARD_BOUNTIES_ADDRESS);
    // eventListener(StandardBounties)
    resolve( [BountiesMetaTxRelayer, StandardBounties] );
  } catch(error) {
    reject(error);
  }
});

contractsPromise.then((contracts) => {
  console.log('CONTRACTS LOADED!!');
  BountiesMetaTxRelayer = contracts[0];
  StandardBounties = contracts[1];
}).catch((err) => console.log('ERROR Loading contracts', err));

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

function cacheRelayedTx(key, method, signer, params) {
  return new Promise(async (resolve, reject) => {
    try {
      const transaction = {
        method,
        signer,
        params,
        timestamp: Date.now()
      };
      await jsonCache.set(key, transaction, {expire: process.env.RELAY_TIMEOUT || 60 * 60});
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function getNonce(account) {
  return new Promise(async (resolve, reject) => {
    try {
      const cache = await redis.get(`${account}-nonce`);
      resolve(cache);
    } catch (error) {
      reject(error);
    }
  });
}

function updateNonce(account, nonce) {
  return new Promise(async (resolve, reject) => {
    try {
      await redis.set(`${account}-nonce`, nonce);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

app.get('/', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.set('Content-Type', 'application/json');
  const config = {
    http_provider: process.env.HTTP_ETH_PROVIDER,
    network_id: networkId,
    relayer_address: accounts[process.env.RELAYER_ACC_INDEX || 0],
    relayer_contract: process.env.BOUNTIES_METATX_RELAYER_ADDRESS,
    bounties_contract: process.env.STANDARD_BOUNTIES_ADDRESS,
    status: 'live'
  };
  console.log("/", config);
  res.end(JSON.stringify( config ));

});

app.get('/relay/list/:address', async(req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.set('Content-Type', 'application/json');
  console.log('/sub/list', req.params);

  const method = 'metaFulfillBounty';
  const key = `${req.params.address}-${method}`

  let result = {
    data: await queryCache(key),
    nonce: await getNonce(req.params.address)
  }
  console.log(!result.data)
  res.end(JSON.stringify(result));
});

app.get('/relay/new/:address', async(req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.set('Content-Type', 'application/json');
  console.log('/sub/new', req.params);

  const method = 'metaFulfillBounty';
  const key = `${req.params.address}-${method}`;

  await cacheRelayedTx(key, method, req.params.address, {});
  await updateNonce(req.params.address, 0);
  res.end(JSON.stringify({'done': 'done'}))
});

app.get('/bounty', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.set('Content-Type', 'application/json');

  // const sender = web3.utils.toChecksumAddress("0x6c72959f2b9523e9e9b8f99549fe65e7080f18aa", networkId);
  let sender = accounts[process.env.RELAYER_ACC_INDEX || 0];
  const issuers = [sender];
  const approvers = [sender];
  const data = "Qmd5u7XVJuN3WiZ1o1R7GphVCcp6Njefx7veDTmW5C9vsp"
  const deadline = Date.now() + 60 * 60 * 24 * 5;
  const token = "0x0000000000000000000000000000000000000000";
  const tokenVersion = 0;
  const depositAmount = web3.utils.toWei("0.1", 'ether')

  // const owner = await StandardBounties.methods.owner.call();
  // res.end(JSON.stringify( owner ));
  const estimateGas = await StandardBounties.methods.issueAndContribute(sender, issuers, approvers, data, deadline, token, tokenVersion, depositAmount).estimateGas()
  StandardBounties.methods.issueAndContribute(sender, issuers, approvers, data, deadline, token, tokenVersion, depositAmount)
    .send({
      from: sender, 
      gas: estimateGas + 21000, gasPrice: 20000000000,
      value: depositAmount
    })
    .on('error', (error, receipt) => {
      console.log('IssueBounty ERROR', error, receipt);
      res.end(JSON.stringify( error ));
    })
    .on('transactionHash', (txHash) => {
      console.log('IssueBounty TxHash', txHash);
      res.end(JSON.stringify( txHash ));
    })
    .on('receipt', (receipt) => console.log('IssueBounty Receipt', receipt))
  
  // res.end(JSON.stringify( estimateGas ));


});

app.get('/get/bounty/:id', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  console.log("/get/bounty/", req.params.id);

  const bounty = await StandardBounties.methods.getBounty(req.params.id).call();
  console.log(bounty)
  res.end(JSON.stringify( bounty ))

})

app.get('/relay/set', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  console.log("/relay/set", req.body);
  const currentRelayer = await StandardBounties.methods.metaTxRelayer.call()
  console.log('CURRENT RELAYER', currentRelayer, typeof(currentRelayer))
  console.log('Relayer contract address', BountiesMetaTxRelayer.address)
  // res.end(JSON.stringify({done: 'done'}))
  if (currentRelayer == "0x0000000000000000000000000000000000000000") {

    const estimateGas = await StandardBounties.methods.setMetaTxRelayer(BountiesMetaTxRelayer.address).estimateGas()
    StandardBounties.methods.setMetaTxRelayer(BountiesMetaTxRelayer.address)
      .send({
        from: accounts[process.env.RELAYER_ACC_INDEX || 0],
        gas: estimateGas, gasPrice: 20000000000
      })
      .on('error', (error, receipt) => {
        console.log('setMetaTxRelayer ERROR', error, receipt);
        res.end(JSON.stringify( error ));
      })
      .on('transactionHash', (txHash) => {
        console.log('setMetaTxRelayer TxHash', txHash);
        res.end(JSON.stringify({done: 'done'}))
      })
      .on('receipt', (receipt) => console.log('setMetaTxRelayer Receipt', receipt))
  } else {
    res.end(JSON.stringify({done: 'Relayer already set'}))
  }
})

app.post('/nonce/clear', async (req, res) => {
// app.get('/relay/:nonce', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.set('Content-Type', 'application/json');
  console.log("/relay/clear", req.body);

  await redis.set(`${req.body.account}-nonce`, 0)
  res.end(JSON.stringify({message: 'Nonce cache reset successfully!'}))
});

app.post('/relay', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.set('Content-Type', 'application/json');
  console.log("/relay", req.body);

  const RELAYER_ADDRESS = accounts[process.env.RELAYER_ACC_INDEX || 0]

  // Just for testing purposes
  const accountPK = "0xbee1a361b125d5ddb710427d2a39a8c57cda73100ae4223d6dbaa283ab167a40";
  

  const relayedTxKey = `${req.body.sender}-${req.body.method}`;
  const cache = await queryCache(relayedTxKey);
  const nonce = parseInt(await getNonce(req.body.sender)) || 0;
  const sender = web3.utils.toChecksumAddress(req.body.sender);
  const bountyId = req.body.bountyId;
  const fulfillers = JSON.parse(req.body.fulfillers);
  const data = req.body.data;

  if (!cache) {
    const params = [
      {t: 'address', v: BountiesMetaTxRelayer.address},
      {t: 'string', v: req.body.method},
      {t: 'uint', v: bountyId},
      {t: 'address', v: fulfillers},
      {t: 'string', v: data},
      {t: 'uint256', v: nonce}
    ]
    console.log('Params', params)
    const paramsHash = web3.utils.soliditySha3(...params)
    console.log('Params hash', paramsHash)

    let signed = web3.eth.accounts.sign(paramsHash, accountPK)
    const signature = signed.signature
    console.log('Signed msg', signature)
    // // "0x9550c53e9ea599bb8a71e2064a8d0f7a749874eb7a50179500fa538aed5ec99b351e5f459abb9a738bd4f345bcad4cb550f6743437a3d24c2611d2968839f2351c", "0x19408022fEF63aCc8A69CdCDc66822688A8F25cc", 0, ["0x0aD7dc90A03BAc20284Df4b70Dc4CAF3c74Cc3fA"], "Qmd5u7XVJuN3WiZ1o1R7GphVCcp6Njefx7veDTmW5C9vsp", 0

    let signer = web3.eth.accounts.recover(paramsHash, signature)
    console.log('Is that equal?', sender, signer)

    if(signer == sender) {
      // // Actual relayed TX
      const estimateGas = await BountiesMetaTxRelayer.methods.metaFulfillBounty(signature, bountyId, fulfillers, data, nonce).estimateGas()
      console.log('ESTIMATED GAS', estimateGas)
      BountiesMetaTxRelayer.methods.metaFulfillBounty(signature, bountyId, fulfillers, data, nonce)
        .send({
          from: RELAYER_ADDRESS,
          gas: estimateGas, gasPrice: 20000000000
        })
        .on('error', (error, receipt) => {
          console.log('metaFulfillBounty ERROR', error, receipt);
          res.end(JSON.stringify( {status: 500, message: error} ));
        })
        .on('transactionHash', async (txHash) => {
          console.log('metaFulfillBounty TxHash', txHash);
          await cacheRelayedTx(relayedTxKey, req.body.method, sender, {
            signature, bountyId, fulfillers, data, nonce
          });
          await updateNonce(req.body.sender, nonce + 1);
          res.end(JSON.stringify({status: 200, next_nonce: nonce + 1}))
        })
        .on('receipt', (receipt) => console.log('metaFulfillBounty Receipt', receipt))
    } else {
      res.end(JSON.stringify({status: 400, message: "Sender didn't signed this transaction"}));
    }
  } else {
    res.end(JSON.stringify({status: 400, message: 'You have reached the limited quota for RelayedTx. Try again later.'}))
  }
});

app.listen(process.env.PORT || 3000);
console.log(`Relayer is running on port ${process.env.PORT || 3000}`);
