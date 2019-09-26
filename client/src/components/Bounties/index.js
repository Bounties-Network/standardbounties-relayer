import React, { Component } from "react";
import { Box, Input, Button, Field, Select, Link } from "rimble-ui";
import { getRelayCache, relayTransaction } from "../../utils/relayer";
import { web3Networks } from "../../utils/getWeb3";
import styles from "./Bounties.module.scss";

export default class Bounties extends Component {
  state = {
    contract: null,
    relayerContract: null,
    account: null,
    totalBounties: 0,
    bountyId: "",
    bountyData: null,
    selectedMethod: "metaFulfillBounty",
    processing: false,
    relayStateMsg: "Relay Transaction",
    txHash: null
  };

  relayMethods = [
    "metaFulfillBounty",
    "metaIssueBounty",
    "metaIssueAndContribute",
    "metaContribute",
    "metaRefundContribution",
    "metaRefundMyContributions",
    "metaRefundContributions",
    "metaDrainBounty",
    "metaPerformAction",
    "metaUpdateFulfillment",
    "metaAcceptFulfillment",
    "metaFulfillAndAccept",
    "metaChangeBounty",
    "metaChangeIssuer",
    "metaChangeApprover",
    "metaChangeData",
    "metaChangeDeadline",
    "metaAddIssuers",
    "metaReplaceIssuers",
    "metaAddApprovers",
    "metaReplaceApprovers"
  ];

  constructor(props) {
    super(props);
    this.updateBountyId = this.updateBountyId.bind(this);
    this.selectMethod = this.selectMethod.bind(this);
  }

  getBountyData = async data => {
    let { contract, bountyId } = this.state;
    console.log("FETCHING BOUNTY data", data);
    let totalBounties = 0;
    let bountyData = null;
    try {
      if (data && data.events && data.events.BountyIssued) {
        bountyId = data.events.BountyIssued.returnValues._bountyId;
      }
      let rs = await contract.methods.numBounties().call();
      totalBounties = parseInt(rs.toString(10));

      if (bountyId.length > 0) {
        bountyData = await contract.methods.getBounty(bountyId).call();
        console.log("Bounty data", bountyId, bountyData);
      }
    } catch (e) {
      console.error("Error while fetching data from the StandardBounties contract", e);
    }
    this.setState({
      totalBounties,
      bountyId,
      bountyData,
      txHash: null
    });
  };

  componentDidMount = async () => {
    const { stdBountiesInstance, metaTxRelayerInstance, accounts } = this.props;
    this.setState(
      {
        contract: stdBountiesInstance,
        relayerContract: metaTxRelayerInstance,
        account: accounts[0]
      },
      this.getBountyData
    );
  };

  updateBountyId = async event => {
    this.setState({ bountyId: event.target.value, txHash: null });
  };

  getBounty = async () => {
    const { contract, bountyId } = this.state;
    console.log("Get Bounty", bountyId);
    let bountyData = await contract.methods.getBounty(bountyId).call();
    console.log("Bounty data", bountyData);
    this.setState({ bountyData, txHash: null });
  };

  selectMethod = async event => {
    console.log("selectMethod", event.target.value);
    this.setState({ selectedMethod: event.target.value, txHash: null });
  };

  getMethodParams = async method => {
    const { account, relayerContract, bountyId } = this.state;
    const { web3 } = this.props;

    const sender = web3.utils.toChecksumAddress(account);
    const latestNonce = await relayerContract.methods.replayNonce(sender).call();
    console.log("latestNonce from meta tx contract: ", latestNonce);
    const nonce = web3.utils.hexToNumber(latestNonce);
    console.log("nonce from metatx contract: ", nonce);
    let params = [];

    if (method === "metaFulfillBounty") {
      const fulfillers = [sender];
      const data = "QmSeaHjNf6MnQ94GnnkKY5qZYFEDGTqWhvG5NgZdNom1Sa";
      params = [
        { t: "address", v: relayerContract.options.address },
        { t: "string", v: method },
        { t: "uint", v: bountyId },
        { t: "address", v: fulfillers },
        { t: "string", v: data },
        { t: "uint256", v: nonce }
      ];
    }
    console.log("Params", params);

    return { available: params.length > 0, params };
  };

