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
