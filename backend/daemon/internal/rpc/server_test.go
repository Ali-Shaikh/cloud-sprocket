// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package rpc

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/rpcapi"
)

type handlerFunc func(context.Context, string, json.RawMessage, rpcapi.Notifier) (any, error)

func (f handlerFunc) Handle(ctx context.Context, method string, params json.RawMessage, notifier rpcapi.Notifier) (any, error) {
	return f(ctx, method, params, notifier)
}

type testResponse struct {
	ID     json.RawMessage `json:"id"`
	Result any             `json:"result"`
	Error  *responseError  `json:"error"`
}

type testPublicError struct{}

func (testPublicError) Error() string       { return "private diagnostic detail" }
func (testPublicError) JSONRPCCode() int    { return -32601 }
func (testPublicError) StableCode() string  { return "method_not_found" }
func (testPublicError) SafeMessage() string { return "This operation is unavailable." }

func TestServerRecoversHandlerPanicAndContinues(t *testing.T) {
	var diagnostics bytes.Buffer
	handler := handlerFunc(func(_ context.Context, method string, _ json.RawMessage, _ rpcapi.Notifier) (any, error) {
		if method == "panic" {
			panic("sensitive panic detail")
		}
		return map[string]any{"ok": true}, nil
	})
	server := NewWithLogger(handler, log.New(&diagnostics, "", 0))
	input := strings.Join([]string{
		`{"jsonrpc":"2.0","id":"panic-id","method":"panic","params":{}}`,
		`{"jsonrpc":"2.0","id":"ok-id","method":"ok","params":{}}`,
	}, "\n") + "\n"

	responses := serveResponses(t, server, input)
	if len(responses) != 2 {
		t.Fatalf("response count = %d, want 2", len(responses))
	}
	byID := responsesByID(responses)
	if got := byID["panic-id"].Error; got == nil || got.Code != -32603 || got.Data.Code != "internal_error" {
		t.Fatalf("panic response = %+v", got)
	}
	if strings.Contains(byID["panic-id"].Error.Message, "sensitive panic detail") {
		t.Fatal("panic detail crossed the RPC boundary")
	}
	if got := byID["ok-id"].Error; got != nil {
		t.Fatalf("request after panic failed: %+v", got)
	}
	if !strings.Contains(diagnostics.String(), "sensitive panic detail") || !strings.Contains(diagnostics.String(), "goroutine") {
		t.Fatalf("diagnostics do not contain panic detail and stack: %s", diagnostics.String())
	}
}

func TestServerKeepsRawHandlerErrorInDiagnostics(t *testing.T) {
	const raw = "AWS request failed for arn:aws:iam::123456789012:role/private"
	var diagnostics bytes.Buffer
	server := NewWithLogger(handlerFunc(func(context.Context, string, json.RawMessage, rpcapi.Notifier) (any, error) {
		return nil, errors.New(raw)
	}), log.New(&diagnostics, "", 0))

	responses := serveResponses(t, server, `{"jsonrpc":"2.0","id":"err","method":"aws.test","params":{}}`+"\n")
	got := responses[0].Error
	if got == nil || got.Code != -32603 || got.Data.Code != "internal_error" {
		t.Fatalf("error response = %+v", got)
	}
	if strings.Contains(got.Message, "123456789012") || strings.Contains(got.Message, "arn:aws") {
		t.Fatalf("raw provider detail crossed the RPC boundary: %q", got.Message)
	}
	if !strings.Contains(diagnostics.String(), raw) {
		t.Fatal("raw provider error was not retained in diagnostics")
	}
}

func TestServerUsesPublicErrorContract(t *testing.T) {
	var diagnostics bytes.Buffer
	server := NewWithLogger(handlerFunc(func(context.Context, string, json.RawMessage, rpcapi.Notifier) (any, error) {
		return nil, testPublicError{}
	}), log.New(&diagnostics, "", 0))

	responses := serveResponses(t, server, `{"jsonrpc":"2.0","id":"err","method":"missing","params":{}}`+"\n")
	got := responses[0].Error
	if got == nil || got.Code != -32601 || got.Data.Code != "method_not_found" {
		t.Fatalf("error response = %+v", got)
	}
	if got.Message != "This operation is unavailable." {
		t.Fatalf("safe message = %q", got.Message)
	}
	if !strings.Contains(diagnostics.String(), "private diagnostic detail") {
		t.Fatal("private error was not retained in diagnostics")
	}
}

