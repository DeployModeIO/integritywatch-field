# LinkedIn post — operator campaign

**Video:** `promo/out/integritywatch-field-operators-en.mp4` (1:19, 1080p, English VO + burned subtitles)
**Subtitles:** `promo/out/integritywatch-field-operators-en.srt` / `.ass`
**Test record:** `docs/PRUEBAS-CAMPO-OPERADORES-2026-10-31.md`

---

## Post copy (EN)

A shift still ends the same way in most plants: a clipboard, a tired operator, and numbers retyped at the office hours later.

Meanwhile the console is drowning. EEMUA 191 puts the alarm-flood threshold at **10 alarms in 10 minutes** per operator. Above that, nobody is reading individual alarms — they are surviving them.

We tested the workflow where it actually happens: on the tablet, with no signal.

Three roles, one session:

→ **Refinery operator** — CDU overhead point, unit registered with its RBI band, overdue relief valve surfaced automatically, dossier generated on device
→ **Plant operator** — equipment against ISO 14224, inspection interval derived from the risk band
→ **Pipeline operator** — real UKCS line attributes, line asset at km 12.4, severe ILI finding, map view

Verified in the run: **48/48 CSV rows imported, 0 skipped, 0 errors**; 6 points; 3 assets; 2 overdue PSVs; 25 recommendations; 121 KB evidence package exported — all offline.

Real data: refinery sites and capacities from the EIA-820 report; pipeline attributes from NSTA open data. Derived series are labelled as derived in every row.

No server. No cloud. No connection.

Repo in the first comment.

#OilAndGas #Refinery #PipelineIntegrity #PlantOperations #InspectionMaintenance #OfflineFirst #ISO14224 #EEMUA191

---

## First comment

Repo: https://github.com/DeployModeIO/integritywatch-field
Data provenance: `docs/FIELD-DATA-SOURCES-OPERATORS.md` — EIA Refinery Capacity Report 2026 (Form EIA-820), NSTA UKCS infrastructure, HSE Offshore Statistics 2024, plus API RP 1130/1175/1168 and EEMUA 191 as the operator-pain references.

---

## Notes

- No third-party logos or company names: sites are referenced by location only.
- Alarm-flood figure quoted from EEMUA 191 / ISA-18.2 (10 alarms in 10 minutes).
- 1:19 fits LinkedIn's preferred range and keeps the step-by-step legible.
