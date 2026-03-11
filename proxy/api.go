package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// ─── Auth ─────────────────────────────────────────────────────────────────────

// checkTeamToken validates the X-Team-Token header against the TEAM_API_KEY env var.
// Returns true if valid, writes a 401 and returns false otherwise.
func checkTeamToken(w http.ResponseWriter, r *http.Request) bool {
	expected := os.Getenv("TEAM_API_KEY")
	token := r.Header.Get("X-Team-Token")

	masked := "(empty)"
	if len(token) > 6 {
		masked = token[:4] + "..." + token[len(token)-2:]
	} else if token != "" {
		masked = "***"
	}

	if expected == "" {
		slog.Error("TEAM_API_KEY env var is not set — rejecting all requests")
		http.Error(w, "server misconfigured", http.StatusInternalServerError)
		return false
	}

	if token == "" || token != expected {
		slog.Warn("token check failed",
			"path", r.URL.Path,
			"token_presented", masked,
			"result", "rejected",
		)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return false
	}

	slog.Debug("token check passed", "path", r.URL.Path, "token_presented", masked)
	return true
}

// ─── /api/proxy/anthropic ─────────────────────────────────────────────────────

// handleAnthropic proxies POST requests to https://api.anthropic.com.
// It preserves the full path (e.g. /v1/messages), body, and headers,
// replacing only the x-api-key header with the server-side key.
func handleAnthropic(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !checkTeamToken(w, r) {
		return
	}

	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		slog.Error("ANTHROPIC_API_KEY not set")
		http.Error(w, "server misconfigured", http.StatusInternalServerError)
		return
	}

	// Strip the /api/proxy/anthropic prefix to get the real downstream path
	// e.g. /api/proxy/anthropic/v1/messages → /v1/messages
	downstreamPath := strings.TrimPrefix(r.URL.Path, "/api/proxy/anthropic")
	if downstreamPath == "" {
		downstreamPath = "/"
	}

	targetURL := "https://api.anthropic.com" + downstreamPath
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	slog.Info("anthropic proxy: outbound request",
		"method", r.Method,
		"upstream_path", r.URL.Path,
		"downstream_url", targetURL,
	)

	body, err := io.ReadAll(r.Body)
	if err != nil {
		slog.Error("anthropic proxy: failed to read request body", "error", err)
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, targetURL, bytes.NewReader(body))
	if err != nil {
		slog.Error("anthropic proxy: failed to build request", "error", err, "url", targetURL)
		http.Error(w, "failed to build upstream request", http.StatusInternalServerError)
		return
	}

	// Forward safe headers from the client
	for _, h := range []string{"Content-Type", "anthropic-version", "anthropic-beta"} {
		if v := r.Header.Get(h); v != "" {
			req.Header.Set(h, v)
		}
	}
	// Inject real key — always overwrite whatever the client sent
	req.Header.Set("x-api-key", apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Error("anthropic proxy: upstream request failed", "error", err, "url", targetURL)
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	slog.Info("anthropic proxy: upstream response",
		"downstream_url", targetURL,
		"status", resp.StatusCode,
	)

	copyResponse(w, resp)
}

// ─── /api/proxy/tavily ────────────────────────────────────────────────────────

