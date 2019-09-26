import axios from 'axios';

const RELAYER_BASE_URI = 'https://standardbounties-relayer.jx-staging.bounties-network-flow.com';

const getTotalBounties = () =>
  new Promise(async (resolve, reject) => {
    try {
      const rs = await axios.get(`${RELAYER_BASE_URI}/bounties`);
      resolve(rs);
    } catch (e) {
      reject(e);
    }
  });

const getRelayCache = account =>
  new Promise(async (resolve, reject) => {
    try {
      const rs = await axios.get(`${RELAYER_BASE_URI}/relay/list/${account}`);
      console.log(`${RELAYER_BASE_URI}/relay/list/${account}: `, rs);
      resolve(rs.data);
    } catch (e) {
      reject(e);
    }
  });

const relayTransaction = data =>
  new Promise(async (resolve, reject) => {
    try {
      const rs = await axios.post(`${RELAYER_BASE_URI}/relay`, data);
      resolve(rs);
    } catch (e) {
      reject(e);
    }
  });

export { getTotalBounties, getRelayCache, relayTransaction };
