<div align="center">

# 🗓️ Schulmanager Calendar Sync

**Автоматически синхронизирует расписание Schulmanager Online с Google Calendar.**

[English](../README.md) · [Deutsch](README.de.md) · [Русский](README.ru.md)

</div>

> [!IMPORTANT]
> Это неофициальный проект сообщества, не связанный с Schulmanager Online или Google. Используйте его только с учётной записью и календарём, к которым у вас есть законный доступ. У Schulmanager нет документированного публичного API расписания, поэтому изменения сервиса могут потребовать обновления программы.

## Возможности

- периодическая синхронизация настраиваемого диапазона недель;
- стабильные идентификаторы событий без дубликатов;
- кабинеты, преподаватели, замены, специальные и отменённые уроки;
- корректная работа часового пояса `Europe/Berlin` и переходов летнего времени;
- локальная проверка состояния и сокращённые с точки зрения приватности snapshots;
- непривилегированный Docker-контейнер с read-only filesystem.

## Быстрый запуск

```bash
git clone https://github.com/egore4606/schulmanager-calendar-sync.git
cd schulmanager-calendar-sync
cp .env.example .env
mkdir -p data
```

Добавьте актуальный `SCHULMANAGER_TOKEN` в `.env`. Для Google Calendar:

1. Включите Google Calendar API и создайте service account.
2. Сохраните JSON-ключ как `data/google-service-account.json`.
3. Предоставьте `client_email` service account права редактирования целевого календаря.
4. Задайте `GOOGLE_CALENDAR_SYNC_ENABLED=true` и `GOOGLE_CALENDAR_ID`.

Запуск и проверка:

```bash
docker compose up -d --build
docker compose logs -f schulmanager-calendar
curl -i http://127.0.0.1:8080/health
```

Полный список переменных находится в [CONFIGURATION.md](CONFIGURATION.md), правила работы с данными — в [PRIVACY.md](PRIVACY.md), обновление и откат — в [OPERATIONS.md](OPERATIONS.md).

## Безопасность

Никогда не добавляйте `.env`, ключ service account, токены или содержимое `data/` в Git. Нормализованный `schedule.json` не сохраняет полные исходные объекты ответа Schulmanager. Об уязвимостях сообщайте приватно согласно [SECURITY.md](../SECURITY.md).

## Разработка

```bash
npm run verify
```

Проект использует только встроенные модули Node.js и не имеет runtime-зависимостей npm.

## Лицензия

[MIT](../LICENSE)