// handleTavily proxies POST requests to https://api.tavily.com.
// It injects api_key into the JSON body (overwriting any key the client sent).
func handleTavily(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !checkTeamToken(w, r) {
		return
	}

	apiKey := os.Getenv("TAVILY_API_KEY")
	if apiKey == "" {
		slog.Error("TAVILY_API_KEY not set")
		http.Error(w, "server misconfigured", http.StatusInternalServerError)
		return
	}

	downstreamPath := strings.TrimPrefix(r.URL.Path, "/api/proxy/tavily")
	if downstreamPath == "" {
		downstreamPath = "/search"
	}

	targetURL := "https://api.tavily.com" + downstreamPath
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	slog.Info("tavily proxy: outbound request",
		"method", r.Method,
		"upstream_path", r.URL.Path,
		"downstream_url", targetURL,
	)

	rawBody, err := io.ReadAll(r.Body)
	if err != nil {
		slog.Error("tavily proxy: failed to read request body", "error", err)
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	// Parse and re-inject api_key into the JSON body
	var payload map[string]any
	if len(rawBody) > 0 {
		if err := json.Unmarshal(rawBody, &payload); err != nil {
			slog.Error("tavily proxy: failed to parse JSON body", "error", err)
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
	} else {
		payload = make(map[string]any)
	}
	payload["api_key"] = apiKey

	injected, err := json.Marshal(payload)
	if err != nil {
		slog.Error("tavily proxy: failed to re-marshal body", "error", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, targetURL, bytes.NewReader(injected))
	if err != nil {
		slog.Error("tavily proxy: failed to build request", "error", err, "url", targetURL)
		http.Error(w, "failed to build upstream request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Error("tavily proxy: upstream request failed", "error", err, "url", targetURL)
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	slog.Info("tavily proxy: upstream response",
		"downstream_url", targetURL,
		"status", resp.StatusCode,
	)

	copyResponse(w, resp)
}

// ─── /api/proxy/youtube ───────────────────────────────────────────────────────

// handleYouTube proxies GET requests to https://www.googleapis.com/youtube/v3.
// It appends the real YouTube API key as the `key` query parameter.
func handleYouTube(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !checkTeamToken(w, r) {
		return
	}

	apiKey := os.Getenv("YOUTUBE_API_KEY")
	if apiKey == "" {
		slog.Error("YOUTUBE_API_KEY not set")
		http.Error(w, "server misconfigured", http.StatusInternalServerError)
		return
	}

	// Strip /api/proxy/youtube, keep the rest as the v3 path
	// e.g. /api/proxy/youtube/search → /youtube/v3/search
	subPath := strings.TrimPrefix(r.URL.Path, "/api/proxy/youtube")
	if subPath == "" {
		subPath = "/search"
	}
	downstreamPath := "/youtube/v3" + subPath

	// Rebuild query params, injecting the real key (strip any key the client sent)
	q := r.URL.Query()
	q.Del("key")
	q.Set("key", apiKey)

	targetURL := "https://www.googleapis.com" + downstreamPath + "?" + q.Encode()

	slog.Info("youtube proxy: outbound request",
		"method", r.Method,
		"upstream_path", r.URL.Path,
		"downstream_url", maskURL(targetURL, "key"),
	)

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, targetURL, nil)
	if err != nil {
		slog.Error("youtube proxy: failed to build request", "error", err, "url", targetURL)
		http.Error(w, "failed to build upstream request", http.StatusInternalServerError)
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Error("youtube proxy: upstream request failed", "error", err, "url", targetURL)
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	slog.Info("youtube proxy: upstream response",
		"downstream_url", maskURL(targetURL, "key"),
		"status", resp.StatusCode,
	)

	copyResponse(w, resp)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// copyResponse writes the upstream response status, headers, and body to w.
func copyResponse(w http.ResponseWriter, resp *http.Response) {
	// Forward safe response headers
	for _, h := range []string{"Content-Type", "Content-Length", "X-Request-Id"} {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	if _, err := io.Copy(w, resp.Body); err != nil {
		slog.Error("failed to copy upstream response body", "error", err)
	}
}

// maskURL returns the URL string with the given query parameter value replaced by "***".
func maskURL(rawURL, param string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	q := u.Query()
	if q.Get(param) != "" {
		q.Set(param, "***")
		u.RawQuery = q.Encode()
	}
	return u.String()
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

// corsMiddleware adds CORS headers so Chrome extensions (and localhost) can call
// the deployed proxy. Chrome extensions send Origin: chrome-extension://<id>.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if strings.HasPrefix(origin, "chrome-extension://") ||
			strings.HasPrefix(origin, "http://localhost") ||
			strings.HasPrefix(origin, "https://localhost") {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers",
				"Content-Type, X-Team-Token, anthropic-version, anthropic-beta")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ─── Routes ───────────────────────────────────────────────────────────────────

func registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/proxy/anthropic", handleAnthropic)
	mux.HandleFunc("/api/proxy/anthropic/", handleAnthropic)

	mux.HandleFunc("/api/proxy/tavily", handleTavily)
	mux.HandleFunc("/api/proxy/tavily/", handleTavily)

	mux.HandleFunc("/api/proxy/youtube", handleYouTube)
	mux.HandleFunc("/api/proxy/youtube/", handleYouTube)

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, `{"status":"ok"}`)
	})
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	// Structured JSON logging
	logLevel := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "debug" {
		logLevel = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: logLevel,
	})))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	registerRoutes(mux)

	slog.Info("tailr proxy server starting", "port", port)
	if err := http.ListenAndServe(":"+port, corsMiddleware(mux)); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}
