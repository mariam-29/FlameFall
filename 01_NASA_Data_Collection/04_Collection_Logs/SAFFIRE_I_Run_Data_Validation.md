# Saffire-I run data validation

The [run catalog](../03_Investigation_Catalog/SAFFIRE_I_Runs.csv) records NASA's concurrent-flow test of the large SIBAL sheet, sample 1-1. The measurements come from [Results of Large-Scale Spacecraft Flammability Tests](../02_Original_Files/SAFFIRE_I/NTRS-20170008805.pdf), NASA NTRS 20170008805. Page references use one-based PDF numbering.

| PDF pages | Fields checked |
| --- | --- |
| 5, 7 | The test took place in an uncrewed resupply vehicle after ISS departure. The experiment used an 18 × 20 in flow-duct cross section. |
| 16-17 | The 40.6 × 94 cm fabric burned for 420 s in air at 20 cm/s concurrent flow. The flame extinguished when the airflow was switched off at the scheduled end. |
| 20-21 | The flame-position analysis reports a mean concurrent-flow spread rate of 1.8 mm/s for the wide sample. |
| 29, Table I | Sample 1-1 was 0.37 mm thick. The table reports oxygen changing from 21.7% to 21.5%, approximately 84 cm of burn length, 420 s duration, and 1.8 mm/s spread. Burn length and mean spread rate are separate published quantities. |

Numeric pressure is blank because the cited result does not give a run-specific pressure. Ignition power is omitted because p. 8 lists 165 W for Saffire 1 while Table I lists 182 W for sample 1-1. The reported flame extinction followed a scheduled airflow shutoff. The record provides no minimum airspeed or oxygen extinction threshold.

The opposed-flow result used fabric left after the concurrent burn (pp. 16 and 29). The catalog covers the first burn. It supports the larger-fire-spread card with a wide fabric sample in an orbital flow duct. Comparisons with BASS-II should retain the differences in fuel, geometry, and enclosure.
