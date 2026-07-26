// Простой одностраничный бэкенд заявок для landing_glazur_lab.
//
// Что делает:
//  1. Принимает POST /api/order с формы (имя, телефон, что заказать, пожелания).
//  2. Валидирует данные (телефон РФ +7, обязательно выбранная работа).
//  3. Отправляет заявку в чат MAX-бота с кнопками «Связались / Не связались».
//  4. В фоне через long-polling слушает нажатия этих кнопок и обновляет
//     статус прямо в сообщении заявки.
//
// Секреты (токен бота, id чата) берутся из окружения — см. .env.example.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
)

const (
	maxAPIBase = "https://platform-api.max.ru"
	// разделитель между текстом заявки и строкой статуса — по нему находим и
	// переписываем статус при повторных нажатиях кнопок
	statusSep = "\n— — — — —\n"
)

// ---------------------------------------------------------------------------
// Конфигурация
// ---------------------------------------------------------------------------

type config struct {
	botToken      string
	chatID        int64
	port          string
	allowedOrigin string
	captchaSecret string // серверный ключ Yandex SmartCaptcha; пусто → проверка выключена
}

func loadConfig() (config, error) {
	// .env читаем в map через godotenv и используем как fallback: реальное
	// НЕПУСТОЕ окружение приоритетнее, а пустые/отсутствующие переменные
	// добираем из файла. Так стухший `export MAX_CHAT_ID=` в шелле не ломает
	// запуск, и при этом прод-переменные окружения по-прежнему уважаются.
	fileEnv, _ := godotenv.Read() // нет файла → nil, это ок

	get := func(key string) string {
		if v := os.Getenv(key); v != "" {
			return v
		}
		return fileEnv[key]
	}
	getOr := func(key, def string) string {
		if v := get(key); v != "" {
			return v
		}
		return def
	}

	cfg := config{
		botToken:      get("MAX_BOT_TOKEN"),
		port:          getOr("PORT", "8080"),
		allowedOrigin: getOr("ALLOWED_ORIGIN", "*"),
		captchaSecret: get("SMARTCAPTCHA_SERVER_KEY"),
	}
	if cfg.botToken == "" {
		return cfg, errors.New("MAX_BOT_TOKEN не задан")
	}
	rawChat := get("MAX_CHAT_ID")
	if rawChat == "" {
		return cfg, errors.New("MAX_CHAT_ID не задан")
	}
	id, err := strconv.ParseInt(strings.TrimSpace(rawChat), 10, 64)
	if err != nil {
		return cfg, fmt.Errorf("MAX_CHAT_ID должен быть числом: %w", err)
	}
	cfg.chatID = id
	return cfg, nil
}

// ---------------------------------------------------------------------------
// Модель заявки и валидация
// ---------------------------------------------------------------------------

type orderRequest struct {
	Name         string `json:"name"`
	Phone        string `json:"phone"`
	Wish         string `json:"wish"`
	Message      string `json:"message"`
	CaptchaToken string `json:"captchaToken"`
}

// normalizeRuPhone приводит телефон к виду +7XXXXXXXXXX.
// Принимает 8XXXXXXXXXX, 7XXXXXXXXXX, +7XXXXXXXXXX и 10-значный номер.
func normalizeRuPhone(s string) (string, bool) {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	d := b.String()
	switch {
	case len(d) == 11 && (d[0] == '7' || d[0] == '8'):
		d = "7" + d[1:]
	case len(d) == 10:
		d = "7" + d
	default:
		return "", false
	}
	if len(d) != 11 || d[0] != '7' {
		return "", false
	}
	return "+" + d, true
}

