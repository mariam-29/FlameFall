\# BASS-II O15 Data Validation Log



\## 1. Source Information



\- Investigation: Burning and Suppression of Solids-II (BASS-II)

\- Source Report: NASA/TM-20210011385

\- Source Table: Table A.5

\- Dataset: PSI-25

\- Test Points: O15a and O15b

\- Structured File: BASS\_II\_O15\_Runs.csv



\## 2. Validation Method



Structured values were manually compared against the original NASA report, Table A.5, and the previously documented extraction log.



\## 3. Fields Selected for Validation



The following fields were selected for manual verification against Table A.5. Validation results are documented in Section 4.



\- Investigation ID

\- Test Point ID

\- As-run Test Number

\- Sample Number

\- Material

\- Sample Diameter

\- Actual Date

\- Video Display Date

\- Approximate Start Time

\- Total Frames

\- Fan Display

\- Air Display

\- Initial and Final O2

\- Initial and Final CO2

\- Initial and Final CO

\- Flow-to-Extinction Potentiometer Setting

\- Reburn Status

\- Source ID

\- Source Table



\## 4. Validation Results



\### O15a



\- Test Point: O15a

\- Sample Number: 218m

\- Total Frames: 124

\- Final O2: 15.6

\- Final CO: 176

\- Flow-to-Extinction Setting: 0.32



\### O15b



\- Test Point: O15b

\- Sample Number: 218m

\- Total Frames: 316

\- Final O2: 14.5

\- Final CO: 751

\- Flow-to-Extinction Setting: 0.27

\- Reburn: Yes



\## 5. Relationship Between Test Points



O15b is documented in Table A.5 as a reburn of the same rod used in O15a.



Both test points refer to sample 218m.



Therefore, O15b must not be treated as an independent sample.



\## 6. Important Data Notes



\- The actual date in Table A.5 is July 28, 2014 (GMT 209).

\- The ProofSheets display July 29, 2014 (GMT 210).

\- Both source-specific dates are preserved.

\- The O15a source time entry includes the text "msg"; this was retained as a note.

\- Potentiometer settings are not interpreted as air velocity.

\- Missing or uncertain information must not be inferred.



\## 7. Validation Status



\- Status: Partially verified.

\- Method: Manual comparison against the original NASA report.

\- Scope: Selected fields were checked against Table A.5.

\- Remaining work: Additional field-level checks and validation of the complete structured dataset are still required.



\## 8. Structural Quality Checks



The structured CSV file was inspected in Excel.



The following checks were completed:



\- No extra blank data rows were found.

\- As-run test numbers are unique:

&#x20; - O15a: 100

&#x20; - O15b: 101

\- Test Point IDs are distinct:

&#x20; - O15a

&#x20; - O15b

\- Selected numeric fields were checked and displayed as numeric values in Excel:

&#x20; - Sample Diameter

&#x20; - Total Frames

&#x20; - Flow-to-Extinction Setting

&#x20; - Initial O2

&#x20; - Final O2

&#x20; - Final CO

\- No empty cells were found in the O15a row.

\- No empty cells were found in the O15b row.



\### Quality Check Status



\- Structural checks: Passed for the inspected records.

\- Scientific validation: Partially verified.

\- Full dataset validation: Not completed.

## Table A.5 follow-up

Rechecked the two rows and their column headings on printed p. 110 (PDF p. 118) of the [NASA report](../02_Original_Files/BASS_II/TM-20210011385.pdf). The original `initial_o2` and `final_o2` fields retain the uncalibrated readings in vol%. The catalog now also carries the report's calibrated readings.

| Test | Uncalibrated O₂, initial → final (vol%) | Calibrated O₂, initial → final (vol%) | Extinction potentiometer setting |
| --- | --- | --- | --- |
| O15a | 16.0 → 15.6 | 17.1 → 16.7 | 0.32 |
| O15b | 15.6 → 14.5 | 16.7 → 15.6 | 0.27 |

The values currently served on `develop` (15.6 → 15.2 and 15.2 → 14.9) match neither column pair. Table A.5 reports 5 cm/s during the initial part of each test, then records the extinction endpoints as potentiometer settings. Sections 1.1 and 6.1 describe calibrating fan voltage against air velocity by operations day and flow restrictor. Both rows used restrictor 2 on GMT 209. The report and checked-in proof sheets did not yield a matching calibration curve for the low-flow endpoints, so the catalog retains the raw settings. The checks here cover oxygen and the reported settings. They do not replace the earlier review status for other fields.

## Figure 6.4 staged airflow

The [stage catalog](../03_Investigation_Catalog/BASS_II_Fig_6_4_Airflow_Stages.csv) follows the five plateaus of the red airflow trace on printed p. 71 (PDF p. 79). The values and transition times are approximate visual readings from the axes. The initial plateau start is blank because the trace starts after time zero. The text on pp. 69-70 supplies the initial and final oxygen values and reports that quenching occurred more than 100 s after the last airflow change. Intermediate oxygen values are blank. This sequence has a figure-based ID and is kept separate from O15a and O15b.

