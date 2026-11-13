# Crowdline

A play-money prediction marketplace. Members create yes-or-no markets, trade
against each other in **Avenues** (play money with no cash value), and each
market's creator reports its result. New members get **1,000 Avenues free**
when they first sign in with Google, once per Google account. The site makes
money from ads; members never pay anything.

## Run it

Requires Node 22.13 or newer. There are no dependencies to install.

```sh
npm start        # http://localhost:3000
npm test
```

The **first account created is the admin**, who settles disputed results and
can void markets that break the rules.

| Variable          | Default             | Purpose                                                  |
| ----------------- | ------------------- | -------------------------------------------------------- |
| `PORT`            | `3000`              | HTTP port                                                |
| `DB_PATH`         | `data/crowdline.db` | SQLite file                                              |
| `SECURE_COOKIE`   | `false`             | `true` when serving over HTTPS                           |
| `GOOGLE_CLIENT_ID`| from `site-config`  | Overrides `googleClientId` in `src/site-config.js`       |
| `ADSENSE_CLIENT`  | from `site-config`  | Overrides `ads.client` in `src/site-config.js`           |

## Set up Google sign-in and ads

Both are configured in `src/site-config.js`. After editing it, run
`npm run build:pages` and commit, so the GitHub Pages copy picks it up.

**Google sign-in**

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project, then open **APIs & Services → OAuth consent screen**, choose
   **External**, and fill in the app name, support email, and the privacy page
   (`https://ascoding11.github.io/AK47/#/privacy`). The basic profile scopes are
   all Crowdline needs.
2. Open **Credentials → Create credentials → OAuth client ID**, choose **Web
   application**, and add every address the site is served from under
   **Authorized JavaScript origins**: `https://ascoding11.github.io`, plus
   `http://localhost:3000` for local testing and your Render address if you use one.
3. Copy the client ID into `googleClientId`.

Until `googleClientId` is set, the site falls back to username and password
accounts so it stays usable. Once it is set, new accounts come only from Google.

**Ads (Google AdSense)**

1. Apply at [AdSense](https://adsense.google.com/) with the site's address and
   wait for approval.
2. Create three display ad units and put their IDs in `ads.slots`, and your
   publisher ID (`ca-pub-…`) in `ads.client`.
3. AdSense checks for an `ads.txt` file at the **root of the domain**. The Node
   server serves it automatically. For GitHub Pages it must be at
   `https://ascoding11.github.io/ads.txt`, which means a separate repository
   named `ascoding11.github.io` containing that file. Using your own domain
   avoids this.
4. Visitors in the EEA, UK and Switzerland must be shown a consent message.
   AdSense provides one under **Privacy & messaging**.

Until `ads.client` is set, labelled "Ad space" boxes show where ads will go.
Set `ads.showPlaceholders` to `false` to hide them.

## How the marketplace works

- Each market has YES and NO contracts. A contract pays **1 Avenue** if its
  side is right and nothing if it is wrong. Balances are stored in hundredths of
  an Avenue.
- Orders are limit bids priced 1 to 99, read as a percentage of an Avenue. A YES
  bid and a NO bid trade when their prices add up to at least 100. The resting
  order gets its price and the incoming order pays the rest, so both stakes
  together fund the payout. The platform never takes a side.
- The full cost of an order leaves the buyer's balance when it is placed.
  Cancelling returns whatever has not been filled.
- A market's **creator reports the result**, and can't trade in their own
  market. Reporting stops trading. Traders then have 24 hours to dispute; an
  undisputed result pays out automatically, and a disputed one waits for an admin.
- At settlement each trader receives their payout minus a fee of 10% of their
  net profit in that market, in Avenues. A voided market returns every stake.
- Members can report markets that break the content rules.

The admin page shows where every Avenue is held and checks that the Avenues
given out equal member balances, escrow and fees kept. The test suite asserts
the same through randomized trading.

## Layout

- `src/engine.js`: server engine (accounts, matching, resolution, reporting)
- `src/local-engine.js`, `src/local-api.js`: the same engine for the browser-only build
- `src/google-auth.js`: server-side Google ID token verification
- `src/site-config.js`: Google sign-in and AdSense settings
- `server.js`: HTTP API and static file server
- `public/`: single-page web app
- `test/engine.test.js`: tests, run against both engines

## Keep it play money

Avenues must stay worthless outside the site: never sell them, let members cash
them out or transfer them, or exchange them for prizes. Any of those would turn
the site into real-money gambling, which is regulated in the US by the CFTC
and state gambling laws. See `reports/Prediction market legal liability.md`.

## Put it online

`render.yaml` describes a ready-to-deploy web service for [Render](https://render.com).
Create a Blueprint from this repository there and it will build and serve the
site at a public `onrender.com` address. On the free plan the database resets
whenever the service restarts; attach a disk and set `DB_PATH` to keep data.

## GitHub Pages version

GitHub Pages only serves static files, so it cannot run `server.js`. The
`docs/` folder holds a static build of the same app in which the exchange runs
inside each visitor's browser and saves to `localStorage`. It opens with
example markets and simulated traders, and the first account a visitor creates
is the admin of their own copy. Nothing is shared between visitors, so it is a
demo of the product, not a live marketplace. Because there is no server, it
cannot check Google's signature on a sign-in, and "once per Google account"
holds only within one browser.

After changing anything in `public/` or `src/local-*.js`, rebuild it:

```sh
npm run build:pages
```

To publish it: make the repository public, then in **Settings → Pages** choose
**Deploy from a branch**, pick the branch and the `/docs` folder, and save.
