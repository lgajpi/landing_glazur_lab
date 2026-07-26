# Деплой на прод (Caddy + Go-бэк)

Схема: **Caddy** отдаёт статику по HTTPS и проксирует `/api/*` на **Go-бэк**,
который висит рядом на `127.0.0.1:8085` и шлёт заявки в чат MAX-бота.

```
браузер ──HTTPS──> Caddy :443 ──┬── статика (index.html, css, js, images)
                                └── /api/* ──> Go-бэк 127.0.0.1:8085 ──> MAX Bot API
```

## 0. Предпосылки
- Linux-сервер, домен с A/AAAA-записью на IP сервера, открыты порты 80 и 443.
- Установлены Caddy (`apt install caddy` из офиц. репозитория) и Go 1.26+.
- В настройках Yandex SmartCaptcha в списке доменов добавлен прод-домен.

## 1. Разложить файлы
```bash
sudo mkdir -p /opt/glazur
sudo rsync -a --exclude backend/.env ./ /opt/glazur/   # статика + backend/
```
Структура: `/opt/glazur/index.html …`, `/opt/glazur/backend/`.

## 2. Собрать и настроить бэк
```bash
cd /opt/glazur/backend
go build -o glazur-orders .
cp .env.example .env      # заполнить реальными значениями:
# MAX_BOT_TOKEN=…  MAX_CHAT_ID=…  SMARTCAPTCHA_SERVER_KEY=…  PORT=8085
#(клиентский ключ капчи ysc1_… уже во фронте, в .env только SERVER_KEY)
```

## 3. Бэк как сервис (systemd)
```bash
sudo cp deploy/glazur-orders.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now glazur-orders
journalctl -u glazur-orders -f          # проверить логи запуска
```

## 4. Caddy
```bash
sudo cp Caddyfile.prod /etc/caddy/Caddyfile   # заменить домен на свой!
sudo systemctl reload caddy
```
Caddy сам выпустит и продлит TLS-сертификат.

## 5. Проверка
```bash
curl -s localhost:8085/healthz                              # бэк жив (на сервере)
curl -s https://ВАШ-ДОМЕН/api/order -X OPTIONS -i | head -1 # 204 = Caddy проксирует /api
```
Открыть сайт, отправить тестовую заявку → должна прийти в MAX-группу с кнопками.

## Обновление (деплой новой версии)
```bash
cd /opt/glazur && git pull
cd backend && go build -o glazur-orders .
sudo systemctl restart glazur-orders
sudo systemctl reload caddy          # только если менялся Caddyfile
```

## Заметки
- `/healthz` бэка не проксируется (Caddy шлёт на бэк только `/api/*`). Хочешь
  внешний health — дёргай локально на сервере: `curl localhost:8085/healthz`.
- `ALLOWED_ORIGIN` в проде можно оставить пустым/`*`: страница и API — один
  origin (домен Caddy), CORS не участвует.
- Бэк слушает только `127.0.0.1:8085` — снаружи недоступен, весь трафик идёт
  через Caddy.
