// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package flociazcompat

import (
	"bufio"
	"context"
	"crypto/tls"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
)

// TestPrepareOpenTofuRuntimeHappyPath exercises the full compat contract on one
// listener that accepts both HTTP and HTTPS, matching how floci-az serves port 4577.
func TestPrepareOpenTofuRuntimeHappyPath(t *testing.T) {
	certPEM, tlsConfig := localhostTestCert(t)
	hostPort, baseURL, closeServer := startDualProtocolMock(t, certPEM, tlsConfig, func(host string) string {
		return `{"resourceManager":"https://` + host + `"}`
	})
	defer closeServer()

	trustDir := t.TempDir()
	runtime, err := PrepareOpenTofuRuntime(context.Background(), baseURL, trustDir)
	if err != nil {
		t.Fatalf("PrepareOpenTofuRuntime: %v", err)
	}
	if runtime.MetadataHost != hostPort {
		t.Fatalf("metadata host = %q, want %q", runtime.MetadataHost, hostPort)
	}
	if runtime.TrustCertPath == "" {
		t.Fatal("expected trust cert path")
	}
	env := TofuEnvironment(runtime, nil)
	joined := strings.Join(env, "\n")
	for _, want := range []string{ClientID, "ARM_METADATA_HOSTNAME=" + hostPort, "SSL_CERT_FILE="} {
		if !strings.Contains(joined, want) {
			t.Fatalf("env missing %q in %v", want, env)
		}
	}
}

func startDualProtocolMock(t *testing.T, certPEM []byte, tlsConfig *tls.Config, metadataFor func(hostPort string) string) (hostPort, baseURL string, cleanup func()) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	hostPort = listener.Addr().String()
	baseURL = "http://" + hostPort
	metadata := metadataFor(hostPort)
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			w.WriteHeader(http.StatusOK)
		case "/metadata/endpoints":
			_, _ = w.Write([]byte(metadata))
		case tlsCertPath:
			_, _ = w.Write(certPEM)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})

	var wg sync.WaitGroup
	stop := make(chan struct{})
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			conn, err := listener.Accept()
			if err != nil {
				select {
				case <-stop:
					return
				default:
					continue
				}
			}
			go serveDualProtocolConn(conn, tlsConfig, handler)
		}
	}()

	return hostPort, baseURL, func() {
		close(stop)
		_ = listener.Close()
		wg.Wait()
	}
}

func serveDualProtocolConn(raw net.Conn, tlsConfig *tls.Config, handler http.Handler) {
	br := bufio.NewReader(raw)
	peek, err := br.Peek(1)
	if err != nil {
		_ = raw.Close()
		return
	}
	var conn net.Conn
	if peek[0] == 0x16 {
		conn = tls.Server(&peekedConn{Conn: raw, r: br}, tlsConfig)
	} else {
		conn = &peekedConn{Conn: raw, r: br}
	}
	server := http.Server{Handler: handler}
	_ = server.Serve(&oneShotListener{conn: conn})
}

type peekedConn struct {
	net.Conn
	r *bufio.Reader
}

func (c *peekedConn) Read(p []byte) (int, error) { return c.r.Read(p) }

type oneShotListener struct {
	conn net.Conn
	used bool
}

func (l *oneShotListener) Accept() (net.Conn, error) {
	if l.used {
		return nil, net.ErrClosed
	}
	l.used = true
	return l.conn, nil
}

func (l *oneShotListener) Close() error   { return nil }
func (l *oneShotListener) Addr() net.Addr { return l.conn.LocalAddr() }