// validate чистит и проверяет заявку, возвращает нормализованный телефон.
func (o *orderRequest) validate() (phone string, err error) {
	o.Name = strings.TrimSpace(o.Name)
	o.Wish = strings.TrimSpace(o.Wish)
	o.Message = strings.TrimSpace(o.Message)

	if o.Name == "" {
		return "", errors.New("укажите имя")
	}
	if len(o.Name) > 100 {
		return "", errors.New("слишком длинное имя")
	}
	if o.Wish == "" {
		return "", errors.New("выберите, что хотите заказать")
	}
	if len(o.Message) > 1000 {
		return "", errors.New("слишком длинное пожелание")
	}
	phone, ok := normalizeRuPhone(o.Phone)
	if !ok {
		return "", errors.New("некорректный номер телефона")
	}
	return phone, nil
}

// ---------------------------------------------------------------------------
// MAX Bot API — типы
// ---------------------------------------------------------------------------

type maxButton struct {
	Type    string `json:"type"`
	Text    string `json:"text"`
	Payload string `json:"payload"`
	Intent  string `json:"intent,omitempty"`
}

type maxKeyboardPayload struct {
	Buttons [][]maxButton `json:"buttons"`
}

type maxAttachment struct {
	Type    string             `json:"type"`
	Payload maxKeyboardPayload `json:"payload"`
}

type maxSendMessage struct {
	Text        string          `json:"text"`
	Attachments []maxAttachment `json:"attachments,omitempty"`
}

// updates
type maxUpdatesResponse struct {
	Updates []maxUpdate `json:"updates"`
	Marker  *int64      `json:"marker"`
}

type maxUpdate struct {
	UpdateType string       `json:"update_type"`
	Callback   *maxCallback `json:"callback"`
	Message    *maxMessage  `json:"message"`
}

type maxCallback struct {
	CallbackID string  `json:"callback_id"`
	Payload    string  `json:"payload"`
	User       maxUser `json:"user"`
}

type maxUser struct {
	Name     string `json:"name"`
	Username string `json:"username"`
}

type maxMessage struct {
	Body maxMessageBody `json:"body"`
}

type maxMessageBody struct {
	Text string `json:"text"`
}

// ---------------------------------------------------------------------------
// MAX Bot API — клиент
// ---------------------------------------------------------------------------

type maxClient struct {
	token string
	http  *http.Client
}

func newMaxClient(token string) *maxClient {
	return &maxClient{token: token, http: &http.Client{Timeout: 40 * time.Second}}
}

func (c *maxClient) endpoint(path string, params url.Values) string {
	if len(params) == 0 {
		return maxAPIBase + path
	}
	return maxAPIBase + path + "?" + params.Encode()
}

// newRequest создаёт запрос с авторизацией MAX. Токен кладётся в заголовок
// Authorization КАК ЕСТЬ, без префикса Bearer (query-параметр access_token
// задепрекейчен, Bearer вызывает "Malformed access token").
func (c *maxClient) newRequest(ctx context.Context, method, u string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, u, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", c.token)
	return req, nil
}

// orderKeyboard — кнопки статуса заявки.
func orderKeyboard() []maxAttachment {
	return []maxAttachment{{
		Type: "inline_keyboard",
		Payload: maxKeyboardPayload{Buttons: [][]maxButton{{
			{Type: "callback", Text: "✅ Связались", Payload: "contacted", Intent: "positive"},
			{Type: "callback", Text: "❌ Не связались", Payload: "not_contacted", Intent: "negative"},
		}}},
	}}
}

// sendOrder публикует заявку в целевой чат.
func (c *maxClient) sendOrder(ctx context.Context, chatID int64, text string) error {
	body := maxSendMessage{Text: text, Attachments: orderKeyboard()}
	u := c.endpoint("/messages", url.Values{"chat_id": {strconv.FormatInt(chatID, 10)}})
	return c.postJSON(ctx, u, body)
}

// answerCallback отвечает на нажатие кнопки: обновляет текст сообщения и
// показывает нажавшему короткое уведомление.
func (c *maxClient) answerCallback(ctx context.Context, callbackID, newText, notification string) error {
	payload := map[string]any{
		"message":      maxSendMessage{Text: newText, Attachments: orderKeyboard()},
		"notification": notification,
	}
	u := c.endpoint("/answers", url.Values{"callback_id": {callbackID}})
	return c.postJSON(ctx, u, payload)
}

