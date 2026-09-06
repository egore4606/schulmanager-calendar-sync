<div align="center">

# 🗓️ Schulmanager Calendar Sync

**Synchronisiert einen Stundenplan aus Schulmanager Online automatisch mit Google Calendar.**

[English](../README.md) · [Deutsch](README.de.md) · [Русский](README.ru.md)

</div>

> [!IMPORTANT]
> Dies ist ein inoffizielles Community-Projekt ohne Verbindung zu Schulmanager Online oder Google. Verwende es nur mit Konten und Kalendern, auf die du zugreifen darfst. Da Schulmanager keine dokumentierte öffentliche Stundenplan-API anbietet, können Änderungen an der Plattform Anpassungen erfordern.

## Funktionen

- regelmäßige Synchronisierung eines konfigurierbaren Zeitraums;
- stabile Google-Calendar-Ereignisse statt Duplikate;
- Räume, Lehrkräfte, Vertretungen, Sonderstunden und optionale Ausfälle;
- anpassbare Ereignistitel, Fach-Emojis und durchgestrichene abgesagte Stunden;
- korrekte Zeitzonen- und Sommerzeitbehandlung für `Europe/Berlin`;
- lokaler Health-Check und privacy-reduzierte Statusdateien;
- unprivilegierter Docker-Container mit schreibgeschütztem Dateisystem.

## Schnellstart

```bash
git clone https://github.com/egore4606/schulmanager-calendar-sync.git
cd schulmanager-calendar-sync
cp .env.example .env
mkdir -p data
chmod 600 .env
```

Trage einen aktuellen `SCHULMANAGER_TOKEN` in `.env` ein. Für Google Calendar:

1. Google Calendar API aktivieren und ein Servicekonto erstellen.
2. Den JSON-Schlüssel als `data/google-service-account.json` speichern.
   Nur dem Hostkonto und Containerbenutzer, die den Dienst ausführen, Lesezugriff geben; der Schlüssel darf nicht weltweit lesbar sein.
3. Den Zielkalender für die `client_email` des Servicekontos mit Bearbeitungsrechten freigeben.
4. `GOOGLE_CALENDAR_SYNC_ENABLED=true` und `GOOGLE_CALENDAR_ID` setzen.

Danach:

```bash
docker compose up -d --build
docker compose logs -f schulmanager-calendar
curl -i http://127.0.0.1:8080/health
```

Die vollständige Konfiguration steht in [CONFIGURATION.md](CONFIGURATION.md), Datenschutzinformationen in [PRIVACY.md](PRIVACY.md) und Betriebs-/Rollback-Hinweise in [OPERATIONS.md](OPERATIONS.md).

## Datenschutz

`.env`, Servicekonto-Schlüssel, Tokens und `data/` dürfen niemals in Git eingecheckt oder in Issues geteilt werden. Das normalisierte `schedule.json` enthält keine vollständigen rohen Schulmanager-Antwortobjekte. Sicherheitsprobleme bitte gemäß [SECURITY.md](../SECURITY.md) privat melden.

## Entwicklung

```bash
npm run verify
```

Das Projekt verwendet ausschließlich Node.js-Bordmittel und hat keine Runtime-Abhängigkeiten aus npm.

## Lizenz

[MIT](../LICENSE)
