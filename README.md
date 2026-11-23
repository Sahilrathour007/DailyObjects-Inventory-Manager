# DailyObjects Inventory Manager

A stock placement planner for one in-house brand that sells through four channel types:

- **Website and marketplaces** (Amazon, Flipkart, Myntra): ship straight from the company warehouse.
- **Retail stores** (15 stores in 7 cities): hold their own stock, refilled from the warehouse.
- **Quick-commerce dark stores** (Blinkit, Zepto, Instamart): the platform holds the stock and buys in bulk purchase orders.

The goal is two-sided: **no stock-outs** on any channel, and **no excess stock** creating working-capital stress. Forecasting long-range by SKU is avoided on purpose. The planner uses a short trailing window of real sales, holds safety stock once at the warehouse, keeps store stock thin and refilled from sales, and plans production by product family.

The logic follows Martin Christopher, *Logistics and Supply Chain Management* (4th ed., 2011): segmentation by volume and margin, a pooled central hub, postponement, a control tower, surge planning and "forecast for capacity, execute against demand". The reorder-point and safety-stock maths are standard inventory formulas, not the book's.

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. It opens with invented example data so every screen has something to show.

**Where data is kept:**
- **As a claude.ai artifact:** it uses the artifact's shared database, so the whole team sees the same data.
- **Anywhere else** (local file, plain web server): data stays in that browser's `localStorage`, and only that browser sees it.

## Two views

### Decisions (management)
| Tab | What it answers |
|---|---|
| Overview | Six headline numbers, stock health, contribution by channel, where the cash sits, biggest cash traps, and a "needs attention" list |
| Today | Daily run sign-off (stock by 10:00, make list by 11:00, dispatch by 15:00), warehouse days of cover, refills from the warehouse, the warehouse make-or-buy list, and stock to cut |
| Availability | Availability today's stock supports vs target, and the units and ₹ to close each gap |
| Stores | Stock and refills per store, store detail by SKU, and what quick commerce should keep ready for the next purchase order |
| Products & channels | SKUs listed on each marketplace, classes by margin and volume, class overrides, and margin by channel |
| Hub & production | Pooled safety stock, measured channel correlation, and production vs sales per day |
| Sales & next month | Stock and profit check for each sale event, plus next month's production by family, net of stock held |

### Data desk (the people who maintain the data)
| Tab | What gets maintained |
|---|---|
| Uploads & checks | Six uploads with freshness and who updated each, setup gaps, data-quality checks and the change log |
| SKUs & COGS | SKU master: MRP and cost per unit |
| Channel costs | Commission, fees, delivery, packing, returns and store costs per channel, each marked confirmed by finance or placeholder |
| Store delivery times | Warehouse-to-store days for each store, the dark-store average, and refill rhythm |
| Sale calendar | Past and upcoming sale events: dates, expected uplift, extra discount and which listings take part |
| Planning rules | Every planning setting, with its source and what it does. Only Editors can change these. |

## Data files

Templates are in [`templates/`](templates). Column names can be in any order; the importer matches common header names and asks you to confirm before saving.

| File | Columns | How often |
|---|---|---|
| SKU master | sku, name, category, mrp, cogs | When products or costs change |
| Orders | order_date, sku, channel, quantity, status (optional) | Weekly, at least 120 days of history |
| Stock on hand | sku, location (`Hub` or a store / platform name), on_hand, in_transit | Every morning |
| Production log | production_date, sku, units_produced | Weekly (optional) |
| Daily stock history | date, sku, location, on_hand | Weekly (recommended) |
| Marketplace listings | sku, channel, status (optional) | Monthly (optional) |

Uploads are safe to combine from several systems:
- **Orders and stock history** add by date: only the dates *and channels or locations* in the file are replaced, so a store POS file never deletes marketplace orders.
- **Stock on hand** replaces only the locations in the file, so a store-only file keeps warehouse stock.
- Replacing all history is refused if the file is shorter than the planning window.
- Unrecognised channel names ship from the warehouse; any location containing "warehouse", "WH", "hub" or "godown" counts as the warehouse.

## How the numbers are worked out

```
d     = average daily sales over the trailing window (stock-out days and past sale-calendar days removed)
σ     = daily swing (standard deviation) over the same days
z     = from the availability target (99% → 2.33, 97% → 1.88, 90% → 1.28)

Store / dark store:  safety stock = z · σ · √L        reorder point = d · L + safety stock
                     order-up-to  = reorder point + d · refill cycle
Warehouse:           σ pooled = √[(1 − ρ) Σσᵢ² + ρ (Σσᵢ)²], ρ measured per SKU from daily orders
                     safety stock = z · √(σ pooled² · L + d² · σL²)   (σL = production lead-time swing)
                     reorder point = d · L + safety stock    order-up-to = reorder point + d · batch days
                     position = on hand + in transit + store stock above each store's reorder point
Monthly plan:        net to make = demand next 30 days + (safety stock + half a batch) − stock held
                     lock now = net × commit %, decide later = the rest, split by SKU shortfall
Availability now:    Φ((position − d · L) ÷ (σ · √L)); for stores, store × warehouse
```

Classes are set per SKU on each channel. **A** is high volume and high contribution margin. **B** is one of the two. **C** is neither. **X** loses money. **0** has no sales. **?** is missing MRP or COGS.
- Volume is judged within each channel, so Amazon and Myntra aren't compared on the same scale.
- Margin is contribution after GST, discount, commission, delivery, packing, returns, ads and store costs.
- Targets: A 99%, B 97%, C 90%. Products missing costs are planned at the A target until costs are added. Money-losing products are planned at the C target.

## Known limits

- **Cost terms are placeholders until finance confirms them.** Classes and margins are estimates until then.
- **The 2-day production lead-time swing is a placeholder.** Record promised vs actual batch dates and set the real figure.
- **Demand is assumed roughly normal.** A brand-new SKU with a few days of history gets unreliable numbers.
- **Quick-commerce demand comes from purchase orders, not the platform's consumer sales.** Sell-through reports would be better.
- **The browser can't pull orders from Unicommerce or similar systems directly.** That needs a small backend that holds the API credentials.
- **Two people saving the same data within a second or two can still overwrite each other.** The change log shows who saved last.

See [`docs/AUDIT.md`](docs/AUDIT.md) for the 15 issues found and fixed in the November 2026 audit.

## Files

```
index.html   page shell
styles.css   styles (light and dark)
app.js       all logic: import, calculation, both views, charts, shared-data sync
templates/   example CSV files for every upload
docs/        audit notes
```
