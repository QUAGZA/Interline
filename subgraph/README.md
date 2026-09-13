# Interline Sepolia subgraph

Indexes pool and direct activity on Ethereum Sepolia for the dashboard Activity feed. It does not replace MarketLens RPC reads for balances.

## Deploy

```bash
cd subgraph
npm install
npx graph codegen
npx graph build
```

In [The Graph Studio](https://thegraph.com/studio/):

1. Create a subgraph, network **Sepolia**.
2. `npx graph auth --studio <DEPLOY_KEY>`
3. `npx graph deploy --studio <SUBGRAPH_SLUG>`

Start block is `11695332` from `deployments/11155111/v2.json`. After it syncs, paste the GraphQL query URL into `NEXT_PUBLIC_GRAPH_URL`. Leave it empty on Anvil.

Factories:

- MarketFactory `0x643ab12224e115147d158C93511E91c27e79AEE2`
- DirectFacilityFactory `0x28910328557620935Aac0b76dDc1f2E18cdB2010`
