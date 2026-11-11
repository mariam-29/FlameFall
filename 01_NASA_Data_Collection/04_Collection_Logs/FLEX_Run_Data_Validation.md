# FLEX run data validation

The first five [NASA PSI-69 experimental table](https://psi.nasa.gov/physci/repo/data/investigations/PSI-69) records were copied from the displayed Version 5 table on 11 November 2026. The source capture preserves the accessible headings, dates, decimal values, empty cells, and test-end labels. The [catalog](../03_Investigation_Catalog/FLEX_Runs.csv) normalizes dates to ISO format and identifies units in column names.

Cross-check each run using its FLEX identifier in Appendix A, Table IX of [NASA/TP–2015–216046](../02_Original_Files/FLEX/NASA-TP-2015-216046.pdf). The five records agree across the two tables for test number, identifier, date, GMT, fuel, pressure, four gas fractions, both diameter fields, burning rate, burn time, and test-end label. The report supplies the full burning-rate unit (mm²/s) and gas labels (O₂, N₂, CO₂, He), which appear truncated in the accessible PSI table text.

| PSI test | CIR identifier | NASA test-end label | Extinction diameter field (mm) |
| --- | --- | --- | --- |
| 1 | 20CAL08 | Disruption | 0.89 |
| 2 | 20CAL10 | Extinction | 0.94 |
| 3 | 20CAL12 | Extinction | 0.92 |
| 4 | 30CAL02 | Extinction | Blank in PSI, dash in Table IX |
| 5 | 30CAL03 | Extinction | 0.81 |

Appendix B provides the per-test observations behind Table IX. Figure 5 describes probable droplet disruption coinciding with flame extinction in test 1. Figure 6 describes diffusive extinction in test 2 and cautions about the ultraviolet camera data. In test 4, the droplet left the measurement camera's field of view early, and the report could only tentatively identify disruption before extinction (Figure 8). Figures 7 and 9 also describe visibility limitations for tests 3 and 5.

Table IX allows some diameters to be extrapolated. The catalog preserves reported values and test-end labels without assigning a measurement method or extinction mechanism to each row.

These five methanol tests form a baseline at 757.7–764.2 mmHg, with an initial oxygen mole fraction of 0.21 and zero reported CO₂ and He. The subset supports a baseline run comparison. Evaluating suppressant effects requires additional rows with varied gas composition and comparable fuel, pressure, oxygen, and initial diameter.

## CO₂ comparison

The [comparison catalog](../03_Investigation_Catalog/FLEX_Diluent_Comparison.csv) pairs FLEX-203 and FLEX-171 from Table IX. Both are free-floating methanol droplets at 21% initial oxygen, within 6.5 mmHg in pressure and 0.23 mm in initial diameter. The CO₂ fraction goes from zero to 0.15, replacing nitrogen. Both test ends are labeled Extinction, and Figures 206 and 174 describe diffusive extinction.

The reported extinction diameter is 1.42 mm for FLEX-203 and 1.59 mm for FLEX-171. The latter is estimated by fitting the droplet history across a gap in camera visibility. The initial diameter, measurement method, and test date differ. The pair supports a descriptive comparison of reported outcomes. The two runs alone cannot isolate a CO₂ effect or establish a suppression threshold.
