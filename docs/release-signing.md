# Release signing prerequisites

CloudSprocket release artefacts now receive GitHub build provenance and SBOM
attestations. These attestations prove which workflow produced an artefact, but
they do not replace operating-system code signing.

The release workflow must not be treated as a production distribution pipeline
until the following credentials are provisioned and signing is enforced.

## Windows

Choose either an organisation validation code-signing certificate or Azure
Trusted Signing. For a certificate stored as a PFX, provision these GitHub
Actions secrets:

- `WINDOWS_CERTIFICATE`: base64-encoded PFX certificate
- `WINDOWS_CERTIFICATE_PASSWORD`: PFX export password

Configure the certificate thumbprint, SHA-256 digest algorithm, and a trusted
timestamp server in the Tauri Windows bundle configuration. Import the PFX into
the Windows runner before `pnpm run build:desktop`, then verify the MSI signature
with `Get-AuthenticodeSignature` before publication.

Reference: [Tauri Windows code signing](https://v2.tauri.app/distribute/sign/windows/)

## macOS

Use a paid Apple Developer account and a Developer ID Application certificate.
Provision these GitHub Actions secrets:

- `APPLE_CERTIFICATE`: base64-encoded P12 certificate
- `APPLE_CERTIFICATE_PASSWORD`: P12 export password
- `KEYCHAIN_PASSWORD`: temporary CI keychain password
- `APPLE_API_ISSUER`, `APPLE_API_KEY`, and the App Store Connect private key for notarisation, or `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID`

Import the certificate into a temporary keychain before the macOS build, expose
its identity as `APPLE_SIGNING_IDENTITY`, and provide notarisation credentials to
the Tauri build. Verify the DMG with `codesign`, `spctl`, and `stapler validate`
before publication.

Reference: [Tauri macOS code signing and notarisation](https://v2.tauri.app/distribute/sign/macos/)

## Linux

Linux package signing is distribution-channel specific. If AppImage remains a
direct-download artefact, provision a dedicated GPG signing key and verify its
embedded signature before publication.

Reference: [Tauri Linux code signing](https://v2.tauri.app/distribute/sign/linux/)

## Release gate

Once credentials exist, the tag workflow should fail closed when a required
signature or notarisation result is absent. Keep signing credentials in a
protected GitHub environment with reviewer approval, least-privilege access,
rotation dates, and an incident revocation procedure.
