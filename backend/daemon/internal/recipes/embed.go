package recipes

import (
	"embed"
	"io/fs"
)

//go:embed bundled
var bundledFS embed.FS

// Bundled returns a Loader over the recipes shipped inside the binary.
func Bundled() *Loader {
	sub, err := fs.Sub(bundledFS, "bundled")
	if err != nil {
		// bundled is embedded at build time, so this cannot fail in practice.
		panic(err)
	}
	return NewLoader(sub)
}
