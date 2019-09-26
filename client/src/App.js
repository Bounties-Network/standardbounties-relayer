import React, { Component } from 'react';
import getWeb3, { web3Networks } from './utils/getWeb3';
import Header from './components/Header/index.js';
import Web3Info from './components/Web3Info/index.js';
import BountiesUI from './components/Bounties/index.js';
import Instructions from './components/Instructions/index.js';
import { Loader, ToastMessage } from 'rimble-ui';

import { solidityLoaderOptions } from '../config/webpack';

import styles from './App.module.scss';

class App extends Component {
  state = {
    storageValue: 0,
    web3: null,
    accounts: null,
    contract: null,
    route: window.location.pathname.replace('/', ''),
    processing: false
  };

  // getGanacheAddresses = async () => {
  //   if (!this.ganacheProvider) {
  //     this.ganacheProvider = getGanacheWeb3();
  //   }
  //   if (this.ganacheProvider) {
  //     return await this.ganacheProvider.eth.getAccounts();
  //   }
  //   return [];
  // };

  componentDidMount = async () => {
    const hotLoaderDisabled = solidityLoaderOptions.disabled;
    let StandardBounties = {};
    let BountiesMetaTxRelayer = {};
    try {
      StandardBounties = require('../../contracts/StandardBounties.abi.json');
      BountiesMetaTxRelayer = require('../../contracts/BountiesMetaTxRelayer.abi.json');
    } catch (e) {
      console.log(e);
    }

    try {
      // Get network provider and web3 instance.
      const web3 = await getWeb3();
      let ganacheAccounts = [];
      // try {
      //   ganacheAccounts = await this.getGanacheAddresses();
      // } catch (e) {
      //   console.log('Ganache is not running');
      // }
      // Use web3 to get the user's accounts.
      const accounts = await web3.eth.getAccounts();
      // Get the contract instance.
      const networkId = await web3.eth.net.getId();
      const networkType = await web3.eth.net.getNetworkType();
      const isMetaMask = web3.currentProvider.isMetaMask;
      let balance = accounts.length > 0 ? await web3.eth.getBalance(accounts[0]) : web3.utils.toWei('0');
      balance = web3.utils.fromWei(balance, 'ether');

      let stdBountiesInstance = null;
      let metaTxRelayerInstance = null;

      let deployedNetwork = null;
      let networkData = web3Networks[networkId.toString()];
      if (StandardBounties.networks) {
        if (networkData && networkData.standardBounties) {
          stdBountiesInstance = new web3.eth.Contract(StandardBounties.abi, networkData.standardBounties);
        } else {
          deployedNetwork = StandardBounties.networks[networkId.toString()];
          if (deployedNetwork) {
            stdBountiesInstance = new web3.eth.Contract(StandardBounties.abi, deployedNetwork.address);
          }
        }
      }
      if (BountiesMetaTxRelayer.networks) {
        if (networkData && networkData.bountiesMetaTxRelayer) {
          metaTxRelayerInstance = new web3.eth.Contract(BountiesMetaTxRelayer.abi, networkData.bountiesMetaTxRelayer);
        } else {
          deployedNetwork = BountiesMetaTxRelayer.networks[networkId.toString()];
          if (deployedNetwork) {
            metaTxRelayerInstance = new web3.eth.Contract(BountiesMetaTxRelayer.abi, deployedNetwork.address);
          }
        }
      }

      if (stdBountiesInstance && metaTxRelayerInstance) {
        // Set web3, accounts, and contract to the state, and then proceed with an
        // example of interacting with the contract's methods.
        this.setState(
          {
            web3,
            ganacheAccounts,
            accounts,
            balance,
            networkId,
            networkType,
            hotLoaderDisabled,
            isMetaMask,
            stdBountiesInstance,
            metaTxRelayerInstance
          },
          () => {
            this.refreshValues(stdBountiesInstance, metaTxRelayerInstance);
            setInterval(() => {
              this.refreshValues(stdBountiesInstance, metaTxRelayerInstance);
            }, 5000);
          }
        );
      } else {
        this.setState({
          web3,
          ganacheAccounts,
          accounts,
          balance,
          networkId,
          networkType,
          hotLoaderDisabled,
          isMetaMask
        });
      }
    } catch (error) {
      // Catch any errors for any of the above operations.
      alert(`Failed to load web3, accounts, or contract. Check console for details.`);
      console.error(error);
    }
  };

