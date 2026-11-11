# SAME-R particle-size validation

The [catalog](../03_Investigation_Catalog/SAME_R_Particle_Size_Results.csv) records two smoke samples from one high-temperature Kapton run aboard the ISS. [Meyer et al., Table 1](https://pmc.ncbi.nlm.nih.gov/articles/PMC7918997/#T1) provides the run-specific numerical results. The [NASA SAME-2 paper](../02_Original_Files/SAME_R/NTRS-20130000422.pdf) identifies run 62 in the unaged and aged microscopy comparison (PDF p. 11, Figure 12).

| Published condition | PSI test | Published net aging (s) | PSI net aging (s) | TEM count mean (µm) | Aerosol moment count mean (µm) |
| --- | --- | --- | --- | --- | --- |
| Unaged | 62 | 38.8 | 39 | 0.180 | 0.148 |
| Aged | 62a | 807.6 | 808 | 0.235 | 0.243 |

The [PSI-101 conditions table](../02_Original_Files/SAME_R/PSI-101_Experimental%20table_SAME-R.csv) identifies 62 as high-temperature aging and 62a as its aged sample. Both list 8.1 cm/s inlet velocity. The aging durations agree at whole-second precision. The study's “unaged” label refers to the earlier sample, which had a nonzero net aging duration.

Transmission electron microscopy (TEM) was performed after flight on particles collected on ISS grids. The moment method derives diameters from aerosol instrument measurements. The catalog preserves both estimates, the diameter of average mass, the reported temperature (574.3 °C), and the number of particles counted by microscopy. The two rows represent conditions within the same run.

Both methods report a larger count mean diameter for the aged Kapton sample. This illustrates why smoke age matters to a detector that responds differently to different particle sizes. The results characterize overheated Kapton under the recorded conditions. The table does not provide an alarm threshold or a detector response time for these two samples.
