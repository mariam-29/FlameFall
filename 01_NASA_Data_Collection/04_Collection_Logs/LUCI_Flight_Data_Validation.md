# LUCI flight data validation

The [NASA ASGSR presentation](../02_Original_Files/LUCI/ASGSR%202025-LUCI-Ferkul-Presentation-v2-20250010653.pdf) is the source for the [flight-test record](../03_Investigation_Catalog/LUCI_Flight_Tests.csv) and the [sample results](../03_Investigation_Catalog/LUCI_Sample_Results.csv). Page numbers are one-based PDF pages. Catalog IDs are local identifiers. The records cover the first flight.

| PDF pages | Fields checked |
| --- | --- |
| 4-5, Schematic | One chamber. SIBAL dimensions 5 cm by 30 cm, converted to 50 mm by 300 mm. Acrylic rod diameter 4 mm. A short pause separated the ignitions. |
| 12-13, flight summary and history | Blue Origin New Shepard, launch on 4 February 2025, centrifugal simulation of lunar gravity, 11 rpm, effective radius 1.22 m, concurrent burns in normal-pressure air. Numeric pressure is blank because the slide gives a qualitative pressure description. |
| 16, sample images | SIBAL burned downward and PMMA burned upward. |
| 19, LUCI SIBAL fabric | Flame-base and flame-tip spread rates of 0.92 and 1.1 mm/s, respectively. Page 33 rounds the base rate to 0.9 mm/s in its comparison table. |
| 20-21, LUCI PMMA | Approximately 6 cm total flame-base spread and 1.5 mm/s flame-tip spread. Base speed varied, so the constant-rate field is blank. The holder eventually obscured the tip, limiting flame-length measurement. |

## Chamber oxygen

Pages 4-5 and 12 describe chamber oxygen sensing. The PMMA-titled slide (p. 22) reports a drop from 20% to 14.3% and a rise to 15.8%. It associates the rise with a decrease in gravity around 125 s. The SIBAL-titled slide (p. 42) reports approximately 20% to 18%. The presentation does not establish a common time window or sensor attribution for those two summaries. Both observations are retained here with their slide context. Material-specific oxygen extinction thresholds are unassigned.

## Scope

The sample results capture published observations. They contain no digitized time series or independent runs for comparing materials. A comparison should retain the shared atmosphere and the different flame-spread directions. The flight provides a simulated lunar-gravity reference in normal-pressure air. Rover atmosphere coverage requires evidence for the proposed oxygen, pressure, and flow conditions.