  componentWillUnmount() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  refreshValues = (stdBountiesInstance, metaTxRelayerInstance) => {};

  createDummyBounty = async postEvent => {
    const { stdBountiesInstance, accounts, web3 } = this.state;

    this.setState({ processing: true });

    let sender = accounts[0];
    const issuers = [sender];
    const approvers = [sender];
    const data = 'QmSeaHjNf6MnQ94GnnkKY5qZYFEDGTqWhvG5NgZdNom1Sa';
    const deadline = '1569760282';
    const token = '0x0000000000000000000000000000000000000000';
    const tokenVersion = 0;
    const depositAmount = web3.utils.toWei('0.001', 'ether');
    console.log('payload: ', { sender, issuers, approvers, data, deadline, token, tokenVersion, depositAmount });

    console.log('estimating gas...');
    const estimateGas = await stdBountiesInstance.methods
      .issueAndContribute(sender, issuers, approvers, data, deadline, token, tokenVersion, depositAmount)
      .estimateGas({ from: sender, value: depositAmount });

    console.log('dummyBounty - estimateGas', estimateGas);

    await stdBountiesInstance.methods
      .issueAndContribute(sender, issuers, approvers, data, deadline, token, tokenVersion, depositAmount)
      .send({
        from: sender,
        gas: estimateGas,
        value: depositAmount
      })
      .on('error', (error, receipt) => {
        console.log('IssueBounty ERROR', error, receipt);
        this.setState({ processing: false });
      })
      .on('transactionHash', txHash => {
        console.log('IssueBounty TxHash', txHash);
      })
      .on('receipt', receipt => {
        console.log('IssueBounty Receipt', receipt);
        postEvent(receipt);
        this.setState({ processing: false });
      });
  };

  renderLoader() {
    return (
      <div className={styles.loader}>
        <Loader size='80px' color='red' />
        <h3> Loading Web3, accounts, and contract...</h3>
        <p> Unlock your metamask </p>
      </div>
    );
  }

  renderDeployCheck(instructionsKey) {
    return (
      <div className={styles.setup}>
        <div className={styles.notice}>
          Your <b> contracts are not deployed</b> in this network. Two potential reasons: <br />
          <p>
            Maybe you are in the wrong network? Point Metamask to localhost.
            <br />
            You contract is not deployed. Follow the instructions below.
          </p>
        </div>
        <Instructions
          ganacheAccounts={this.state.ganacheAccounts}
          name={instructionsKey}
          accounts={this.state.accounts}
        />
      </div>
    );
  }

  renderBody() {
    // const { hotLoaderDisabled, networkType, accounts, ganacheAccounts } = this.state;
    return (
      <div className={styles.wrapper}>
        {!this.state.web3 && this.renderLoader()}
        {this.state.web3 && !this.state.stdBountiesInstance && this.renderDeployCheck('StandardBounties')}
        {this.state.web3 && this.state.stdBountiesInstance && (
          <div className={styles.contracts}>
            <h1>StandardBounties Contract is good to Go!</h1>
            <p>Interact with your contract on the right.</p>
            <p> You can see your account info on the left </p>
            <div className={styles.widgets}>
              <Web3Info {...this.state} />
              <BountiesUI createDummyBounty={this.createDummyBounty} {...this.state} />
            </div>
          </div>
        )}
      </div>
    );
  }

  render() {
    const { processing } = this.state;
    return (
      <div className={styles.App}>
        {processing && (
          <ToastMessage.Processing
            style={{ position: 'fixed', zIndex: '100' }}
            message={'Blockchain Transaction in progress...'}
          />
        )}
        <Header />
        {this.state.route === '' && this.renderBody()}
      </div>
    );
  }
}

export default App;
