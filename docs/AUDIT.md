# Audit, November 2026

Fifteen issues found in the planner and fixed. Figures are from the built-in example data.

## Numbers that were wrong

| # | Issue | Before | After |
|---|---|---|---|
| 1 | Stores were refilled only for class A products | 28 of 140 selling store items planned | All 140 planned. B and C items use their own lower target; A items are served first when the warehouse is short. |
| 2 | A SKU with no MRP or COGS got zero safety stock | Safety stock 0, out of stock about half the time | Planned at the A target until costs are added. Money-losing items get the C target. |
| 3 | A weekly orders upload replaced all history by default | 120 days could become 7 | Default adds by date and replaces only the dates in the file. A full replace shorter than the window is refused. |
| 4 | The sale check counted the same warehouse stock once per channel | All-channel sale: 0 units short | 21 SKUs, 1,582 units short. Extra units are added up per SKU, after normal sales until the event ends. |
| 5 | The monthly production plan ignored stock already held | Committed 70% of forecast regardless of stock | Net to make = demand + target end stock − stock held |
| 6 | Today's make list and the monthly plan gave two different production numbers | Not linked | Make list shows the family's monthly lock left, with a warning when it is exceeded |

## Built-in bias

| # | Issue | Fix |
|---|---|---|
| 7 | Late production batches were ignored | Lead-time swing (σL) added to warehouse safety stock |
| 8 | Past sale days counted as normal demand | Past sale-calendar dates are left out of daily sales and the swing |
| 9 | Channel correlation was a typed guess of 0 (the best case) | Measured per SKU from daily orders; the typed value is a fallback |
| 10 | Safety stock was held twice, at the store and again at the warehouse | Store stock above its reorder point counts toward the warehouse position |
| 11 | Quick-commerce bulk purchase orders were counted as consumer demand in the monthly plan | Replaced by each listing's smoothed daily rate |

## Process

| # | Issue | Fix |
|---|---|---|
| 12 | Anyone could change planning rules, with no record | Planning rules and class overrides are Editor-only; a change log records who changed what; conflicting saves are refused |
| 13 | Stock freshness used the upload date | Upload asks for the date the stock was counted |
| 14 | Placeholder channel costs looked final | Each channel has a finance-confirmed flag; unconfirmed channels are flagged |
| 15 | Nobody owned acting on the daily lists | "Today's run" sign-off: stock by 10:00, make list by 11:00, dispatch by 15:00, recording who and when |

## Code review, November 2026

| # | Bug | Fix |
|---|---|---|
| 16 | A second quick edit to the same shared data was refused as "changed by someone else" and lost | A save is refused only when the stored version is one this browser has never seen |
| 17 | An orders file from one source deleted other channels' orders for the same dates | Only the channels in the file are replaced |
| 18 | A stock file with some locations wiped the others, including the warehouse | Only the locations in the file are replaced |
| 19 | Unknown channels and warehouses (e.g. "Ajio", "Bhiwandi Warehouse") became fake stock-holding stores | New channels ship from the warehouse; warehouse names are recognised anywhere in the text |
| 20 | An invalid "ignore order status" pattern crashed every orders upload | Falls back to the default pattern with a message |
| 21 | Channel correlation was measured on days with sale spikes and stock-outs | Uses the same cleaned days as daily sales |
| 22 | The monthly plan used raw history, inflated by past sales and depressed by stock-outs | Those days are left out and each month is scaled back to 30 days |
| 23 | An interrupted upload left orphaned pieces in the shared store | Pieces older than the current version and over 10 minutes old are deleted on load |

Nine unused or silently overridden functions were removed.
