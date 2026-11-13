# Federal (non-CEA) exposure of a P2P online betting exchange: gambling statutes, money transmission/AML, securities, tax (as of 2026-11-13)

Research-method note: This session's network sandbox blocked direct fetches of uscode.house.gov, ecfr.gov, law.cornell.edu, stripe.com, everycrsreport.com and duanemorris.com, so the statute and regulation text below is cited to the official URLs. The well-known text is stated from established knowledge and was not re-fetched in this session. Items marked "[not re-verified]" should be checked against the linked primary source before publication. Search-result snippets were used for the 2025-2026 developments.

Fact pattern assumed: users create yes/no markets on politics, sports, economics and culture. Users bet against each other through an order book on contracts that pay $1. The platform never takes a side, holds both stakes in escrow until settlement and keeps 10% of each winner's profit. It has no registration or licence of any kind, and the founder plans to argue it is "just a marketplace."

---

## 1. Wire Act (18 U.S.C. § 1084): scope and application to a matching/commission operator

### Takeaway
After *New Hampshire Lottery Commission v. Rosen* (1st Cir. 2021) and *In re MasterCard* (5th Cir. 2002), the Wire Act is best read as covering only bets on **sporting events or contests**. The platform's sports markets are squarely exposed. Its political, economic and culture markets are probably outside § 1084, although DOJ's 2018 OLC opinion has never been formally withdrawn outside the First Circuit. An operator that matches bettors and takes a commission on winnings very likely counts as "engaged in the business of betting or wagering". The "just a marketplace" label is not a recognized defence.

