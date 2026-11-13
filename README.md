# Crowdline

A play-money prediction marketplace. Members create yes-or-no markets, trade
against each other in **Avenues** (play money with no cash value), and each
market's creator reports its result, which Crowdline verifies. New members get **1,000 Avenues free**
when they first sign in with Google, once per Google account. The site makes
money from ads; members never pay anything.

## Run it

Requires Node 22.13 or newer. There are no dependencies to install.

```sh
npm start        # http://localhost:3000
npm test
```

The **first account created is the admin**, who verifies every result before
it pays out and can void markets that break the rules.

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

**Google sign-in with Firebase** (used instead of the option below when set)

1. In the [Firebase console](https://console.firebase.google.com/), open your
   project, go to **Authentication → Sign-in method**, and enable **Google**.
2. Under **Authentication → Settings → Authorized domains**, add
   `ascoding11.github.io` (and your Render address if you use one; `localhost`
   is there already).
3. Under **Project settings → General → Your apps**, add a **Web app** if there
   isn't one, and copy `apiKey`, `authDomain`, `projectId` and `appId` from its
   config into `firebase` in `src/site-config.js`. These values aren't secret.

**Google sign-in without Firebase**

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
- Anyone can trade in any market, including the one they created. When the
  event happens, the creator **reports the result with a source**, which stops
  trading. Nothing pays out until an admin **verifies** it: the admin confirms
  the report or settles the market differently. Admins can also settle a market
  directly, without a report.
- At settlement every winning contract pays its holder 1 Avenue in full; there
  is no fee. A voided market returns every stake. There is no age requirement:
  it's a free game with no real money.
- Members can report markets that break the content rules.

The admin page shows where every Avenue is held and checks that the Avenues
given out equal member balances plus escrow. The test suite asserts
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
