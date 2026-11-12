# Crowdline

A peer-to-peer prediction market exchange. Users create yes-or-no markets and
trade against each other; the platform only matches orders and keeps **10% of
each trader's profit**. It never takes a side, so it carries no market risk.

## Run it

Requires Node 22.13 or newer. There are no dependencies to install.

```sh
npm start        # http://localhost:3000
npm test
```

The **first account you register is the admin**, who resolves markets.

| Variable        | Default             | Purpose                                             |
| --------------- | ------------------- | --------------------------------------------------- |
| `PORT`          | `3000`              | HTTP port                                           |
| `DB_PATH`       | `data/crowdline.db` | SQLite file                                         |
| `DEMO_MODE`     | `true`              | `false` turns off the signup bonus and credit faucet |
| `SECURE_COOKIE` | `false`             | `true` when serving over HTTPS                      |

## How the exchange works

- Each market has YES and NO contracts. A contract pays **$1.00** if its side
  is right and nothing if it is wrong.
- Orders are limit bids in cents (1 to 99). A YES bid and a NO bid trade when
  their prices add up to at least 100. The resting order gets its price and the
  incoming order pays the rest, so both stakes together fund the $1.00 payout.
- The full cost of an order leaves the buyer's balance when it is placed.
  Cancelling returns whatever has not been filled.
- When the admin resolves a market, open orders are refunded and each trader
  receives their payout minus the fee: 10% of their net profit in that market
  (payout minus everything they paid for both sides), rounded down to the cent.
  A trader who loses or breaks even pays no fee.
- A voided market returns every stake in full with no fee.

The admin page shows where every cent is held and checks that deposits equal
customer balances, escrow and fees earned. The test suite asserts the same
through randomized trading.

## Layout

- `src/engine.js`: accounts, order matching, settlement, reporting
- `server.js`: HTTP API and static file server
- `public/`: single-page web app
- `test/engine.test.js`: engine tests

## Before taking real money

This build runs on demo credits. It has no deposits, withdrawals, identity
checks or login rate limiting, and there is no way to sell a position before
resolution other than buying the opposite side. Operating a real-money event
market is regulated in most places (in the US, by the CFTC and state gambling
law), so get legal advice and licensing before connecting payments.
