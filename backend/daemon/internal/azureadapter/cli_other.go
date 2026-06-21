//go:build !windows

package azureadapter

func normaliseCLICommand(name string, args []string) (string, []string) {
	return name, args
}
