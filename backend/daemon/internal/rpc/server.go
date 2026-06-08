package rpc

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"sync"

	"cloudsprocket/backend/daemon/internal/app"
)

type Server struct {
	service *app.Service
	writer  *bufio.Writer
	mu      sync.Mutex
}

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *responseError  `json:"error,omitempty"`
}

type responseError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func New(service *app.Service) *Server {
	return &Server{service: service}
}

func (s *Server) Serve(ctx context.Context, in io.Reader, out io.Writer) error {
	s.writer = bufio.NewWriter(out)

	scanner := bufio.NewScanner(in)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		// Copy the line because scanner.Bytes() is reused on next Scan()
		lineCopy := make([]byte, len(line))
		copy(lineCopy, line)

		go func(data []byte) {
			var req request
			if err := json.Unmarshal(data, &req); err != nil {
				_ = s.write(response{
					JSONRPC: "2.0",
					Error: &responseError{
						Code:    -32700,
						Message: err.Error(),
					},
				})
				return
			}

			result, err := s.service.Handle(ctx, req.Method, req.Params, s)
			reply := response{
				JSONRPC: "2.0",
				ID:      req.ID,
			}
			if err != nil {
				reply.Error = &responseError{
					Code:    -32000,
					Message: err.Error(),
				}
			} else {
				reply.Result = result
			}

			_ = s.write(reply)
		}(lineCopy)
	}

	return scanner.Err()
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
