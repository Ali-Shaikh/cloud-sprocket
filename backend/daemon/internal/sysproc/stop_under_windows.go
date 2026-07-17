//go:build windows

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package sysproc

import (
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

const (
	th32csSnapProcess   = 0x00000002
	processTerminate    = 0x0001
	processQueryLimited = 0x1000
)

type processEntry32 struct {
	size            uint32
	usage           uint32
	processID       uint32
	defaultHeapID   uintptr
	moduleID        uint32
	threads         uint32
	parentProcessID uint32
	priClassBase    int32
	flags           uint32
	exeFile         [syscall.MAX_PATH]uint16
}

// StopProcessesUnder terminates processes whose executable path is under dir.
// On Windows, cancelled tofu apply often leaves terraform-provider-*.exe running,
// which locks provider binaries and blocks workspace deletion (Access is denied).
// Returns the number of processes signalled.
func StopProcessesUnder(dir string) int {
	dir = filepath.Clean(strings.TrimSpace(dir))
	if dir == "" || dir == "." || dir == string(filepath.Separator) {
		return 0
	}
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return 0
	}
	absDir = strings.ToLower(absDir)
	if !strings.HasSuffix(absDir, string(filepath.Separator)) {
		absDir += string(filepath.Separator)
	}

	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	createSnap := kernel32.NewProc("CreateToolhelp32Snapshot")
	procFirst := kernel32.NewProc("Process32FirstW")
	procNext := kernel32.NewProc("Process32NextW")
	openProcess := kernel32.NewProc("OpenProcess")
	queryImage := kernel32.NewProc("QueryFullProcessImageNameW")
	closeHandle := kernel32.NewProc("CloseHandle")
	terminate := kernel32.NewProc("TerminateProcess")

	snap, _, _ := createSnap.Call(uintptr(th32csSnapProcess), 0)
	if snap == 0 || snap == ^uintptr(0) {
		return 0
	}
	defer closeHandle.Call(snap)

	var entry processEntry32
	entry.size = uint32(unsafe.Sizeof(entry))
	ret, _, _ := procFirst.Call(snap, uintptr(unsafe.Pointer(&entry)))
	if ret == 0 {
		return 0
	}

	stopped := 0
	for {
		pid := entry.processID
		if pid != 0 && pid != uint32(syscall.Getpid()) {
			if path := processImagePath(openProcess, queryImage, closeHandle, pid); path != "" {
				lower := strings.ToLower(filepath.Clean(path))
				if strings.HasPrefix(lower, absDir) {
					if killProcess(openProcess, terminate, closeHandle, pid) {
						stopped++
					}
				}
			}
		}
		ret, _, _ = procNext.Call(snap, uintptr(unsafe.Pointer(&entry)))
		if ret == 0 {
			break
		}
	}
	return stopped
}

func processImagePath(openProcess, queryImage, closeHandle *syscall.LazyProc, pid uint32) string {
	handle, _, _ := openProcess.Call(uintptr(processQueryLimited), 0, uintptr(pid))
	if handle == 0 {
		return ""
	}
	defer closeHandle.Call(handle)

	var buf [syscall.MAX_PATH * 4]uint16
	size := uint32(len(buf))
	ret, _, _ := queryImage.Call(handle, 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)))
	if ret == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf[:])
}

func killProcess(openProcess, terminate, closeHandle *syscall.LazyProc, pid uint32) bool {
	handle, _, _ := openProcess.Call(uintptr(processTerminate|processQueryLimited), 0, uintptr(pid))
	if handle == 0 {
		return false
	}
	defer closeHandle.Call(handle)
	ret, _, _ := terminate.Call(handle, 1)
	return ret != 0
}