func TestServerRejectsOversizedRequestAndProcessesNextLine(t *testing.T) {
	server := New(handlerFunc(func(context.Context, string, json.RawMessage, rpcapi.Notifier) (any, error) {
		return "ok", nil
	}))
	input := strings.Repeat("x", maxRequestBytes+1) + "\n" +
		`{"jsonrpc":"2.0","id":"next","method":"ok","params":{}}` + "\n"

	responses := serveResponses(t, server, input)
	if len(responses) != 2 {
		t.Fatalf("response count = %d, want 2", len(responses))
	}
	var oversized, next *testResponse
	for index := range responses {
		if string(responses[index].ID) == "null" {
			oversized = &responses[index]
		} else if responseID(responses[index].ID) == "next" {
			next = &responses[index]
		}
	}
	if oversized == nil || oversized.Error == nil || oversized.Error.Data.Code != "request_too_large" {
		t.Fatalf("oversized response = %+v", oversized)
	}
	if next == nil || next.Error != nil || next.Result != "ok" {
		t.Fatalf("next response = %+v", next)
	}
}

func TestServerBoundsConcurrentHandlers(t *testing.T) {
	var active atomic.Int32
	var maximum atomic.Int32
	handler := handlerFunc(func(context.Context, string, json.RawMessage, rpcapi.Notifier) (any, error) {
		current := active.Add(1)
		defer active.Add(-1)
		for {
			previous := maximum.Load()
			if current <= previous || maximum.CompareAndSwap(previous, current) {
				break
			}
		}
		time.Sleep(5 * time.Millisecond)
		return true, nil
	})
	server := New(handler)
	var input strings.Builder
	for index := 0; index < maxConcurrentRequest*3; index++ {
		fmt.Fprintf(&input, `{"jsonrpc":"2.0","id":%d,"method":"work","params":{}}`+"\n", index)
	}

	responses := serveResponses(t, server, input.String())
	if len(responses) != maxConcurrentRequest*3 {
		t.Fatalf("response count = %d", len(responses))
	}
	if got := maximum.Load(); got > maxConcurrentRequest {
		t.Fatalf("maximum concurrency = %d, limit = %d", got, maxConcurrentRequest)
	} else if got < 2 {
		t.Fatalf("handlers did not run concurrently, maximum = %d", got)
	}
}

func TestNotifyBeforeServeReturnsError(t *testing.T) {
	server := New(handlerFunc(func(context.Context, string, json.RawMessage, rpcapi.Notifier) (any, error) {
		return nil, nil
	}))
	if err := server.Notify("test.event", map[string]any{"ok": true}); err == nil {
		t.Fatal("expected Notify before Serve to return an error")
	}
}

func TestServeStopsOnContextCancel(t *testing.T) {
	server := New(handlerFunc(func(context.Context, string, json.RawMessage, app.Notifier) (any, error) {
		return map[string]any{"ok": true}, nil
	}))
	reader, writer := io.Pipe()
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan error, 1)
	go func() {
		var output bytes.Buffer
		done <- server.Serve(ctx, reader, &output)
	}()

	// Wait until Serve is blocked on the open pipe, then cancel.
	time.Sleep(30 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Serve error = %v, want context.Canceled", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Serve did not stop after context cancellation")
	}

	_ = writer.Close()
	_ = reader.Close()
}

func TestServeEOFStillShutsDownCleanly(t *testing.T) {
	server := New(handlerFunc(func(context.Context, string, json.RawMessage, app.Notifier) (any, error) {
		return "ok", nil
	}))
	var output bytes.Buffer
	input := `{"jsonrpc":"2.0","id":"1","method":"ok","params":{}}` + "\n"
	if err := server.Serve(context.Background(), strings.NewReader(input), &output); err != nil {
		t.Fatalf("Serve on stdin EOF: %v", err)
	}
	responses := []testResponse{}
	decoder := json.NewDecoder(&output)
	for decoder.More() {
		var response testResponse
		if err := decoder.Decode(&response); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		responses = append(responses, response)
	}
	if len(responses) != 1 || responses[0].Error != nil || responses[0].Result != "ok" {
		t.Fatalf("responses = %+v", responses)
	}
}

func serveResponses(t *testing.T, server *Server, input string) []testResponse {
	t.Helper()
	var output bytes.Buffer
	if err := server.Serve(context.Background(), strings.NewReader(input), &output); err != nil {
		t.Fatalf("Serve: %v", err)
	}
	decoder := json.NewDecoder(&output)
	responses := []testResponse{}
	for decoder.More() {
		var response testResponse
		if err := decoder.Decode(&response); err != nil {
			t.Fatalf("decode response: %v\n%s", err, output.String())
		}
		responses = append(responses, response)
	}
	return responses
}

func responsesByID(responses []testResponse) map[string]testResponse {
	result := make(map[string]testResponse, len(responses))
	for _, response := range responses {
		result[responseID(response.ID)] = response
	}
	return result
}

func responseID(value json.RawMessage) string {
	var text string
	if err := json.Unmarshal(value, &text); err == nil {
		return text
	}
	return string(value)
}
