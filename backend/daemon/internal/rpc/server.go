// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package rpc

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"runtime/debug"
	"sync"

	"cloudsprocket/backend/daemon/internal/rpcapi"
)

const (
	maxRequestBytes      = 1024 * 1024
	maxConcurrentRequest = 32
)

type Handler interface {
	Handle(context.Context, string, json.RawMessage, rpcapi.Notifier) (any, error)
}

type Server struct {
	handler Handler
	logger  *log.Logger
	workers chan struct{}
	writer  *bufio.Writer
	mu      sync.Mutex
	wg      sync.WaitGroup
}

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *responseError  `json:"error,omitempty"`
}

type responseError struct {
	Code    int               `json:"code"`
	Message string            `json:"message"`
	Data    responseErrorData `json:"data"`
}

type responseErrorData struct {
	Code string `json:"code"`
}

func New(handler Handler) *Server {
	return NewWithLogger(handler, log.New(io.Discard, "", 0))
}

func NewWithLogger(handler Handler, logger *log.Logger) *Server {
	if logger == nil {
		logger = log.New(io.Discard, "", 0)
	}
	return &Server{
		handler: handler,
		logger:  logger,
		workers: make(chan struct{}, maxConcurrentRequest),
	}
}

func (s *Server) Serve(ctx context.Context, in io.Reader, out io.Writer) error {
	s.mu.Lock()
	if s.writer != nil {
		s.mu.Unlock()
		return errors.New("rpc server is already serving")
	}
	s.writer = bufio.NewWriter(out)
	s.mu.Unlock()

	// Read lines on a helper so the serve loop can also honour ctx cancellation
	// (SIGINT/SIGTERM via signal.NotifyContext). Stdin EOF remains the normal
	// sidecar shutdown path when Tauri closes the pipe.
	type readOutcome struct {
		line     []byte
		tooLarge bool
		err      error
	}
	outcomes := make(chan readOutcome)
	go func() {
		reader := bufio.NewReaderSize(in, 64*1024)
		for {
			line, tooLarge, err := readRequestLine(reader)
			select {
			case outcomes <- readOutcome{line: line, tooLarge: tooLarge, err: err}:
			case <-ctx.Done():
				return
			}
			if err != nil {
				return
			}
		}
	}()

	var serveErr error
loop:
	for {
		select {
		case <-ctx.Done():
			serveErr = ctx.Err()
			break loop
		case outcome := <-outcomes:
			if outcome.tooLarge {
				s.logger.Printf("rpc request rejected: payload exceeds %d bytes", maxRequestBytes)
				_ = s.write(errorResponse(nullID(), -32600, "request_too_large", "The backend request is too large."))
			}
			if !outcome.tooLarge && len(outcome.line) > 0 {
				if err := s.dispatch(ctx, outcome.line); err != nil {
					serveErr = err
					break loop
				}
			}
			if errors.Is(outcome.err, io.EOF) {
				break loop
			}
			if outcome.err != nil {
				serveErr = outcome.err
				break loop
			}
		}
	}

	s.wg.Wait()
	s.mu.Lock()
	s.writer = nil
	s.mu.Unlock()
	return serveErr
}

func (s *Server) dispatch(ctx context.Context, data []byte) error {
	select {
	case s.workers <- struct{}{}:
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			defer func() { <-s.workers }()
			s.handleRequest(ctx, data)
		}()
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *Server) handleRequest(ctx context.Context, data []byte) {
	req := request{ID: nullID()}
	defer func() {
		if recovered := recover(); recovered != nil {
			s.logger.Printf("rpc handler panic: %v\n%s", recovered, debug.Stack())
			_ = s.write(errorResponse(req.ID, -32603, "internal_error", "The backend could not complete the request."))
		}
	}()

	if err := json.Unmarshal(data, &req); err != nil {
		s.logger.Printf("rpc parse error: %v", err)
		_ = s.write(errorResponse(nullID(), -32700, "parse_error", "The backend request is not valid JSON."))
		return
	}
	if req.JSONRPC != "2.0" || req.Method == "" {
		_ = s.write(errorResponse(req.ID, -32600, "invalid_request", "The backend request is invalid."))
		return
	}

	result, err := s.handler.Handle(ctx, req.Method, req.Params, s)
	if err != nil {
		s.logger.Printf("rpc method %s failed: %v", req.Method, err)
		_ = s.write(response{JSONRPC: "2.0", ID: req.ID, Error: classifyError(err)})
		return
	}
	_ = s.write(response{JSONRPC: "2.0", ID: req.ID, Result: result})
}

func (s *Server) Notify(method string, payload any) error {
	return s.write(map[string]any{
		"jsonrpc": "2.0",
		"method":  method,
		"params":  payload,
	})
}

func (s *Server) write(payload any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.writer == nil {
		return errors.New("rpc server is not serving")
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := s.writer.Write(encoded); err != nil {
		return err
	}
	if err := s.writer.WriteByte('\n'); err != nil {
		return err
	}
	return s.writer.Flush()
}

func classifyError(err error) *responseError {
	var public rpcapi.PublicError
	if errors.As(err, &public) {
		return newResponseError(public.JSONRPCCode(), public.StableCode(), public.SafeMessage())
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return newResponseError(-32001, "provider_timeout", "The backend operation timed out.")
	}
	if errors.Is(err, context.Canceled) {
		return newResponseError(-32002, "request_cancelled", "The backend operation was cancelled.")
	}
	var syntaxError *json.SyntaxError
	var typeError *json.UnmarshalTypeError
	if errors.As(err, &syntaxError) || errors.As(err, &typeError) || errors.Is(err, io.ErrUnexpectedEOF) {
		return newResponseError(-32602, "invalid_params", "The backend request parameters are invalid.")
	}
	return newResponseError(-32603, "internal_error", "The backend could not complete the request. Check the diagnostics log for details.")
}

func errorResponse(id json.RawMessage, code int, stableCode, message string) response {
	return response{JSONRPC: "2.0", ID: id, Error: newResponseError(code, stableCode, message)}
}

func newResponseError(code int, stableCode, message string) *responseError {
	return &responseError{Code: code, Message: message, Data: responseErrorData{Code: stableCode}}
}

func nullID() json.RawMessage {
	return json.RawMessage("null")
}

func readRequestLine(reader *bufio.Reader) ([]byte, bool, error) {
	line := make([]byte, 0, 4096)
	tooLarge := false
	for {
		fragment, err := reader.ReadSlice('\n')
		if !tooLarge {
			if len(line)+len(fragment) > maxRequestBytes+2 {
				line = nil
				tooLarge = true
			} else {
				line = append(line, fragment...)
			}
		}

		switch {
		case err == nil:
			line = trimLineEnding(line)
			return line, tooLarge || len(line) > maxRequestBytes, nil
		case errors.Is(err, bufio.ErrBufferFull):
			continue
		case errors.Is(err, io.EOF):
			line = trimLineEnding(line)
			if len(line) == 0 && !tooLarge {
				return nil, false, io.EOF
			}
			return line, tooLarge || len(line) > maxRequestBytes, io.EOF
		default:
			return nil, tooLarge, fmt.Errorf("read rpc request: %w", err)
		}
	}
}

func trimLineEnding(line []byte) []byte {
	if len(line) > 0 && line[len(line)-1] == '\n' {
		line = line[:len(line)-1]
	}
	if len(line) > 0 && line[len(line)-1] == '\r' {
		line = line[:len(line)-1]
	}
	return line
}
