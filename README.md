# Payvacy

**Pay without limits. Stay untraceable.**

[![Live site](https://img.shields.io/badge/live-payvacy.fun-92f664?style=flat-square&labelColor=020404)](https://payvacy.fun)
[![Chain](https://img.shields.io/badge/chain-Solana-92f664?style=flat-square&labelColor=020404)](https://solana.com)

| | |
|---|---|
| Chain | Solana |
| Contract address | `pending` |
| Site | https://payvacy.fun |

## Overview

Payvacy is a payment layer for Solana built around a communal vault. Funds enter the vault once, and later transfers leave it in batches, so the sender recorded on-chain is the vault rather than your own wallet.

This repository holds the project site: a static, dependency-free page that also carries a live market board.

## Features

- Live board of the ten Solana tokens with the heaviest 24h volume, with a matching ticker
- Contract address slot that stays inert until an address is stated, then becomes click-to-copy
- Register-driven records: every external fact (chain, contract, socials, market source) lives in one file with a state of `stated`, `absent` or `unconfirmed`
- Reduced-motion support throughout

## Links

- Site: https://payvacy.fun
- X: https://x.com/payvacy
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)

## Development

```bash
npm install
npm run build   # writes the deployable site to dist/
npm run gates   # builds, then runs every check
```

Upload the contents of `dist/` to any static host.

## License

MIT. See [LICENSE](LICENSE).
