# Пример meeting-sync

Референс-интеграция для **партнёров по расшифровке голоса** — как сервисы вроде Fireflies
выгружают заметки о встречах в рабочее пространство, только для Collabis. После завершения
встречи её расшифровка и краткое содержание записываются в Collabis одним из двух способов:

| Скрипт          | Результат                                                 | Аналогия                             |
| --------------- | --------------------------------------------------------- | ------------------------------------ |
| `sync:subpage`  | **Подстраница** под выбранной родительской страницей      | Как это делает Fireflies             |
| `sync:database` | **Строка** в базе «Meetings» с типизированными свойствами | Более структурно / можно запрашивать |

Оба пишут одинаковое тело: callout с кратким содержанием, детали встречи, ключевые пункты,
задачи в виде чекбоксов, закладку на запись и полную расшифровку (добавляется частями по
≤100 блоков, чтобы длинные расшифровки не упирались в лимит на запрос).

## Как выглядит синхронизированная встреча

```
🎙️  Public API launch sync — 2026-07-07
┌────────────────────────────────────────────┐
│ 📝  The team confirmed the public REST API… │  ← callout (краткое содержание)
└────────────────────────────────────────────┘
Details
 • Date: Tue, 07 Jul 2026 10:00:00 GMT
 • Duration: 32 min
 • Attendees: Igor S., Maria K., Alex D.
Key points
 • API is validated on stage end-to-end.
 • …
Action items
 ☐ Publish @collabis/client to npm  — Igor S.
 ☑ Reach out to the first transcription partner  — Alex D.
Recording
 🔖 Open transcript & audio
Transcript
 Igor S.: The API passed the full e2e run on stage…
 …
```

## Запуск

```sh
cp .env.example .env      # заполните COLLABIS_TOKEN и COLLABIS_PARENT_PAGE_ID
npm install
npm run sync:subpage      # или: npm run sync:database
```

`COLLABIS_TOKEN` — это OAuth 2.1 bearer-токен доступа, у которого audience равен
`https://api.collabis.ru` (origin API при необходимости переопределяется через `COLLABIS_BASE_URL`).
`COLLABIS_PARENT_PAGE_ID` — страница, которая примет подстраницу (или будет держать базу
«Meetings»).

Ещё нет токена? Получите его через [пример oauth-cli](../oauth-cli) (`npm run login`) — он
выполняет флоу OAuth 2.1 + PKCE и печатает токен доступа. Продакшн-интеграция вместо этого
хранит refresh-токен и передаёт `createTokenProvider(...)` в `auth` клиента, чтобы он
обновлялся сам.

## Подключение вашего провайдера

Смапьте payload вебхука вашего провайдера (после встречи) в форму
[`MeetingTranscript`](./src/meeting.ts), затем вызовите `syncMeetingToSubpage(...)` или
`syncMeetingToDatabase(...)`. Модуль [`format.ts`](./src/format.ts) превращает
`MeetingTranscript` в блоки Collabis — это единственная часть, которую вы кастомизируете под
свою вёрстку.