### Cited Findings
- **Text.** § 1084(a) punishes "whoever being engaged in the business of betting or wagering knowingly uses a wire communication facility for the transmission in interstate or foreign commerce of bets or wagers or information assisting in the placing of bets or wagers on any sporting event or contest, or for the transmission of a wire communication which entitles the recipient to receive money or credit as a result of bets or wagers, or for information assisting in the placing of bets or wagers". The penalty is a fine, up to 2 years' imprisonment, or both. § 1084(b) is a safe harbor for news reporting and for transmitting information that assists betting between two jurisdictions where that betting is legal. [not re-verified] — [18 U.S.C. § 1084](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1084&num=0&edition=prelim)
- **Who is covered.** The Act is addressed to persons "engaged in the business of betting or wagering". It applies to people operating a betting business, not to the customers who use it. A CRS report says courts require proof that the defendant "regularly devoted time, attention and labor to betting or wagering for profit." — [CRS RS21984 (via search)](https://www.everycrsreport.com/reports/RS21984.html); [CRS 97-619 (2012)](https://www.everycrsreport.com/files/20120124_97-619_93d3541d977fd6a8ee3f734360512ef731ed8be7.html)
- **United States v. Cohen, 260 F.3d 68 (2d Cir. July 31, 2001).** The court affirmed the Wire Act conviction of Jay Cohen, a US citizen who ran World Sports Exchange, an online and telephone sportsbook in Antigua that took bets from New York customers. It is the leading precedent that an offshore internet sports-betting operator serving US customers violates § 1084. — [Justia](https://law.justia.com/cases/federal/appellate-courts/F3/260/68/494888/); [law.resource.org full text](https://law.resource.org/pub/us/case/reporter/F3/260/260.F3d.68.00-1574.html). Despite its name, World Sports Exchange was a conventional sportsbook taking the house side, not a peer-to-peer exchange. Cohen received a 21-month sentence. [not re-verified]
- **United States v. Lyons (1st Cir. 2014).** Later case law relies on *Cohen*: Lyons cites it for the proposition that the Wire Act reaches internet transmissions. — [Midpage, US v. Lyons](https://app.midpage.ai/case/united-states-v-lyons-8412724)
- **OLC opinions.**
  - 2011: OLC concluded that § 1084 is limited to sports wagering. This opened the way for state online lotteries and casinos.
  - 2018: OLC reversed that view. The opinion was dated Nov. 2, 2018 and released Jan. 2019. It read the restriction to "sporting event or contest" as modifying only one clause, so the other prohibitions would reach all wagering.
  - *NH Lottery Comm'n v. Rosen*, 986 F.3d 38 (1st Cir. Jan. 20, 2021) affirmed the district court. It held the controversy justiciable and held that "the Wire Act applies only to interstate wire communications related to sporting events or contests," rejecting the 2018 OLC opinion.
  - Sources: [Justia, No. 19-1835](https://law.justia.com/cases/federal/appellate-courts/ca1/19-1835/19-1835-2021-01-20.html); [White & Case alert](https://www.whitecase.com/publications/alert/first-circuit-rejects-dojs-expansive-view-wire-act); [Wiley alert](https://wiley.law/alert-First-Circuit-Says-Wire-Act-Is-Limited-to-Sports-Wagering)
- **Certiorari.** Duane Morris predicted in 2021 that the Biden DOJ would not appeal. I found no source confirming whether a certiorari petition was filed. My understanding is that none was filed and the deadline lapsed in 2021 [not re-verified]. — [Duane Morris alert (via search)](https://www.duanemorris.com/alerts/first_circuit_holds_wire_act_applies_only_interstate_wire_communications_related_sporting_0121.html)
- **Fifth Circuit.** *In re MasterCard Int'l Inc.*, 313 F.3d 257 (5th Cir. 2002) also read § 1084 as limited to sports betting. [not re-verified; cited in the CRS reports above]
- **Current DOJ posture (Feb. 2026).** The SDNY U.S. Attorney's Office said it is evaluating how existing criminal statutes apply to prediction markets. It said that calling a venue a "prediction market" does not insulate it from liability. The focus was manipulation, insider trading and wire fraud. — [Duane Morris alert, Feb. 2026 (search snippet; page not fetchable)](https://www.duanemorris.com/alerts/southern_district_new_york_us_attorneys_office_examines_laws_prediction_markets_0226.html); [Bloomberg Law](https://news.bloomberglaw.com/us-law-week/prediction-market-prosecutions-may-be-curbed-by-decades-old-case)

### Inferences
- **Sports markets.** Interstate transmission of bets on sports is the core of § 1084. These users send stakes over the internet, the platform transmits "wire communication[s] which entitle the recipient to receive money … as a result of bets", and it takes a cut. That fits the statute closely, especially where any user sits in a state where online sports betting is illegal or the operator is unlicensed. The § 1084(b) safe harbor covers only "information assisting" betting between states where the betting is legal. It does not cover transmitting the bets themselves, and in any event the platform is unlicensed everywhere.
- **"Engaged in the business" when the platform never takes a side.** The statute does not require the defendant to be a bookmaker taking the risk. Courts ask whether the person regularly devotes time and labor to betting or wagering for profit. A platform that runs the order book, holds the stakes, settles markets and takes 10% of winnings fits that description, arguably more cleanly than a bookie, because its revenue is a direct function of the volume of wagers. I found no US appellate decision squarely addressing a peer-to-peer betting exchange under § 1084; that is a gap.
- **Non-sports markets.** Elections, the economy and culture are probably outside § 1084 in the First and Fifth Circuits. Elsewhere there is litigation risk because the 2018 OLC reading has not been rejected in other circuits. Awards shows and reality-TV outcomes could arguably be "contests", but that is untested.

### Gaps
- No confirmed source on whether DOJ formally withdrew the 2018 OLC opinion or filed for certiorari.
- No US Wire Act prosecution of a pure peer-to-peer exchange (Betfair-style) was found.

---

## 2. UIGEA (31 U.S.C. §§ 5361-5367) and Regulation GG

### Takeaway
UIGEA does not make any bet illegal by itself. It makes it a crime for a "person engaged in the business of betting or wagering" to knowingly accept payments (card, ACH, wire, check) in connection with "unlawful Internet gambling", which is defined by reference to other state or federal law. The statute expressly excludes transactions on or subject to the rules of a CFTC "registered entity". An unregistered exchange cannot use that exclusion. A fee-taking exchange that holds stakes is almost certainly a covered "person engaged in the business". Regulation GG means banks and card networks will block or de-bank it.

### Cited Findings
- **Definition of "bet or wager" (§ 5362(1)).** It means "the staking or risking by any person of something of value upon the outcome of a contest of others, a sporting event, or a game subject to chance, upon an agreement or understanding that the person or another person will receive something of value in the event of a certain outcome". Section 5362(1)(E) excludes, among other things:
  - (i) securities transactions;
  - (ii) "any transaction conducted on or subject to the rules of a registered entity or exempt board of trade under the Commodity Exchange Act";
  - (iii) over-the-counter derivative instruments;
  - commodity-related contracts, insurance and certain fantasy sports.

  [not re-verified] — [31 U.S.C. § 5362](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title31-section5362&num=0&edition=prelim)
- **"Unlawful Internet gambling" (§ 5362(10)(A)).** It means "to place, receive, or otherwise knowingly transmit a bet or wager by any means which involves the use, at least in part, of the Internet where such bet or wager is unlawful under any applicable Federal or State law in the State or Tribal lands in which the bet or wager is initiated, received, or otherwise made." [not re-verified] — [31 U.S.C. § 5362](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title31-section5362&num=0&edition=prelim)
- **Offence and penalty.** § 5363 bars any "person engaged in the business of betting or wagering" from knowingly accepting credit, electronic fund transfers, checks or similar instruments "in connection with the participation of another person in unlawful Internet gambling." § 5366 sets the penalty at up to 5 years' imprisonment and/or a fine, plus a possible permanent injunction. [not re-verified] — [31 U.S.C. § 5363](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title31-section5363&num=0&edition=prelim); [§ 5366](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title31-section5366&num=0&edition=prelim)
- **Financial providers.** The definition of "business of betting or wagering" (§ 5362(2)) excludes financial transaction providers and interactive computer services, except where they are operated, controlled or managed by the gambling business. [not re-verified] — [31 U.S.C. § 5362](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title31-section5362&num=0&edition=prelim)
- **Regulation GG (12 CFR Part 233; Fed/Treasury joint final rule, 73 Fed. Reg. 69382, Nov. 18, 2008).**
  - It designates ACH, card, check-collection, money-transmitting and wire systems.
  - Participants must have policies and procedures "reasonably designed to identify and block or otherwise prevent or prohibit restricted transactions".
  - Non-exclusive examples centre on due diligence when establishing a commercial customer relationship.
  - Sources: [Fed. Reg. final rule (govinfo)](https://www.govinfo.gov/content/pkg/FR-2008-11-18/html/E8-27181.htm); [eCFR Part 233](https://www.ecfr.gov/current/title-12/chapter-II/subchapter-A/part-233); [Fed small-entity compliance guide](https://www.federalreserve.gov/supervisionreg/regggcg.htm); [Nelson Mullins, June 2025](https://www.nelsonmullins.com/insights/blogs/cards-on-the-table/all/every-bet-you-make-the-financial-gatekeeper-of-online-gambling)
- **UIGEA in practice.** The 2011 "Black Friday" indictment of PokerStars, Full Tilt and Absolute Poker principals charged UIGEA violations, bank-fraud conspiracy and money-laundering conspiracy. These are discussed in §4 below. — [DOJ SDNY press release, July 2012](https://www.justice.gov/archive/usao/nys/pressreleases/July12/pokersettlement.html)

### Inferences
- **"Contest of others".** Elections, economic releases and awards are plausibly "contests of others", or at least events whose outcome turns on others' conduct. Sports are expressly covered. Most of the platform's markets therefore fall within "bet or wager" unless an exclusion applies.
- **The CEA exclusion.** § 5362(1)(E)(ii) protects only transactions on or subject to the rules of a registered entity (DCM, DCO, SEF) or exempt board of trade. An unregistered website gets nothing from it. This is the key reason Kalshi and Polymarket US operate through CFTC-registered entities.
- **Predicate illegality is easy to show.** The underlying illegality comes from state law and federal law (§ 1084 for sports; § 1955). Unlicensed online wagering is unlawful in most states, so UIGEA's predicate is easily met for users in those states.
- **"Marketplace" theory.** It does not help the operator. The § 5362(2) carve-out is for neutral financial and internet intermediaries. A platform that designs the wager product, holds stakes and takes a share of winnings is the gambling business, not a neutral conduit.
- **Commercial consequence.** Reg GG plus card-network merchant coding means mainstream acquirers will treat the platform as restricted gambling. Concealing the gambling nature of transactions from banks, for example through miscoding, was the basis for the bank-fraud counts in Black Friday.

### Gaps
- Exact current text of the § 5362(1)(E) exclusions was not re-fetched in this session.
- No case found applying UIGEA to a peer-to-peer exchange.

---

## 3. Illegal Gambling Business Act (18 U.S.C. § 1955) and forfeiture

### Takeaway
§ 1955 is the most dangerous federal statute for a small unlicensed startup. Its thresholds are trivially low: five or more people involved, plus either 30 days of continuous operation or $2,000 in gross revenue on a single day. It needs only a violation of the law of a state where the business is conducted, which most states supply for unlicensed online wagering. It reaches anyone who "conducts, finances, manages, supervises, directs, or owns" the business, which captures founders, investors and key staff. It carries up to 5 years and broad forfeiture.

### Cited Findings
- **Elements.** An "illegal gambling business" is one that:
  - (i) violates the law of the state or political subdivision in which it is conducted;
  - (ii) involves five or more persons who conduct, finance, manage, supervise, direct or own all or part of it;
  - (iii) has been or remains in substantially continuous operation for more than 30 days, or has gross revenue of $2,000 in any single day.

  Gambling "includes but is not limited to pool-selling, bookmaking, maintaining slot machines, roulette wheels or dice tables, and conducting lotteries, policy, bolita or numbers games, or selling chances therein." The penalty is a fine and/or up to 5 years. § 1955(d) forfeits "any property, including money, used in violation." [not re-verified] — [18 U.S.C. § 1955](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1955&num=0&edition=prelim); [CRS 97-619](https://www.everycrsreport.com/files/20120124_97-619_93d3541d977fd6a8ee3f734360512ef731ed8be7.html)
- **Bodog.** In Feb. 2012 a Maryland grand jury indicted Bodog and founder Calvin Ayre for illegal gambling business and money-laundering conspiracy. Prosecutors alleged more than $100 million in gambling proceeds was paid to US players. In July 2017 Ayre pleaded guilty to a misdemeanor and the felony charges were dismissed; sources describe the exact disposition differently. — [Card Player (2012)](https://cardplayer.com/poker-news/12889-federal-government-indicts-calvin-ayre); [GGB News (2017)](https://ggbnews.com/article/ayre-pleads-to-misdemeanor-u-s-drops-felony-charges); [Ifrah Law](https://www.ifrahlaw.com/news/gambling-compliance-quotes-jeff-ifrah-outcome-calvin-ayres-us-criminal-case/)
- **State parallel.** In March 2026 Arizona filed criminal charges against Kalshi for running an illegal gambling business. Kalshi is CFTC-registered, so the case turns on preemption. An unregistered operator would have no preemption argument at all. — [Blask newsroom (via search)](https://blask.com/newsroom/prediction-markets-face-their-first-real-legal-test-in-the-united-states/)

### Inferences
- **How a startup trips the thresholds.** Five persons is easy to reach: two co-founders, a developer, a customer-support contractor and a market-resolution moderator. Courts generally count employees and agents who perform functions necessary to the business; bettors alone generally do not count. [count-rules not re-verified; see CRS]
- **Gross revenue.** "Gross revenue" in § 1955 case law generally means the amount wagered or handled, not net profit [not re-verified]. On that reading $2,000 a day is met almost immediately. In any case the 30-day continuity limb is met by any live website.
- **"Bookmaking" and "pool-selling".** An exchange that does not book bets may argue it is not "bookmaking". But the statutory list is non-exhaustive ("includes but is not limited to"), and the test is whether state law makes the business illegal. Many state statutes expressly criminalize facilitating, or profiting from, gambling by others, which is "promoting gambling" in the Model Penal Code tradition.
- **Forfeiture.** Escrowed customer stakes, bank accounts, domains and servers are "property used in violation" and are exposed to seizure. The government historically has seized domains (Black Friday) and frozen processor accounts.

### Gaps
- The gross-revenue case-law definition and the person-count rules were not re-verified against primary decisions in this session.

---

## 4. Travel Act, RICO, money laundering, § 1960 and prosecution examples

### Takeaway
Prosecutors routinely add Travel Act counts (§ 1952), RICO (§§ 1961-1963) and money-laundering counts (§§ 1956-1957) to gambling cases. Unlicensed money transmission (§ 1960) and bank fraud are used where payment flows are disguised. The online-gambling enforcement record shows prosecutors reach founders personally and seek forfeitures in the hundreds of millions. There is also a lineage of enforcement against prediction or exchange platforms (Intrade/TradeSports, Polymarket), although mostly under the CEA.

### Cited Findings
- **Statute summaries.** [not re-verified; statute links]
  - [Travel Act, 18 U.S.C. § 1952](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1952&num=0&edition=prelim): using interstate or foreign commerce facilities, including the internet, with intent to promote or carry on "unlawful activity". This is defined to include "any business enterprise involving gambling … in violation of the laws of the State in which they are committed or of the United States". Up to 5 years.
  - [RICO, 18 U.S.C. § 1961](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1961&num=0&edition=prelim): racketeering activity includes state "gambling" offences punishable by more than one year, plus §§ 1084, 1952 and 1955. RICO carries up to 20 years and mandatory forfeiture of interests in the enterprise (§ 1963).
  - [18 U.S.C. § 1956](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1956&num=0&edition=prelim): RICO predicates are "specified unlawful activity", so moving gambling proceeds can be money laundering. Up to 20 years.
  - [18 U.S.C. § 1960](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1960&num=0&edition=prelim): operating an unlicensed money transmitting business. This covers a business without a required state licence, without FinCEN registration, or that transmits funds known to derive from crime or to promote unlawful activity. Up to 5 years.
- **Black Friday (SDNY, Apr. 15, 2011).** Eleven defendants were indicted for UIGEA violations, bank- and wire-fraud conspiracy and money-laundering conspiracy, with a civil forfeiture action seeking about $3 billion. Under a July 31, 2012 settlement, PokerStars forfeited about $547 million and took over Full Tilt, and about $184 million went to non-US Full Tilt players, for $731 million in total. DOJ said Full Tilt had only about $60 million on deposit against its obligations to players. — [DOJ SDNY press release](https://www.justice.gov/archive/usao/nys/pressreleases/July12/pokersettlement.html); [United States v. Scheinberg (Wikipedia overview)](https://en.wikipedia.org/wiki/United_States_v._Scheinberg); [PokerNews 2020](https://www.pokernews.com/news/2020/12/top-stories-2020-end-of-the-black-friday-saga-38444.htm)
- **Cohen / World Sports Exchange.** Wire Act conviction affirmed in 2001 (see §1). — [Justia](https://law.justia.com/cases/federal/appellate-courts/F3/260/68/494888/)
- **Bodog / Ayre.** Illegal gambling business and money-laundering conspiracy, 2012-2017 (see §3).
- **Polymarket.**
  - Jan. 2022: CFTC settlement in which Polymarket paid a $1.4 million penalty for operating an unregistered binary-options facility and agreed to geo-block US users.
  - Nov. 2024: FBI raid on CEO Shayne Coplan's home in a DOJ probe of alleged continued US access.
  - July 2025: DOJ and CFTC reportedly closed their probes without charges.
  - Sources: [The Block, July 15, 2025](https://www.theblock.co/news/regulation/2025-07-15-us-justice-department-and-cftc-close-probes-into-polymarket-bloomberg-362703); [Bloomberg Law](https://news.bloomberglaw.com/white-collar-and-criminal-law/polymarket-probe-ended-by-doj-in-win-for-crypto-bets-under-trump); [Patterson Belknap](https://www.pbwt.com/securities-enforcement-litigation-insider/prediction-markets-set-to-benefit-from-u-s-enforcement-shift)
- **Prediction-market insider-trading cases (2026).** Prosecutors have brought insider-trading and fraud cases involving prediction-market trading, including the use of confidential corporate data on Polymarket. They are relying on wire fraud and CEA anti-fraud theories. — [Bloomberg Law](https://news.bloomberglaw.com/us-law-week/prediction-market-prosecutions-may-be-curbed-by-decades-old-case)

### Inferences
- **Likely charging package.** For an unregistered US-facing exchange taking sports bets and holding customer funds without licences, a plausible indictment would include:
  - § 1955 conspiracy;
  - § 1084 (sports markets);
  - UIGEA § 5363;
  - Travel Act;
  - § 1960 (escrow without a money-transmitter licence);
  - § 1956 (moving fee revenue);
  - bank or wire fraud, if payment descriptors disguised gambling.
- **The DOJ record shows founders are charged personally.** No pure peer-to-peer betting-exchange criminal prosecution was found. The closest analogues are CFTC civil actions (Intrade/TradeSports 2005 and 2012; Polymarket 2022), which are outside this note's scope.

### Gaps
- No federal criminal prosecution specifically of a peer-to-peer or exchange-model betting site (as opposed to a sportsbook, poker site or payment processor) was located.
- Current 2025-2026 DOJ online-gambling enforcement priorities beyond SDNY's February 2026 remarks were not established.

---

## 5. Money transmission, FinCEN/BSA, state licensing and payment providers

### Takeaway
An unlicensed gambling operator is **not** a BSA "casino", because that definition requires a state or tribal licence and more than $1 million in gross annual gaming revenue. FinCEN would instead analyze the operator as a potential **money services business (money transmitter)**.

Holding users' funds and paying them out to other users on settlement looks like money transmission. The payment-processor exemption does not fit. The "integral to the provision of goods or services" exemption is the operator's best argument, but its fit is uncertain, and it fails if the underlying service is illegal gambling.

Failing to register with FinCEN or to obtain state licences creates independent § 1960 felony exposure. Mainstream processors such as Stripe prohibit gambling.

### Cited Findings
- **Money transmitter definition.** 31 CFR § 1010.100(ff)(5)(i)(A) covers a person that provides money transmission services: "the acceptance of currency, funds, or other value that substitutes for currency from one person and the transmission of currency, funds, or other value … to another location or person by any means."

  The (ff)(5)(ii) exemptions include:
  - (B) acting "as a payment processor to facilitate the purchase of, or payment of a bill for, a good or service through a clearance and settlement system by agreement with the creditor or seller";
  - (F) accepting and transmitting funds "only integral to the sale of goods or the provision of services, other than money transmission services, by the person who is accepting and transmitting the funds."

  MSBs must register with FinCEN (31 CFR § 1022.380), maintain an AML programme, file SARs and CTRs, and keep records. [not re-verified] — [eCFR 31 CFR 1010.100](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1010/subpart-A/section-1010.100); [FinCEN FIN-2014-R004 / 2019 CVC guidance FIN-2019-G001 discussing the exemptions](https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-certain-business-models)
- **Casino definition.** Under the BSA, casinos and card clubs are covered when they are "licensed or authorized to do business as" casinos or card clubs and have gross annual gaming revenue above $1,000,000. Regulations are at 31 CFR Part 1021. — [FinCEN Casino FAQs](https://www.fincen.gov/sites/default/files/shared/Casino_FAQs_Final.pdf); [FinCEN casino recordkeeping FAQs](https://www.fincen.gov/resources/statutes-regulations/guidance/frequently-asked-questions-casino-record-keeping-reporting)
- **FinCEN Ruling 2005-5.** A gaming establishment with gross gaming revenue of $1 million or less is not a "casino", but it may still be an MSB if it provides MSB-type services. — [FinCEN Ruling 2005-5](https://www.fincen.gov/sites/default/files/administrative_ruling/fincen_ruling2005-5.pdf); [FinCEN: Definition of MSB - casinos](https://fincen.gov/resources/statutes-regulations/administrative-rulings/definition-money-services-business-casinos)
- **FinCEN on online gaming (2012).** FinCEN's deputy director testified in 2012 that because internet gambling had been illegal for many years, "FinCEN has no specific regulatory experience with internet gambling." — [Steele testimony](https://fincen.gov/news/testimony/statement-charles-m-steele-deputy-director-financial-crimes-enforcement-network)
- **Stripe.** Stripe's Restricted Businesses list puts "games of chance including gambling, internet gambling, casino games, sweepstakes and contests, and fantasy sports leagues with a monetary or material prize" in the prohibited category. Some prohibited categories can be supported only with explicit prior written approval. I found no explicit Stripe rule on "prediction markets" outside a Japan-specific clause reported by a third-party tracker. — [Stripe restricted businesses (search snippet; page not fetchable)](https://stripe.com/us/restricted-businesses/); [Stripe FAQ](https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs?locale=en-GB); [ConductAtlas tracker](https://conductatlas.com/platform/stripe/stripe-restricted-businesses-list/gambling-and-games-of-chance-restrictions/)

### Inferences
- **Escrow equals transmission.** The platform accepts Alice's stake and Bob's stake and later transmits the pooled amount, less its fee, to the winner. That is accepting funds from one person and transmitting them to another.
- **Payment-processor exemption (B).** It fails because the platform is not facilitating a purchase of goods or services from a seller through a clearance and settlement system by agreement with the seller.
- **"Integral" exemption (F).** The operator could argue that escrow is integral to its marketplace service. FinCEN has applied (F) narrowly in rulings on escrow and marketplace models; the rulings were not re-verified here. Arguing that money movement is integral to a gambling service also concedes the service is gambling, which UIGEA and § 1955 make illegal.
- **Licensed processor model.** Running all funds through a licensed money transmitter or payments partner (a "for-the-benefit-of" model) can relieve the platform of state licensing in some states. But such partners' terms prohibit unlicensed gambling, so the structure is unavailable on these facts.
- **AML obligations.** A registered MSB would need:
  - a written AML programme and BSA officer;
  - SAR filing (generally $2,000 or more for MSBs);
  - CTRs over $10,000 in cash;
  - Travel Rule records at $3,000 or more;
  - customer identification in practice.

  [thresholds not re-verified]
- **OFAC.** Sanctions compliance is a strict-liability civil regime (IEEPA/TWEA), with willful-violation criminal exposure, and applies to all US persons regardless of licensing. A global web platform without IP/KYC screening risks serving sanctioned jurisdictions or persons.
- **Age verification.** There is no single federal minimum gambling age; state law sets 18 or 21. Federal exposure here is mainly COPPA for users under 13 and the aggravating effect of serving minors in charging and sentencing.
- **State money-transmitter licensing.** This is covered by the state researcher. Industry figures commonly cite about 49 states plus DC, 12-24 months and over $1 million in bonds and fees, and the CSBS Money Transmission Modernization Act has been adopted by a large number of states. I found no reliable 2026 figure in this session, so treat these numbers as unverified.

### Gaps
- Specific FinCEN administrative rulings on internet escrow services were not retrieved.
- No current FinCEN guidance was found on prediction markets or online sportsbooks; state-licensed online sportsbooks are generally treated as casinos under the BSA, but that was not verified.
- MTMA adoption count and licensing cost/time were not verified.

---

## 6. Securities law: Howey, security-based swaps and the SEC's 2026 posture

### Takeaway
Plain binary event contracts between users are generally not "investment contracts" under *Howey*: each user's return depends on the event, not on the managerial efforts of the platform, and there is no common enterprise in the issuer sense. Markets on a **single company's** stock price, earnings or corporate events, however, fit the statutory definition of **security-based swaps**. Offering those to retail users off a registered national securities exchange, and without an effective registration statement, violates the securities laws.

In 2026 the SEC is actively considering its jurisdiction over event contracts. In May it paused roughly 24 prediction-market ETFs pending public comment, and House members asked for guidance in July.

### Cited Findings
- **Howey.** *SEC v. W.J. Howey Co.*, 328 U.S. 293 (1946): an investment contract is an investment of money in a common enterprise with an expectation of profits from the efforts of others. [not re-verified] — [Justia](https://supreme.justia.com/cases/federal/us/328/293/)
- **Security-based swap definition.** Exchange Act § 3(a)(68) covers swaps based on a single security, loan or narrow-based index, or on "the occurrence, nonoccurrence, or extent of the occurrence of an event relating to a single issuer of a security or the issuers of securities in a narrow-based security index, provided that such event directly affects the financial statements, financial condition, or financial obligations of the issuer."
  - Securities Act § 5(e): SBS may not be offered to non-eligible contract participants without an effective registration statement.
  - Exchange Act § 6(l): such transactions must be effected on a registered national securities exchange.

  [not re-verified] — [15 U.S.C. § 78c(a)(68)](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title15-section78c&num=0&edition=prelim); [15 U.S.C. § 77e(e)](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title15-section77e&num=0&edition=prelim)
- **SEC 2026.**
  - Feb. 2026: SEC Chair Atkins said the SEC may regulate some prediction markets depending on structure, especially where contracts resemble securities.
  - May 20, 2026: he confirmed staff were told to seek public input before further action on event-contract ETFs. About 24 filings due to launch in May were sidelined.
  - July 22, 2026: a letter from House members asked the SEC to issue formal guidance on whether event contracts referencing securities or related financial metrics fall under SEC oversight.
  - Sources: [InvestmentNews](https://www.investmentnews.com/etfs/sec-chief-atkins-signals-caution-on-prediction-market-etfs-amid-broader-rethink-of-novel-fund-structures/266699); [The Block](https://www.theblock.co/post/402125/sec-reviewing-implications-of-delayed-prediction-market-etfs); [CPA Practice Advisor, May 21, 2026](https://cpapracticeadvisor.com/2026/05/21/sec-chief-atkins-pumps-the-brakes-on-prediction-market-funds/183777); [PYMNTS](https://pymnts.com/cpi-posts/sec-chair-says-agency-may-get-involved-in-regulating-prediction-markets); [Rep. Casten letter (PDF)](https://casten.house.gov/imo/media/doc/sec_prediction_markets_letter.pdf)

### Inferences
- **Single-issuer markets.** User-created markets such as "Will Tesla close above $300 on Friday?" or "Will Apple beat EPS consensus?" are single-name security-based swaps. They are illegal to offer to retail outside an exchange-registration framework, and the SEC (not the CFTC) has jurisdiction. The SEC has historically pursued unregistered binary options on securities (e.g., *SEC v. Banc de Binary*, 2013) [not re-verified].
- **Broad-index or macro markets.** Markets on the S&P 500 level, CPI or the Fed rate are swaps under CFTC jurisdiction, not security-based swaps. That is outside this note.
- **Platform tokens or revenue shares.** The platform could create *Howey* exposure if it sells tokens, LP positions or revenue shares to users. Ordinary yes/no contracts do not.

### Gaps
- No SEC rule or formal guidance on event contracts issued after the May 2026 comment request was found. The status as of Nov. 2026 is unconfirmed.

---

## 7. Tax: operator income, information reporting, wagering excise and occupational taxes, OBBBA 90% loss cap

### Takeaway
- **Fee revenue.** The 10% fee is ordinary gross income to the operator whether or not the business is legal.
- **Wagering excise tax (§ 4401).** It is imposed on the **amount of the wager**, not on the operator's fee. The rate is 2% for wagers not authorized by state law and 0.25% for authorized ones. Whether an exchange that never books bets is the person "engaged in the business of accepting wagers" is unsettled. A wagering pool conducted for profit is expressly within the tax, so exposure is real.
- **Occupational tax.** The § 4411 occupational tax ($500 a year per person for unauthorized wagering) and § 4412 registration likely apply as well.
- **Information reporting.** Reporting for users' winnings (W-2G versus 1099-MISC versus 1099-B) is unsettled for prediction markets.
- **OBBBA.** The One Big Beautiful Bill Act caps gambling-loss deductions at 90% for tax years beginning after Dec. 31, 2025. Break-even bettors can owe tax on "phantom" income, which matters to users if their trades are characterized as gambling.

### Cited Findings
- **§ 4401 rate and base.** The excise tax is 0.25% of the amount of the wager if the wager is authorized under the law of the state where accepted, and 2% otherwise. Each person "engaged in the business of accepting wagers" is liable, and so is any person who conducts a wagering pool or lottery for profit.
  - Regulations make both the receiving bookmaker and its principal liable where wagers are laid off.
  - § 4402 exempts state-licensed parimutuel wagering.
  - § 4411 imposes an annual special (occupational) tax ($500, or $50 for authorized wagering [not re-verified]) on persons liable under § 4401 or who receive wagers on their behalf.
  - Sources: [26 U.S.C. § 4401 (Cornell)](https://www.law.cornell.edu/uscode/text/26/4401); [Justia 2021 § 4401](https://law.justia.com/codes/us/2021/title-26/subtitle-d/chapter-35/subchapter-a/sec-4401/); [26 CFR Part 44](https://chanrobles.com/usa/uslaws/cfr/title26/26-16.0.1.1.4.php); [govinfo ch. 35](https://www.govinfo.gov/content/pkg/USCODE-2016-title26/html/USCODE-2016-title26-subtitleD-chap35.htm)
- **§ 4421 definitions.** "Wager" covers:
  - (A) any wager on a sports event or contest placed with a person engaged in the business of accepting such wagers;
  - (B) any wager placed in a wagering pool on a sports event or contest, if the pool is conducted for profit;
  - (C) any wager placed in a lottery conducted for profit.

  [not re-verified] — [26 U.S.C. § 4421](https://www.law.cornell.edu/uscode/text/26/4421)
- **Uncollected excise tax.** The American Gaming Association has argued that federal excise tax is going uncollected on prediction-market volume, a commentator's characterization of about $1 billion in prediction-market revenue. — [Don't Mess With Taxes](https://dontmesswithtaxes.com/taxes-uncollected-on-1-billion-in-prediction-market-revenue-says-aga/)
- **OBBBA (Pub. L. 119-21, signed July 4, 2025).** It amended § 165(d) so that, beginning in 2026, only 90% of gambling losses, including related expenses, are deductible, and only up to winnings. A bettor who wins and loses $100,000 now owes tax on $10,000 of phantom income. Repeal bills were introduced; I found no enactment as of Nov. 2026. — [CasinoBeats](https://casinobeats.com/2025/07/04/big-beautiful-bill-gambling-deduction-cap-2026/); [Covers, Dec. 30, 2025](https://www.covers.com/industry/gambling-industry-already-feeling-squeeze-of-impending-tax-deduction-change-dec-30-2025); [Front Office Sports](https://frontofficesports.com/article/trumps-big-beautiful-bill-includes-huge-tax-hike-for-pro-gamblers/); [Casino.org on prediction markets](https://www.casino.org/news/is-the-gambling-deduction-tax-change-designed-to-benefit-prediction-markets-trump/)
- **Prediction-market reporting is unsettled.** The IRS has issued no guidance classifying prediction-market winnings.
  - Kalshi's documentation lists 1099-MISC for credits and rewards, not trading P&L.
  - Advisers variously treat winnings as gambling income, other ordinary income, capital gain or § 1256 income. One source calls § 1256 "very aggressive".
  - The Form 1099 reporting threshold rises to $2,000 in 2026 under OBBBA.
  - Sources: [Awaken Tax](https://awaken.tax/media/article/kalshi-taxes); [Moneywise](https://moneywise.com/taxes/prediction-market-winnings-tax-irs-guidance); [TaxProf Blog](https://taxprofblog.aals.org/?p=79020); [DeFi Rate](https://defirate.com/news/gambling-tax-deduction-cap-migration-prediction-markets/)
- **Illegal income.** Income from illegal activity is taxable (*James v. United States*, 366 U.S. 213 (1961)). [not re-verified] — [Justia](https://supreme.justia.com/cases/federal/us/366/213/)

### Inferences
- **Operator income tax.** The operator must report the fee income (IRC § 61). Unpaid tax on illegal-gambling income has historically been a companion charge (tax evasion, § 7201).
- **Excise-tax exposure.**
  - On the § 4421(1)(B) "wagering pool conducted for profit" theory, the platform could owe 2% of the total amount staked on sports and contest markets.
  - Each $1 contract involves combined stakes of $1. With a 10% fee on winners' profit, the fee is roughly 10% × (1 − p) per contract. On markets priced near 50¢ that is about 5¢ per $1 of stakes against a 2¢ excise tax; at a price of 0.9 it is about 1¢, so the excise tax would exceed the fee.
  - Political, economic and culture markets are not "sports events". Whether they are "contests" for § 4421 is unsettled, and IRS precedent on non-sports pools is thin.
- **Users.** If winnings are gambling income, users face the 90% loss cap. A heavy trader with $500k of gross wins and $500k of losses would owe tax on $50k. If the operator issues no forms, users still owe the tax. Without W-2G or 1099s the operator also forgoes withholding compliance, and § 3402(q) gambling withholding (24% on certain winnings over $5,000 and at least 300 times the wager) [not re-verified] could create withholding liability. Foreign users raise 30% NRA withholding on US-source gambling winnings (§ 1441/§ 871) [not re-verified].

### Gaps
- There is no IRS ruling on whether an exchange matching bettors is the "person accepting wagers" for § 4401, or on whether non-sports event markets are "contests".
- Current 2026 W-2G thresholds (whether indexed or changed after OBBBA) were not verified.
- No IRS guidance on prediction-market characterization was found.

---

## 8. Personal criminal liability of founders and typical penalties

### Takeaway
Every statute above reaches individuals who run, own, finance or manage the business. Founders are therefore principal defendants, not merely the company. Stacked counts carry statutory maxima of 2 to 20 years each, fines of up to $250,000 per count or twice the gain or loss, and forfeiture of proceeds and property, including customer escrow.

### Cited Findings
| Statute | Who is liable | Maximum prison | Notes |
|---|---|---|---|
| 18 U.S.C. § 1084 (Wire Act) | Persons "engaged in the business" | 2 years | Sports only, per 1st Cir.; [link](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1084&num=0&edition=prelim) |
| 18 U.S.C. § 1955 (IGBA) | Whoever "conducts, finances, manages, supervises, directs, or owns" | 5 years | § 1955(d) forfeiture; [link](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1955&num=0&edition=prelim) |
| 31 U.S.C. §§ 5363/5366 (UIGEA) | Persons in the business of betting | 5 years | Plus injunction; [link](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title31-section5366&num=0&edition=prelim) |
| 18 U.S.C. § 1952 (Travel Act) | Anyone using interstate facilities | 5 years | [link](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1952&num=0&edition=prelim) |
| 18 U.S.C. § 1962/1963 (RICO) | Persons conducting the enterprise | 20 years | Forfeiture of enterprise interests |
| 18 U.S.C. § 1956 (money laundering) | Anyone conducting transactions with proceeds | 20 years | |
| 18 U.S.C. § 1960 (unlicensed money transmission) | Whoever "conducts, controls, manages, supervises, directs, or owns" | 5 years | [link](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section1960&num=0&edition=prelim) |

All maxima above are [not re-verified] against the statute text in this session. Fines run under 18 U.S.C. § 3571: up to $250,000 per felony count for individuals and $500,000 for organizations, or twice the gross gain or loss. [not re-verified] — [18 U.S.C. § 3571](https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section3571&num=0&edition=prelim)

- **Real-world outcomes.**
  - Cohen received 21 months [not re-verified].
  - Black Friday ended in a $731 million forfeiture settlement and individual guilty pleas. — [DOJ](https://www.justice.gov/archive/usao/nys/pressreleases/July12/pokersettlement.html)
  - Ayre's felonies were dismissed after a 2017 misdemeanor plea. — [GGB News](https://ggbnews.com/article/ayre-pleads-to-misdemeanor-u-s-drops-felony-charges)
  - In Polymarket's case, the CEO's home was raided and the probe was later dropped. — [The Block](https://www.theblock.co/news/regulation/2025-07-15-us-justice-department-and-cftc-close-probes-into-polymarket-bloomberg-362703)

### Inferences
- **The "just a marketplace" framing does not help.**
  - (a) § 1955 and § 1960 explicitly reach those who "conduct", "manage" or "own" the business.
  - (b) Wire Act and UIGEA coverage turns on being "in the business of betting or wagering", which a commission-taking exchange is.
  - (c) Holding stakes in escrow adds money-transmission liability rather than reducing gambling liability.
- **Enforcement climate.** Enforcement against prediction markets loosened under the Trump administration in 2025 (Polymarket probes closed). But SDNY's Feb. 2026 remarks and the 2026 insider-trading cases show DOJ is still active, and an unregistered US-facing operator lacks the CFTC-registration shield that the current enforcement climate favours.

### Gaps
- Sentencing Guidelines ranges (USSG § 2E3.1 for gambling offences; § 2S1.1 for money laundering) and typical actual sentences for online-gambling operators were not researched in this session.