func (c *maxClient) getUpdates(ctx context.Context, marker int64) (maxUpdatesResponse, error) {
	params := url.Values{"timeout": {"30"}, "limit": {"100"}, "types": {"message_callback"}}
	if marker > 0 {
		params.Set("marker", strconv.FormatInt(marker, 10))
	}
	u := c.endpoint("/updates", params)
	req, err := c.newRequest(ctx, http.MethodGet, u, nil)
	if err != nil {
		return maxUpdatesResponse{}, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return maxUpdatesResponse{}, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return maxUpdatesResponse{}, fmt.Errorf("updates: %d %s", resp.StatusCode, string(data))
	}
	var out maxUpdatesResponse
	if err := json.Unmarshal(data, &out); err != nil {
		return maxUpdatesResponse{}, err
	}
	return out, nil
}

func (c *maxClient) postJSON(ctx context.Context, u string, body any) error {
	buf, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := c.newRequest(ctx, http.MethodPost, u, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("MAX API %d: %s", resp.StatusCode, string(data))
	}
	return nil
}

// ---------------------------------------------------------------------------
// Yandex SmartCaptcha — серверная проверка токена
// ---------------------------------------------------------------------------

const smartCaptchaValidateURL = "https://smartcaptcha.yandexcloud.net/validate"

var captchaHTTP = &http.Client{Timeout: 5 * time.Second}

