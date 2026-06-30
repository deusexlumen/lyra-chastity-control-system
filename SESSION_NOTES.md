# LYRA Session Notes

## 2026-07-01 - Emlalock API-Korrektur

- **Entscheidung/Problem:** Negativ-Strafen (Zeitreduktion) nutzten das nicht existierende Endpoint `/removesessiontime` und ignorierten den `holderapikey`.
- **Lösung:** `src/lib/emlalockService.ts` sendet positive Minuten als `/addrandom` (Sekunden) **und** erhöht gleichzeitig die Maximalzeit über `/addmaximum` um denselben Wert. Negative Minuten werden als `/sub` mit `holderapikey` und `value` (Sekunden) gesendet. `server.ts` übergibt `db.keys.holder` an `queuePenalty`, `applyPenalty` und `processQueue`.
- **Offen/TODO:** `dist-server/` ist jetzt in `.gitignore`; bei Produktions-Deployment muss `dist-server` lokal neu gebaut werden.
- **Kontext:** Offizielle Emlalock-Doku sieht für Zeitabsenkung zwingend `/sub` mit Holder-Key vor.
- **Betroffene Dateien:**
  - `src/lib/emlalockService.ts`
  - `server.ts`
  - `tests/emlalockService.test.ts`
  - `tests/integration.test.ts`

## 2026-07-01 - Security-Cleanup

- **Entscheidung/Problem:** `server.ts` enthielt hartcodierte API-Keys und Credentials.
- **Lösung:** Alle Secrets aus `server.ts` entfernt und in `.env` (gitignored) verschoben. `/api/defaults` liefert keine Secrets mehr aus. `.env`, `local_db.json` und `dist-server/` wurden in `.gitignore` aufgenommen; `dist-server/` aus dem Index entfernt. `AGENTS.md` Sicherheitssektion aktualisiert.
- **Betroffene Dateien:**
  - `server.ts`
  - `.gitignore`
  - `AGENTS.md`
  - `SESSION_NOTES.md`

## 2026-07-01 - v2.2 Freedom Loop & Assessment

- **Entscheidung/Problem:** Spezifikation für narrative Backstory, Assessment-Modul, Freedom-Loop und langfristige Beziehungsdynamik umsetzen.
- **Lösung:**
  - `UserProfile` um `freedom_phase`, `active_promises`, `assessment_completed`, `sissy_identity_level`, `relationship_perception` erweitert.
  - Neue Action-Tags: `SET_FREEDOM_CONDITION`, `RECORD_PROMISE`, `FORCE_HYPNO_SESSION`, `ERODE_IDENTITY`, `AMBUSH_LAURA`.
  - `modules.json` komplett überarbeitet: 15 Module mit `intensity_level`, `freedom_condition`, Assessment-Fragen und Backstory-Integration.
  - `moduleLoader.ts` injiziert Backstory, Freedom-Phase, Versprechen, Beziehungskontext und Assessment-Status.
  - `server.ts` verarbeitet `/red` als Hard-Stop, wendet neue Tags an und passt Gemini-Temperatur dynamisch an die Modul-Intensität an.
- **Offen/TODO:** Feinschliff der Beziehungssprache und Test-Sessions (Assessment → Freilassung → Rückkehr).
- **Betroffene Dateien:**
  - `src/types/engine.ts`
  - `src/lib/stateManager.ts`
  - `src/lib/actionParser.ts`
  - `src/lib/moduleLoader.ts`
  - `src/data/modules.json`
  - `server.ts`
  - `tests/actionParser.test.ts`
  - `tests/moduleLoader.test.ts`

## 2026-07-01 - v2.4 Prompt-Set Integration

- **Entscheidung/Problem:** Zentrales Basis-System-Prompt, Hypno-/Mantra-Bausteine und detaillierte ersten 5 Module direkt in der JSON-Struktur hinterlegen.
- **Lösung:**
  - `modules.json` enthält jetzt `global_directives.system_prompt` statt nur `tone`.
  - Module haben neue optionale Felder `slug`, `hypno_intensity` und `milestones`.
  - `moduleLoader.ts` injiziert das zentrale System-Prompt, den Mantra-Kontext und einen modulspezifischen Hypno-Baustein.
  - Module 1–5 wurden an das v2.4 Prompt-Set angeglichen: Assessment, Erwachen, Nuria-Wunde, Tiefe Konditionierung, Nuria-Zeremonie.
- **Betroffene Dateien:**
  - `src/types/engine.ts`
  - `src/lib/moduleLoader.ts`
  - `src/data/modules.json`


## 2026-07-01 - Onboarding Pre-fill & Holder Key

- **Entscheidung/Problem:** API-Keys waren im Onboarding leer, da `/api/defaults` keine Secrets mehr ausgab. Für den lokalen Betrieb aus `.env` sollten die Felder aber vorausgefüllt sein. Außerdem fehlte das Holder-Key-Feld.
- **Lösung:**
  - `/api/defaults` liest `GEMINI_API_KEY`, `EMLA_USER_ID`/`EMLA_API_KEY` und `EMLA_HOLDER_KEY` aus der Umgebung und sendet sie ans Frontend.
  - `Onboarding.tsx` hat ein neues Feld für den Emlalock Holder Key und übermittelt es an `/api/setup`.
  - `AGENTS.md` wurde aktualisiert.
- **Betroffene Dateien:**
  - `server.ts`
  - `src/components/Onboarding.tsx`
  - `AGENTS.md`
  - `SESSION_NOTES.md`


## 2026-07-01 - Onboarding Auto-Setup aus .env

- **Entscheidung/Problem:** Onboarding-Screen blieb bestehen; API-Keys und persönliche Daten sollen vollständig aus `.env` kommen.
- **Lösung:**
  - Neue Env-Vars: `LYRA_REAL_NAME`, `LYRA_EX_NAME`, `LYRA_SETUP_FRIEND`, `LYRA_TRAPPER`, `LYRA_CONTRACT_SIGNED_AT`, `LYRA_CAGE_LOCKED_AT`, `LYRA_KEY_SENT_AT`.
  - Wenn `LYRA_REAL_NAME` gesetzt ist, schließt der Server das Setup automatisch ab und überspringt den Onboarding-Screen.
  - `Onboarding.tsx` füllt alle Felder aus `/api/defaults` vor.
  - `local_db.json` wird nicht mehr versioniert.
  - E-Mail-Bridge vorübergehend in `.env` auf `false` gesetzt, da GMX die SMTP-Transaktion abgelehnt hat.
- **Betroffene Dateien:**
  - `server.ts`
  - `src/components/Onboarding.tsx`
  - `.env.example`
  - `AGENTS.md`
  - `.gitignore`
