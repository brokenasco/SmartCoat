# Paint catalog source audit

Audit date: 2026-07-25. This is a discovery audit, not a grant of reuse rights.
Public display pages and public technical documents do not automatically authorize
bulk collection, republication, or automated updates. Every initial registry entry
is therefore `pending_permission`, disabled, and intentionally empty.

| Brand | Official catalog / documentation | Public evidence found | Public API or complete machine feed | Recommended ingestion | Completeness / limitations |
|---|---|---|---|---|---|
| Behr | https://www.behr.com/consumer/colors/paint/explore/all-colors and https://www.behr.com/pro/products/safety-msds | Browsable color catalog, product categories, TDS/SDS/PDS, and professional downloadable palette references | Not confirmed | Request an official professional feed or written approval for downloadable palettes and product documents | Product technical data is public; color-to-product availability, discontinued state, and local pricing require separate authority |
| Sherwin-Williams | https://www.sherwin-williams.com/homeowners/color and https://www.sherwin-williams.com/painting-contractors/products | Browsable color and product resources | Not confirmed | Request partner/professional feed; otherwise approved manufacturer export | Do not infer availability or coverage from display pages |
| Valspar | https://www.valspar.com/en/colors and https://www.valspar.com/en/products | Browsable colors and product pages | Not confirmed | Request an official or authorized Lowe's/brand feed | Retail location availability and prices are distinct datasets |
| Rust-Oleum | https://www.rustoleum.com/product-catalog and https://www.rustoleum.com/pages/help-and-support/product-support | Product catalog and product support documents | Not confirmed | Request product/color export; use approved manual files for specialty lines | Architecture includes specialty coatings; avoid treating all products as tintable architectural wall paint |
| Farrow & Ball | https://www.farrow-ball.com/paint-colours and https://www.farrow-ball.com/how-to/product-advice-sheets | Color pages and product advice | Not confirmed | Manufacturer-approved palette/product export | Regional names, finishes, and container availability may differ |
| Clare | https://www.clare.com/collections/interior-paint and individual product pages | Curated color product pages expose finish, size, LRV, and undertone for some colors | Not confirmed | Request direct catalog export or approved manual JSON/CSV | Small curated range is easier to validate, but website visibility is not ingestion permission |
| Annie Sloan | https://www.anniesloan.com/products/chalk-paint/ | Product/color pages and dealer discovery | Not confirmed | Request approved palette and product file | Focus includes chalk and specialty systems; regional product availability varies |
| PPG Paints | https://www.ppgpaints.com/color and https://www.ppgpaints.com/ppg-products | Color tools plus structured product pages with TDS/SDS, codes, finishes, bases, and sizes | Not confirmed | Request official product/color feed or licensed export | Public product documentation is detailed, but bulk color and commercial use rights need confirmation |
| Glidden | https://www.glidden.com/color and https://www.glidden.com/products | Browsable color/product resources | Not confirmed | Request official PPG/Glidden export or approved retailer feed | Keep Glidden brand identity separate from parent-company/product data |
| HGTV Home by Sherwin-Williams | https://www.hgtvhomebysherwinwilliams.com/en/colors and https://www.hgtvhomebysherwinwilliams.com/en/products | Color collections and product pages with PDS/SDS links | Not confirmed | Request brand or authorized Lowe's feed | Do not merge codes into Sherwin-Williams; brand and retailer availability differ |
| Benjamin Moore | https://www.benjaminmoore.com/en-us/paint-colors and https://www.benjaminmoore.com/en-us/documentation | Color catalog plus searchable TDS/SDS/HPD and discontinued product indicators | Not confirmed | Request contractor/architect data feed or approved export | Dealer inventory and pricing are location-specific and need authorized dealer data |

## Required authorization record

Before enabling a source, record the license/contact reference, permitted fields,
territory, caching/retention terms, attribution requirement, rate limit, update
frequency, deletion obligations, and whether the file is a full snapshot or delta.
Re-audit quarterly or when terms change.

## Initial update policy

All 11 discovery sources are reviewed quarterly. There are no scheduled catalog
imports until at least one source is authorized. Monitoring may report that no
sources are enabled; that is healthy rather than an ingestion failure.