// verifyCaptcha подтверждает токен у Яндекса нашим серверным ключом.
// Возвращает (true, nil) если человек. При сетевой ошибке Яндекса —
// fail-open (пропускаем), как рекомендует их дока, чтобы не терять реальных
// клиентов, если сервис капчи недоступен. При явном "failed" — отклоняем.
func verifyCaptcha(ctx context.Context, secret, token, ip string) (bool, error) {
	form := url.Values{"secret": {secret}, "token": {token}}
	if ip != "" {
		form.Set("ip", ip)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, smartCaptchaValidateURL, strings.NewReader(form.Encode()))
	if err != nil {
		return true, err // не смогли даже собрать запрос — не наказываем клиента
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := captchaHTTP.Do(req)
	if err != nil {
		return true, fmt.Errorf("captcha недоступна (fail-open): %w", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return true, fmt.Errorf("captcha HTTP %d (fail-open): %s", resp.StatusCode, string(data))
	}
	var out struct {
		Status  string `json:"status"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return true, fmt.Errorf("captcha невалидный ответ (fail-open): %w", err)
	}
	return out.Status == "ok", nil
}

// clientIP достаёт реальный IP клиента с учётом обратного прокси (Caddy шлёт
// X-Forwarded-For). Берём первый адрес в цепочке, иначе — RemoteAddr.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i >= 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// ---------------------------------------------------------------------------
// Форматирование текста заявки
// ---------------------------------------------------------------------------

var mskLocation = loadMSK()

func loadMSK() *time.Location {
	if loc, err := time.LoadLocation("Europe/Moscow"); err == nil {
		return loc
	}
	return time.FixedZone("MSK", 3*60*60)
}

func formatOrder(o orderRequest, phone string, at time.Time) string {
	var b strings.Builder
	b.WriteString("🌸 Новая заявка\n\n")
	fmt.Fprintf(&b, "👤 От кого: %s\n", o.Name)
	fmt.Fprintf(&b, "📞 Телефон: %s\n", phone)
	fmt.Fprintf(&b, "💐 Что хочет: %s\n", o.Wish)
	if o.Message != "" {
		fmt.Fprintf(&b, "📝 Пожелания: %s\n", o.Message)
	}
	fmt.Fprintf(&b, "🕒 Когда: %s (МСК)", at.In(mskLocation).Format("02.01.2006 15:04"))
	return b.String()
}

// statusLine — строка статуса, добавляемая после нажатия кнопки.
func statusLine(payload, who string, at time.Time) string {
	label := "✅ Связались"
	if payload == "not_contacted" {
		label = "❌ Не связались"
	}
	who = strings.TrimSpace(who)
	if who == "" {
		who = "менеджер"
	}
	return fmt.Sprintf("%s · %s · %s", label, who, at.In(mskLocation).Format("15:04"))
}

// applyStatus заменяет прежний статус (если был) на новый.
func applyStatus(text, status string) string {
	base := text
	if idx := strings.Index(text, statusSep); idx >= 0 {
		base = text[:idx]
	}
	return base + statusSep + status
}

// ---------------------------------------------------------------------------
// HTTP-хендлеры
// ---------------------------------------------------------------------------

type server struct {
	cfg config
	max *maxClient
}

func (s *server) withCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", s.cfg.allowedOrigin)
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(body)
}

func (s *server) handleOrder(w http.ResponseWriter, r *http.Request) {
	s.withCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "только POST"})
		return
	}

	var req orderRequest
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<16))
	if err := dec.Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "некорректный JSON"})
		return
	}

	phone, err := req.validate()
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}

	// Проверка капчи — только если задан серверный ключ (иначе шаг пропускаем,
	// удобно для локальной разработки без капчи).
	if s.cfg.captchaSecret != "" {
		if req.CaptchaToken == "" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "подтвердите, что вы не робот"})
			return
		}
		vctx, vcancel := context.WithTimeout(r.Context(), 6*time.Second)
		ok, verr := verifyCaptcha(vctx, s.cfg.captchaSecret, req.CaptchaToken, clientIP(r))
		vcancel()
		if verr != nil {
			log.Printf("проверка капчи: %v", verr) // fail-open уже учтён в ok
		}
		if !ok {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "капча не пройдена, попробуйте ещё раз"})
			return
		}
	}

	text := formatOrder(req, phone, time.Now())
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := s.max.sendOrder(ctx, s.cfg.chatID, text); err != nil {
		log.Printf("отправка заявки в MAX не удалась: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "не удалось отправить заявку, попробуйте позже"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---------------------------------------------------------------------------
// Фоновый long-polling: обработка нажатий кнопок
// ---------------------------------------------------------------------------

func (s *server) pollUpdates(ctx context.Context) {
	var marker int64
	log.Println("long-polling MAX запущен")
	for {
		if ctx.Err() != nil {
			return
		}
		resp, err := s.max.getUpdates(ctx, marker)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("getUpdates: %v", err)
			time.Sleep(3 * time.Second)
			continue
		}
		for _, u := range resp.Updates {
			if u.UpdateType == "message_callback" {
				s.handleCallback(ctx, u)
			}
		}
		if resp.Marker != nil {
			marker = *resp.Marker
		}
	}
}

func (s *server) handleCallback(ctx context.Context, u maxUpdate) {
	if u.Callback == nil || u.Message == nil {
		return
	}
	status := statusLine(u.Callback.Payload, u.Callback.User.Name, time.Now())
	newText := applyStatus(u.Message.Body.Text, status)

	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	if err := s.max.answerCallback(cctx, u.Callback.CallbackID, newText, "Статус обновлён"); err != nil {
		log.Printf("answerCallback: %v", err)
	}
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("конфигурация: %v", err)
	}

	srv := &server{cfg: cfg, max: newMaxClient(cfg.botToken)}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go srv.pollUpdates(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/order", srv.handleOrder)
	mux.HandleFunc("/healthz", srv.handleHealth)

	httpServer := &http.Server{
		Addr:         ":" + cfg.port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 20 * time.Second,
	}

	go func() {
		log.Printf("HTTP-сервер слушает :%s", cfg.port)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("сервер остановлен с ошибкой: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("останавливаемся…")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdownCtx)
}