  relay = async () => {
    const { account, bountyId, selectedMethod, relayerContract } = this.state;
    const { web3 } = this.props;
    // const _ = web3.utils._;
    console.log("Method to Relay", bountyId, selectedMethod);
    if (relayerContract.methods[selectedMethod]) {
      this.setState({ relayStateMsg: "Processing...", processing: true });
      // const jsonInterface = relayerContract.options.jsonInterface;
      // const method = _.find(jsonInterface, o => o.name == selectedMethod);
      const sender = web3.utils.toChecksumAddress(account);
      const relayCache = await getRelayCache(sender);
      console.log("Account cache on Relay", relayCache);
      if (relayCache.data) {
        const data = relayCache.data;
        this.setState({
          relayStateMsg: "Relay Transaction",
          processing: false
        });
        alert(
          `You have already used the relayer for method "${data.method}" ${(Date.now() - parseInt(data.timestamp)) /
            1000} seconds ago`
        );
      } else {
        // getting dummy params for the specified method
        let paramsObj = await this.getMethodParams(selectedMethod);

        if (!paramsObj.available) {
          this.setState({
            relayStateMsg: "Relay Transaction",
            processing: false
          });
          alert("Method not currently supported by this Demo...");
        } else {
          const paramsHash = web3.utils.soliditySha3(...paramsObj.params);
          console.log("Params hash", paramsHash);
          // const params = web3.utils._.map(paramsObj.params, o => o.v);
          // console.log('Params list', params)

          // TODO: use EIP712
          // https://medium.com/metamask/eip712-is-coming-what-to-expect-and-how-to-use-it-bb92fd1a7a26
          try {
            this.setState({
              relayStateMsg: "Sign your transaction...",
              processing: true
            });
            let signature = await web3.eth.personal.sign(paramsHash, sender, "");
            this.setState({ relayStateMsg: "Processing..." });
            console.log("Signed msg", signature);

            let signer = web3.eth.accounts.recover(paramsHash, signature);
            console.log("Is that equal?", sender, signer);

            const data = {
              sender,
              method: selectedMethod,
              params: paramsObj.params,
              signature
            };
            let relayRS = await relayTransaction(data);
            console.log("Relay response", relayRS);
            let body = relayRS.data;
            let txHash;
            if (body.status === 200) {
              alert("Relay tx success!");
              txHash = body.txHash;
            } else {
              alert("Error during relay call. Check the console");
            }
            this.setState({
              relayStateMsg: "Relay Transaction",
              processing: false,
              txHash: txHash
            });
          } catch (error) {
            this.setState({
              relayStateMsg: "Relay Transaction",
              processing: false
            });
            alert("Error when signing and relaying transaction");
            console.error("Error when signing and relaying transaction", error);
          }
        }
      }
    }
  };

  render() {
    const { contract, totalBounties, bountyId, bountyData, txHash } = this.state;
    const { networkId } = this.props;
    return (
      <div>
        <Box fontSize={4} p={3}>
          <div style={{ textAlign: "center" }} className={styles.title}>
            <strong>Bounties</strong>
            <br />
            <span>Total: {totalBounties}</span>
          </div>
        </Box>
        {!contract && (
          <Box color="red" fontSize={3} p={3}>
            ⚠️ No Contract is deployed under this network
          </Box>
        )}
        {contract && (
          <div className={styles.dataPoint}>
            <div className={styles.label}>Contract deployed at:</div>
            <Box color="red" fontSize={1} style={{ textAlign: "center" }}>
              <div className={styles.value}>{contract._address}</div>
            </Box>
            <Field label="BountyId">
              <Input type="text" value={this.state.bountyId} onChange={this.updateBountyId} />
            </Field>
            <Button onClick={() => this.props.createDummyBounty(this.getBountyData.bind(this))} size="small">
              Create Dummy Bounty
            </Button>
            <Button ml={1} onClick={() => this.getBounty()} size="small" disabled={!this.state.bountyId}>
              Get Bounty by Id
            </Button>
            {bountyData && (
              <div>
                <Box fontSize={1} style={{ textAlign: "center" }}>
                  <div className={styles.value}>Current BountyId: {bountyId}</div>
                </Box>
                <Field label="Method to relay">
                  <Select
                    items={this.relayMethods}
                    value={this.state.selectedMethod}
                    onChange={this.selectMethod}
                    disabled={!this.state.bountyData}
                    required={true}
                  />
                </Field>
                <Button
                  onClick={() => this.relay()}
                  size="small"
                  disabled={this.state.selectedMethod.length == 0 || this.state.processing}
                >
                  {this.state.relayStateMsg}
                </Button>
                {txHash && (
                  <Box style={{ textAlign: "center" }}>
                    <Link href={web3Networks[networkId].explorerTx + txHash} target="_blank" title="Etherscan">
                      Open Transaction on Etherscan
                    </Link>
                  </Box>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}
