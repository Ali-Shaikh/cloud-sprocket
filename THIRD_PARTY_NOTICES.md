# Third-Party Notices

CloudSprocket is licensed under AGPL-3.0-or-later. Its installers redistribute the
third-party components listed below: JavaScript packages compiled into the
application bundle, Go modules compiled into the `cloudsprocketd` sidecar binary,
and Rust crates compiled into the desktop shell. Build-time tooling and type-only
packages are not distributed and are therefore not listed.

Where a component is offered under a choice of licences (for example
"MIT OR Apache-2.0"), CloudSprocket elects the first licence shown for that group
and complies with it alone. Full licence texts are reproduced in the appendix.

This file is generated. Regenerate after dependency changes with:

```bash
pnpm --dir apps/desktop run generate:notices
```

Generated: 2026-07-05

## Desktop frontend (85 npm packages)

Packages whose code is compiled into the application's JavaScript bundle.

### MIT (81)

- **@codemirror/autocomplete** 6.20.3  
  Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
- **@codemirror/commands** 6.10.4  
  Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
- **@codemirror/lang-json** 6.0.2  
  Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
- **@codemirror/lang-yaml** 6.1.3  
  Copyright (C) 2024 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
- **@codemirror/language** 6.12.4  
  Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
- **@codemirror/merge** 6.12.2  
  Copyright (C) 2018-2022 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
- **@codemirror/state** 6.7.0  
  Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
- **@codemirror/view** 6.43.4  
  Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
- **@floating-ui/core** 1.7.5  
  Copyright (c) 2021-present Floating UI contributors
- **@floating-ui/dom** 1.7.6  
  Copyright (c) 2021-present Floating UI contributors
- **@floating-ui/react-dom** 2.1.8  
  Copyright (c) 2021-present Floating UI contributors
- **@floating-ui/utils** 0.2.11  
  Copyright (c) 2021-present Floating UI contributors
- **@lezer/common** 1.5.2  
  Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
- **@lezer/highlight** 1.2.3  
  Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
- **@lezer/json** 1.0.3  
  Copyright (C) 2020 by Marijn Haverbeke <marijn@haverbeke.berlin>, Arun Srinivasan <rulfzid@gmail.com>, and others
- **@lezer/lr** 1.4.10  
  Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
- **@lezer/yaml** 1.0.4  
  Copyright (C) 2024 by Marijn Haverbeke <marijnh@gmail.com> and others
- **@marijn/find-cluster-break** 1.0.3  
  Copyright (C) 2024 by Marijn Haverbeke <marijn@haverbeke.berlin>
- **@radix-ui/number** 1.1.2  
  Copyright (c) 2022 WorkOS
- **@radix-ui/primitive** 1.1.4  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-alert-dialog** 1.1.16  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-arrow** 1.1.9  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-avatar** 1.1.12  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-collection** 1.1.9  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-compose-refs** 1.1.3  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-context** 1.1.4  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-dialog** 1.1.16  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-direction** 1.1.2  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-dismissable-layer** 1.1.12  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-dropdown-menu** 2.1.17  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-focus-guards** 1.1.4  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-focus-scope** 1.1.9  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-id** 1.1.2  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-menu** 2.1.17  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-popper** 1.3.0  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-portal** 1.1.11  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-presence** 1.1.6  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-primitive** 2.1.5  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-roving-focus** 1.1.12  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-scroll-area** 1.2.11  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-select** 2.3.0  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-separator** 1.1.9  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-slot** 1.2.5  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-switch** 1.3.0  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-tabs** 1.1.14  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-tooltip** 1.2.9  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-use-callback-ref** 1.1.2  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-use-controllable-state** 1.2.3  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-use-effect-event** 0.0.3  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-use-escape-keydown** 1.1.2  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-use-is-hydrated** 0.1.1  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-use-layout-effect** 1.1.2  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-use-previous** 1.1.2  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-use-rect** 1.1.2  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-use-size** 1.1.2  
  Copyright (c) 2022 WorkOS
- **@radix-ui/react-visually-hidden** 1.2.5  
  Copyright (c) 2022 WorkOS
- **@radix-ui/rect** 1.1.2  
  Copyright (c) 2022 WorkOS
- **@tanstack/react-virtual** 3.14.3  
  Copyright (c) 2021-present Tanner Linsley
- **@tanstack/virtual-core** 3.17.1  
  Copyright (c) 2021-present Tanner Linsley
- **@tauri-apps/api** 2.11.1  
  Copyright (c) 2017 - Present Tauri Apps Contributors
- **@tauri-apps/plugin-dialog** 2.7.1
- **@tauri-apps/plugin-opener** 2.5.4
- **aria-hidden** 1.2.6  
  Copyright (c) 2017 Anton Korzunov
- **clsx** 2.1.1  
  Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)
- **crelt** 1.0.7  
  Copyright (C) 2020 by Marijn Haverbeke <marijn@haverbeke.berlin>
- **detect-node-es** 1.1.0  
  Copyright (c) 2017 Ilya Kantor
- **get-nonce** 1.0.1  
  Copyright (c) 2020 Anton Korzunov
- **js-yaml** 5.2.1  
  Copyright (C) 2011-2015 by Vitaly Puzrin
- **prettier** 3.9.4  
  Copyright © James Long and contributors
- **react** 19.2.7  
  Copyright (c) Meta Platforms, Inc. and affiliates.
- **react-dom** 19.2.7  
  Copyright (c) Meta Platforms, Inc. and affiliates.
- **react-remove-scroll** 2.7.2  
  Copyright (c) 2017 Anton Korzunov
- **react-remove-scroll-bar** 2.3.8  
  Copyright (c) Anton Korzunov
- **react-style-singleton** 2.2.3  
  Copyright (c) 2017 Anton Korzunov
- **scheduler** 0.27.0  
  Copyright (c) Meta Platforms, Inc. and affiliates.
- **sonner** 2.0.7  
  Copyright (c) 2023 Emil Kowalski
- **style-mod** 4.1.3  
  Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
- **tailwind-merge** 3.6.0  
  Copyright (c) 2021 Dany Castillo
- **use-callback-ref** 1.3.3  
  Copyright (c) 2017 Anton Korzunov
- **use-sidecar** 1.1.3  
  Copyright (c) 2017 Anton Korzunov
- **w3c-keyname** 2.2.8  
  Copyright (C) 2016 by Marijn Haverbeke <marijn@haverbeke.berlin> and others

### Apache-2.0 (1)

- **class-variance-authority** 0.7.1  
  Copyright 2022 Joe Bell

### ISC (1)

- **lucide-react** 1.17.0  
  Copyright (c) 2026 Lucide Icons and Contributors  
  Copyright (c) 2013-present Cole Bemis

### 0BSD (1)

- **tslib** 2.8.1  
  Copyright (c) Microsoft Corporation.

### Python-2.0 (1)

- **argparse** 2.0.1  
  Copyright (c) 1991 - 1995, Stichting Mathematisch Centrum Amsterdam,

## Go sidecar `cloudsprocketd` (80 modules)

Modules compiled into the sidecar binary.

### MIT (14)

- **github.com/Azure/azure-sdk-for-go/sdk/azcore** v1.22.0  
  Copyright (c) Microsoft Corporation.
- **github.com/Azure/azure-sdk-for-go/sdk/internal** v1.12.0  
  Copyright (c) Microsoft Corporation.
- **github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/compute/armcompute/v6** v6.4.0  
  Copyright (c) Microsoft Corporation. All rights reserved.
- **github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armresources/v3** v3.0.1  
  Copyright (c) Microsoft Corporation. All rights reserved.
- **github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storage/armstorage** v1.8.1  
  Copyright (c) Microsoft Corporation. All rights reserved.
- **github.com/Azure/azure-sdk-for-go/sdk/storage/azblob** v1.8.0  
  Copyright (c) Microsoft Corporation. All rights reserved.
- **github.com/Azure/azure-sdk-for-go/sdk/storage/azqueue** v1.0.1  
  Copyright (c) Microsoft Corporation. All rights reserved.
- **github.com/dustin/go-humanize** v1.0.1  
  Copyright (c) 2005-2008  Dustin Sallings <dustin@spy.net>
- **github.com/felixge/httpsnoop** v1.0.4  
  Copyright (c) 2016 Felix Geisendörfer (felix@debuggable.com)
- **github.com/mattn/go-isatty** v0.0.20  
  Copyright (c) Yasuhiro MATSUMOTO <mattn.jp@gmail.com>
- **github.com/Microsoft/go-winio** v0.6.2  
  Copyright (c) 2015 Microsoft
- **github.com/mitchellh/go-wordwrap** v1.0.0  
  Copyright (c) 2014 Mitchell Hashimoto
- **github.com/ncruces/go-strftime** v1.0.0  
  Copyright (c) 2022 Nuno Cruces
- **github.com/zclconf/go-cty** v1.14.4  
  Copyright (c) 2017-2018 Martin Atkins

### Apache-2.0 (54)

- **github.com/agext/levenshtein** v1.2.2
- **github.com/apparentlymart/go-textseg/v15** v15.0.0  
  Copyright (c) 2017 Martin Atkins  
  Copyright (c) 2014 Couchbase, Inc.  
  COPYRIGHT AND PERMISSION NOTICE
- **github.com/aws/aws-sdk-go-v2** v1.42.1
- **github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream** v1.7.13
- **github.com/aws/aws-sdk-go-v2/config** v1.32.26
- **github.com/aws/aws-sdk-go-v2/credentials** v1.19.25
- **github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue** v1.20.49
- **github.com/aws/aws-sdk-go-v2/feature/ec2/imds** v1.18.29
- **github.com/aws/aws-sdk-go-v2/feature/s3/manager** v1.22.29
- **github.com/aws/aws-sdk-go-v2/internal/configsources** v1.4.30
- **github.com/aws/aws-sdk-go-v2/internal/endpoints/v2** v2.7.30
- **github.com/aws/aws-sdk-go-v2/internal/v4a** v1.4.30
- **github.com/aws/aws-sdk-go-v2/service/apigateway** v1.40.8
- **github.com/aws/aws-sdk-go-v2/service/apigatewayv2** v1.35.8
- **github.com/aws/aws-sdk-go-v2/service/cloudwatchlogs** v1.78.1
- **github.com/aws/aws-sdk-go-v2/service/dynamodb** v1.59.1
- **github.com/aws/aws-sdk-go-v2/service/dynamodbstreams** v1.34.1
- **github.com/aws/aws-sdk-go-v2/service/ec2** v1.309.0
- **github.com/aws/aws-sdk-go-v2/service/ecs** v1.86.2
- **github.com/aws/aws-sdk-go-v2/service/iam** v1.54.6
- **github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding** v1.13.12
- **github.com/aws/aws-sdk-go-v2/service/internal/checksum** v1.9.22
- **github.com/aws/aws-sdk-go-v2/service/internal/endpoint-discovery** v1.12.6
- **github.com/aws/aws-sdk-go-v2/service/internal/presigned-url** v1.13.29
- **github.com/aws/aws-sdk-go-v2/service/internal/s3shared** v1.19.30
- **github.com/aws/aws-sdk-go-v2/service/lambda** v1.94.0
- **github.com/aws/aws-sdk-go-v2/service/rds** v1.119.4
- **github.com/aws/aws-sdk-go-v2/service/s3** v1.104.1
- **github.com/aws/aws-sdk-go-v2/service/secretsmanager** v1.42.5
- **github.com/aws/aws-sdk-go-v2/service/signin** v1.2.1
- **github.com/aws/aws-sdk-go-v2/service/sns** v1.40.2
- **github.com/aws/aws-sdk-go-v2/service/sqs** v1.44.1
- **github.com/aws/aws-sdk-go-v2/service/sso** v1.31.4
- **github.com/aws/aws-sdk-go-v2/service/ssooidc** v1.36.7
- **github.com/aws/aws-sdk-go-v2/service/sts** v1.43.4
- **github.com/aws/smithy-go** v1.27.3
- **github.com/containerd/errdefs** v1.0.0  
  Copyright The containerd Authors
- **github.com/containerd/errdefs/pkg** v0.3.0  
  Copyright The containerd Authors
- **github.com/distribution/reference** v0.6.0
- **github.com/docker/go-connections** v0.7.0  
  Copyright 2015 Docker, Inc.
- **github.com/docker/go-units** v0.5.0  
  Copyright 2015 Docker, Inc.
- **github.com/go-logr/logr** v1.4.2
- **github.com/go-logr/stdr** v1.2.2
- **github.com/moby/docker-image-spec** v1.3.1
- **github.com/moby/moby/api** v1.54.2
- **github.com/moby/moby/client** v0.4.1
- **github.com/opencontainers/go-digest** v1.0.0  
  Copyright 2019, 2020 OCI Contributors  
  Copyright 2016 Docker, Inc.  
  copyright and certain other rights. Our licenses are

  <details><summary>Licence text</summary>

```
Attribution-ShareAlike 4.0 International

=======================================================================

Creative Commons Corporation ("Creative Commons") is not a law firm and
does not provide legal services or legal advice. Distribution of
Creative Commons public licenses does not create a lawyer-client or
other relationship. Creative Commons makes its licenses and related
information available on an "as-is" basis. Creative Commons gives no
warranties regarding its licenses, any material licensed under their
terms and conditions, or any related information. Creative Commons
disclaims all liability for damages resulting from their use to the
fullest extent possible.

Using Creative Commons Public Licenses

Creative Commons public licenses provide a standard set of terms and
conditions that creators and other rights holders may use to share
original works of authorship and other material subject to copyright
and certain other rights specified in the public license below. The
following considerations are for informational purposes only, are not
exhaustive, and do not form part of our licenses.

     Considerations for licensors: Our public licenses are
     intended for use by those authorized to give the public
     permission to use material in ways otherwise restricted by
     copyright and certain other rights. Our licenses are
     irrevocable. Licensors should read and understand the terms
     and conditions of the license they choose before applying it.
     Licensors should also secure all rights necessary before
     applying our licenses so that the public can reuse the
     material as expected. Licensors should clearly mark any
     material not subject to the license. This includes other CC-
     licensed material, or material used under an exception or
     limitation to copyright. More considerations for licensors:
	wiki.creativecommons.org/Considerations_for_licensors

     Considerations for the public: By using one of our public
     licenses, a licensor grants the public permission to use the
     licensed material under specified terms and conditions. If
     the licensor's permission is not necessary for any reason--for
     example, because of any applicable exception or limitation to
     copyright--then that use is not regulated by the license. Our
     licenses grant only permissions under copyright and certain
     other rights that a licensor has authority to grant. Use of
     the licensed material may still be restricted for other
     reasons, including because others have copyright or other
     rights in the material. A licensor may make special requests,
     such as asking that all changes be marked or described.
     Although not required by our licenses, you are encouraged to
     respect those requests where reasonable. More_considerations
     for the public:
	wiki.creativecommons.org/Considerations_for_licensees

=======================================================================

Creative Commons Attribution-ShareAlike 4.0 International Public
License

By exercising the Licensed Rights (defined below), You accept and agree
to be bound by the terms and conditions of this Creative Commons
Attribution-ShareAlike 4.0 International Public License ("Public
License"). To the extent this Public License may be interpreted as a
contract, You are granted the Licensed Rights in consideration of Your
acceptance of these terms and conditions, and the Licensor grants You
such rights in consideration of benefits the Licensor receives from
making the Licensed Material available under these terms and
conditions.


Section 1 -- Definitions.

  a. Adapted Material means material subject to Copyright and Similar
     Rights that is derived from or based upon the Licensed Material
     and in which the Licensed Material is translated, altered,
     arranged, transformed, or otherwise modified in a manner requiring
     permission under the Copyright and Similar Rights held by the
     Licensor. For purposes of this Public License, where the Licensed
     Material is a musical work, performance, or sound recording,
     Adapted Material is always produced where the Licensed Material is
     synched in timed relation with a moving image.

  b. Adapter's License means the license You apply to Your Copyright
     and Similar Rights in Your contributions to Adapted Material in
     accordance with the terms and conditions of this Public License.

  c. BY-SA Compatible License means a license listed at
     creativecommons.org/compatiblelicenses, approved by Creative
     Commons as essentially the equivalent of this Public License.

  d. Copyright and Similar Rights means copyright and/or similar rights
     closely related to copyright including, without limitation,
     performance, broadcast, sound recording, and Sui Generis Database
     Rights, without regard to how the rights are labeled or
     categorized. For purposes of this Public License, the rights
     specified in Section 2(b)(1)-(2) are not Copyright and Similar
     Rights.

  e. Effective Technological Measures means those measures that, in the
     absence of proper authority, may not be circumvented under laws
     fulfilling obligations under Article 11 of the WIPO Copyright
     Treaty adopted on December 20, 1996, and/or similar international
     agreements.

  f. Exceptions and Limitations means fair use, fair dealing, and/or
     any other exception or limitation to Copyright and Similar Rights
     that applies to Your use of the Licensed Material.

  g. License Elements means the license attributes listed in the name
     of a Creative Commons Public License. The License Elements of this
     Public License are Attribution and ShareAlike.

  h. Licensed Material means the artistic or literary work, database,
     or other material to which the Licensor applied this Public
     License.

  i. Licensed Rights means the rights granted to You subject to the
     terms and conditions of this Public License, which are limited to
     all Copyright and Similar Rights that apply to Your use of the
     Licensed Material and that the Licensor has authority to license.

  j. Licensor means the individual(s) or entity(ies) granting rights
     under this Public License.

  k. Share means to provide material to the public by any means or
     process that requires permission under the Licensed Rights, such
     as reproduction, public display, public performance, distribution,
     dissemination, communication, or importation, and to make material
     available to the public including in ways that members of the
     public may access the material from a place and at a time
     individually chosen by them.

  l. Sui Generis Database Rights means rights other than copyright
     resulting from Directive 96/9/EC of the European Parliament and of
     the Council of 11 March 1996 on the legal protection of databases,
     as amended and/or succeeded, as well as other essentially
     equivalent rights anywhere in the world.

  m. You means the individual or entity exercising the Licensed Rights
     under this Public License. Your has a corresponding meaning.


Section 2 -- Scope.

  a. License grant.

       1. Subject to the terms and conditions of this Public License,
          the Licensor hereby grants You a worldwide, royalty-free,
          non-sublicensable, non-exclusive, irrevocable license to
          exercise the Licensed Rights in the Licensed Material to:

            a. reproduce and Share the Licensed Material, in whole or
               in part; and

            b. produce, reproduce, and Share Adapted Material.

       2. Exceptions and Limitations. For the avoidance of doubt, where
          Exceptions and Limitations apply to Your use, this Public
          License does not apply, and You do not need to comply with
          its terms and conditions.

       3. Term. The term of this Public License is specified in Section
          6(a).

       4. Media and formats; technical modifications allowed. The
          Licensor authorizes You to exercise the Licensed Rights in
          all media and formats whether now known or hereafter created,
          and to make technical modifications necessary to do so. The
          Licensor waives and/or agrees not to assert any right or
          authority to forbid You from making technical modifications
          necessary to exercise the Licensed Rights, including
          technical modifications necessary to circumvent Effective
          Technological Measures. For purposes of this Public License,
          simply making modifications authorized by this Section 2(a)
          (4) never produces Adapted Material.

       5. Downstream recipients.

            a. Offer from the Licensor -- Licensed Material. Every
               recipient of the Licensed Material automatically
               receives an offer from the Licensor to exercise the
               Licensed Rights under the terms and conditions of this
               Public License.

            b. Additional offer from the Licensor -- Adapted Material.
               Every recipient of Adapted Material from You
               automatically receives an offer from the Licensor to
               exercise the Licensed Rights in the Adapted Material
               under the conditions of the Adapter's License You apply.

            c. No downstream restrictions. You may not offer or impose
               any additional or different terms or conditions on, or
               apply any Effective Technological Measures to, the
               Licensed Material if doing so restricts exercise of the
               Licensed Rights by any recipient of the Licensed
               Material.

       6. No endorsement. Nothing in this Public License constitutes or
          may be construed as permission to assert or imply that You
          are, or that Your use of the Licensed Material is, connected
          with, or sponsored, endorsed, or granted official status by,
          the Licensor or others designated to receive attribution as
          provided in Section 3(a)(1)(A)(i).

  b. Other rights.

       1. Moral rights, such as the right of integrity, are not
          licensed under this Public License, nor are publicity,
          privacy, and/or other similar personality rights; however, to
          the extent possible, the Licensor waives and/or agrees not to
          assert any such rights held by the Licensor to the limited
          extent necessary to allow You to exercise the Licensed
          Rights, but not otherwise.

       2. Patent and trademark rights are not licensed under this
          Public License.

       3. To the extent possible, the Licensor waives any right to
          collect royalties from You for the exercise of the Licensed
          Rights, whether directly or through a collecting society
          under any voluntary or waivable statutory or compulsory
          licensing scheme. In all other cases the Licensor expressly
          reserves any right to collect such royalties.


Section 3 -- License Conditions.

Your exercise of the Licensed Rights is expressly made subject to the
following conditions.

  a. Attribution.

       1. If You Share the Licensed Material (including in modified
          form), You must:

            a. retain the following if it is supplied by the Licensor
               with the Licensed Material:

                 i. identification of the creator(s) of the Licensed
                    Material and any others designated to receive
                    attribution, in any reasonable manner requested by
                    the Licensor (including by pseudonym if
                    designated);

                ii. a copyright notice;

               iii. a notice that refers to this Public License;

                iv. a notice that refers to the disclaimer of
                    warranties;

                 v. a URI or hyperlink to the Licensed Material to the
                    extent reasonably practicable;

            b. indicate if You modified the Licensed Material and
               retain an indication of any previous modifications; and

            c. indicate the Licensed Material is licensed under this
               Public License, and include the text of, or the URI or
               hyperlink to, this Public License.

       2. You may satisfy the conditions in Section 3(a)(1) in any
          reasonable manner based on the medium, means, and context in
          which You Share the Licensed Material. For example, it may be
          reasonable to satisfy the conditions by providing a URI or
          hyperlink to a resource that includes the required
          information.

       3. If requested by the Licensor, You must remove any of the
          information required by Section 3(a)(1)(A) to the extent
          reasonably practicable.

  b. ShareAlike.

     In addition to the conditions in Section 3(a), if You Share
     Adapted Material You produce, the following conditions also apply.

       1. The Adapter's License You apply must be a Creative Commons
          license with the same License Elements, this version or
          later, or a BY-SA Compatible License.

       2. You must include the text of, or the URI or hyperlink to, the
          Adapter's License You apply. You may satisfy this condition
          in any reasonable manner based on the medium, means, and
          context in which You Share Adapted Material.

       3. You may not offer or impose any additional or different terms
          or conditions on, or apply any Effective Technological
          Measures to, Adapted Material that restrict exercise of the
          rights granted under the Adapter's License You apply.


Section 4 -- Sui Generis Database Rights.

Where the Licensed Rights include Sui Generis Database Rights that
apply to Your use of the Licensed Material:

  a. for the avoidance of doubt, Section 2(a)(1) grants You the right
     to extract, reuse, reproduce, and Share all or a substantial
     portion of the contents of the database;

  b. if You include all or a substantial portion of the database
     contents in a database in which You have Sui Generis Database
     Rights, then the database in which You have Sui Generis Database
     Rights (but not its individual contents) is Adapted Material,

     including for purposes of Section 3(b); and
  c. You must comply with the conditions in Section 3(a) if You Share
     all or a substantial portion of the contents of the database.

For the avoidance of doubt, this Section 4 supplements and does not
replace Your obligations under this Public License where the Licensed
Rights include other Copyright and Similar Rights.


Section 5 -- Disclaimer of Warranties and Limitation of Liability.

  a. UNLESS OTHERWISE SEPARATELY UNDERTAKEN BY THE LICENSOR, TO THE
     EXTENT POSSIBLE, THE LICENSOR OFFERS THE LICENSED MATERIAL AS-IS
     AND AS-AVAILABLE, AND MAKES NO REPRESENTATIONS OR WARRANTIES OF
     ANY KIND CONCERNING THE LICENSED MATERIAL, WHETHER EXPRESS,
     IMPLIED, STATUTORY, OR OTHER. THIS INCLUDES, WITHOUT LIMITATION,
     WARRANTIES OF TITLE, MERCHANTABILITY, FITNESS FOR A PARTICULAR
     PURPOSE, NON-INFRINGEMENT, ABSENCE OF LATENT OR OTHER DEFECTS,
     ACCURACY, OR THE PRESENCE OR ABSENCE OF ERRORS, WHETHER OR NOT
     KNOWN OR DISCOVERABLE. WHERE DISCLAIMERS OF WARRANTIES ARE NOT
     ALLOWED IN FULL OR IN PART, THIS DISCLAIMER MAY NOT APPLY TO YOU.

  b. TO THE EXTENT POSSIBLE, IN NO EVENT WILL THE LICENSOR BE LIABLE
     TO YOU ON ANY LEGAL THEORY (INCLUDING, WITHOUT LIMITATION,
     NEGLIGENCE) OR OTHERWISE FOR ANY DIRECT, SPECIAL, INDIRECT,
     INCIDENTAL, CONSEQUENTIAL, PUNITIVE, EXEMPLARY, OR OTHER LOSSES,
     COSTS, EXPENSES, OR DAMAGES ARISING OUT OF THIS PUBLIC LICENSE OR
     USE OF THE LICENSED MATERIAL, EVEN IF THE LICENSOR HAS BEEN
     ADVISED OF THE POSSIBILITY OF SUCH LOSSES, COSTS, EXPENSES, OR
     DAMAGES. WHERE A LIMITATION OF LIABILITY IS NOT ALLOWED IN FULL OR
     IN PART, THIS LIMITATION MAY NOT APPLY TO YOU.

  c. The disclaimer of warranties and limitation of liability provided
     above shall be interpreted in a manner that, to the extent
     possible, most closely approximates an absolute disclaimer and
     waiver of all liability.


Section 6 -- Term and Termination.

  a. This Public License applies for the term of the Copyright and
     Similar Rights licensed here. However, if You fail to comply with
     this Public License, then Your rights under this Public License
     terminate automatically.

  b. Where Your right to use the Licensed Material has terminated under
     Section 6(a), it reinstates:

       1. automatically as of the date the violation is cured, provided
          it is cured within 30 days of Your discovery of the
          violation; or

       2. upon express reinstatement by the Licensor.

     For the avoidance of doubt, this Section 6(b) does not affect any
     right the Licensor may have to seek remedies for Your violations
     of this Public License.

  c. For the avoidance of doubt, the Licensor may also offer the
     Licensed Material under separate terms or conditions or stop
     distributing the Licensed Material at any time; however, doing so
     will not terminate this Public License.

  d. Sections 1, 5, 6, 7, and 8 survive termination of this Public
     License.


Section 7 -- Other Terms and Conditions.

  a. The Licensor shall not be bound by any additional or different
     terms or conditions communicated by You unless expressly agreed.

  b. Any arrangements, understandings, or agreements regarding the
     Licensed Material not stated herein are separate from and
     independent of the terms and conditions of this Public License.


Section 8 -- Interpretation.

  a. For the avoidance of doubt, this Public License does not, and
     shall not be interpreted to, reduce, limit, restrict, or impose
     conditions on any use of the Licensed Material that could lawfully
     be made without permission under this Public License.

  b. To the extent possible, if any provision of this Public License is
     deemed unenforceable, it shall be automatically reformed to the
     minimum extent necessary to make it enforceable. If the provision
     cannot be reformed, it shall be severed from this Public License
     without affecting the enforceability of the remaining terms and
     conditions.

  c. No term or condition of this Public License will be waived and no
     failure to comply consented to unless expressly agreed to by the
     Licensor.

  d. Nothing in this Public License constitutes or may be interpreted
     as a limitation upon, or waiver of, any privileges and immunities
     that apply to the Licensor or You, including from the legal
     processes of any jurisdiction or authority.


=======================================================================

Creative Commons is not a party to its public licenses.
Notwithstanding, Creative Commons may elect to apply one of its public
licenses to material it publishes and in those instances will be
considered the "Licensor." Except for the limited purpose of indicating
that material is shared under a Creative Commons public license or as
otherwise permitted by the Creative Commons policies published at
creativecommons.org/policies, Creative Commons does not authorize the
use of the trademark "Creative Commons" or any other trademark or logo
of Creative Commons without its prior written consent including,
without limitation, in connection with any unauthorized modifications
to any of its public licenses or any other arrangements,
understandings, or agreements concerning use of licensed material. For
the avoidance of doubt, this paragraph does not form part of the public
licenses.

Creative Commons may be contacted at creativecommons.org.
```

  </details>
- **github.com/opencontainers/image-spec** v1.1.1  
  Copyright 2016 The Linux Foundation.
- **go.opentelemetry.io/auto/sdk** v1.1.0
- **go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp** v0.60.0
- **go.opentelemetry.io/otel** v1.35.0
- **go.opentelemetry.io/otel/metric** v1.35.0
- **go.opentelemetry.io/otel/trace** v1.35.0
- **gopkg.in/yaml.v3** v3.0.1  
  copyright staring in 2011 when the project was ported over:  
  Copyright (c) 2006-2010 Kirill Simonov  
  Copyright (c) 2006-2011 Kirill Simonov

### BSD-3-Clause (8)

- **github.com/google/go-cmp** v0.7.0  
  Copyright (c) 2017 The Go Authors. All rights reserved.
- **github.com/remyoudompheng/bigfft** v0.0.0-20230129092748-24d4a6f8daec  
  Copyright (c) 2012 The Go Authors. All rights reserved.
- **golang.org/x/net** v0.56.0  
  Copyright 2009 The Go Authors.
- **golang.org/x/sys** v0.46.0  
  Copyright 2009 The Go Authors.
- **golang.org/x/text** v0.38.0  
  Copyright 2009 The Go Authors.
- **modernc.org/mathutil** v1.7.1  
  Copyright (c) 2014 The mathutil Authors. All rights reserved.
- **modernc.org/memory** v1.11.0  
  Copyright (c) 2017 The Memory Authors. All rights reserved.  
  Copyright (c) 2009 The Go Authors. All rights reserved.  
  Copyright (c) 2011, Evan Shaw <edsrzf@gmail.com>

  <details><summary>Licence text</summary>

```
https://commons.wikimedia.org/wiki/File:Memory_infra_logo.png
```

  </details>
- **modernc.org/sqlite** v1.50.1  
  Copyright (c) 2017 The Sqlite Authors. All rights reserved.

### MPL-2.0 (3)

- **github.com/hashicorp/hcl** v0.0.0-20170504190234-a4b07c25de5f
- **github.com/hashicorp/hcl/v2** v2.20.1  
  Copyright (c) 2014 HashiCorp, Inc.
- **github.com/hashicorp/terraform-config-inspect** v0.0.0-20260224005459-813a97530220  
  Copyright IBM Corp. 2018, 2025

### BSD-3-Clause AND MIT (1)

- **modernc.org/libc** v1.72.3  
  Copyright (c) 2017 The Libc Authors. All rights reserved.  
  Copyright (c) 2009 The Go Authors. All rights reserved.  
  Copyright © 2005-2020 Rich Felker, et al.

## Desktop shell (375 Rust crates)

Crates compiled into the Tauri shell for the release targets: x86_64-pc-windows-msvc, x86_64-unknown-linux-gnu, x86_64-apple-darwin, aarch64-apple-darwin.

### MIT (341)

- **adler2** 2.0.1
- **aho-corasick** 1.1.4  
  Copyright (c) 2015 Andrew Gallant
- **anyhow** 1.0.102
- **async-broadcast** 0.7.2  
  Copyright (c) 2020 Yoshua Wuyts
- **async-channel** 2.5.0
- **async-executor** 1.14.0
- **async-io** 2.6.0
- **async-lock** 3.4.2
- **async-process** 2.5.0
- **async-recursion** 1.1.1
- **async-signal** 0.2.14
- **async-task** 4.7.1
- **async-trait** 0.1.89
- **atk** 0.18.2
- **atk-sys** 0.18.2
- **atomic-waker** 1.1.2
- **base64** 0.22.1  
  Copyright (c) 2015 Alice Maz
- **bit-set** 0.8.0  
  Copyright (c) 2023 The Rust Project Developers
- **bit-vec** 0.8.0  
  Copyright (c) 2023 The Rust Project Developers
- **bitflags** 2.11.1  
  Copyright (c) 2014 The Rust Project Developers
- **bitflags** 1.3.2  
  Copyright (c) 2014 The Rust Project Developers
- **block-buffer** 0.10.4  
  Copyright (c) 2018-2019 The RustCrypto Project Developers
- **block2** 0.6.2
- **blocking** 1.6.2
- **brotli-decompressor** 5.0.0  
  Copyright (c) 2016 Dropbox, Inc.
- **byteorder** 1.5.0  
  Copyright (c) 2015 Andrew Gallant
- **bytes** 1.11.1  
  Copyright (c) 2018 Carl Lerche
- **cairo-rs** 0.18.5
- **cairo-sys-rs** 0.18.2
- **camino** 1.2.2
- **cargo_metadata** 0.19.2
- **cargo-platform** 0.1.9
- **cfb** 0.7.3  
  Copyright (c) 2017 Matthew D. Steele
- **cfg-if** 1.0.4  
  Copyright (c) 2014 Alex Crichton
- **concurrent-queue** 2.5.0
- **convert_case** 0.4.0
- **cookie** 0.18.1  
  Copyright (c) 2017 Sergio Benitez  
  Copyright (c) 2014 Alex Crichton
- **core-foundation** 0.10.1  
  Copyright (c) 2012-2013 Mozilla Foundation
- **core-foundation-sys** 0.8.7  
  Copyright (c) 2012-2013 Mozilla Foundation
- **core-graphics** 0.25.0  
  Copyright (c) 2012-2013 Mozilla Foundation
- **core-graphics-types** 0.2.0  
  Copyright (c) 2012-2013 Mozilla Foundation
- **cpufeatures** 0.2.17  
  Copyright (c) 2020-2025 The RustCrypto Project Developers
- **crc32fast** 1.5.0  
  Copyright (c) 2018 Sam Rijs, Alex Crichton and contributors
- **crossbeam-channel** 0.5.15  
  Copyright (c) 2019 The Crossbeam Project Developers
- **crossbeam-utils** 0.8.21  
  Copyright (c) 2019 The Crossbeam Project Developers
- **crypto-common** 0.1.7  
  Copyright (c) 2021 RustCrypto Developers
- **ctor** 0.8.0
- **ctor-proc-macro** 0.0.7
- **darling** 0.23.0  
  Copyright (c) 2017 Ted Driggs
- **darling_core** 0.23.0  
  Copyright (c) 2017 Ted Driggs
- **darling_macro** 0.23.0  
  Copyright (c) 2017 Ted Driggs
- **dbus** 0.9.11  
  Copyright (c) 2014-2018 David Henningsson <diwic@ubuntu.com> and other contributors
- **deranged** 0.5.8  
  Copyright (c) 2024 Jacob Pratt et al.
- **derive_more** 2.1.1  
  Copyright (c) 2016 Jelte Fennema
- **derive_more** 0.99.20  
  Copyright (c) 2016 Jelte Fennema
- **derive_more-impl** 2.1.1  
  Copyright (c) 2016 Jelte Fennema
- **digest** 0.10.7  
  Copyright (c) 2017 Artyom Pavlov
- **dirs** 6.0.0  
  Copyright (c) 2018-2019 dirs-rs contributors
- **dirs-sys** 0.5.0  
  Copyright (c) 2018-2019 dirs-rs contributors
- **dispatch2** 0.3.1
- **displaydoc** 0.2.5
- **dlopen2** 0.8.2
- **dlopen2_derive** 0.4.3
- **dom_query** 0.27.0  
  Copyright (c) 2023 Mykola Humanov
- **dtoa** 1.0.11
- **dyn-clone** 1.0.20
- **embed_plist** 1.2.2  
  Copyright (c) 2020 Nikolai Vazquez
- **endi** 1.1.1
- **enumflags2** 0.7.12  
  Copyright (c) 2017-2023 Maik Klein, Maja Kądziołka
- **enumflags2_derive** 0.7.12  
  Copyright (c) 2017 Maik Klein
- **equivalent** 1.0.2  
  Copyright (c) 2016--2023
- **erased-serde** 0.4.10
- **errno** 0.3.14  
  Copyright (c) 2014 Chris Wong
- **event-listener** 5.4.1
- **event-listener-strategy** 0.5.4
- **fastrand** 2.4.1
- **fdeflate** 0.3.7
- **field-offset** 0.3.6  
  Copyright (c) 2016-2021 Diggory Blake, and other contributors.
- **flate2** 1.1.9  
  Copyright (c) 2014-2026 Alex Crichton
- **fnv** 1.0.7  
  Copyright (c) 2017 Contributors
- **foreign-types** 0.5.0  
  Copyright (c) 2017 The foreign-types Developers
- **foreign-types-macros** 0.2.3  
  Copyright (c) 2017 The foreign-types Developers
- **foreign-types-shared** 0.3.1  
  Copyright (c) 2017 The foreign-types Developers
- **form_urlencoded** 1.2.2  
  Copyright (c) 2013-2016 The rust-url developers
- **futf** 0.1.5  
  Copyright (c) 2015 Keegan McAllister
- **futures-channel** 0.3.32  
  Copyright (c) 2016 Alex Crichton  
  Copyright (c) 2017 The Tokio Authors
- **futures-core** 0.3.32  
  Copyright (c) 2016 Alex Crichton  
  Copyright (c) 2017 The Tokio Authors
- **futures-executor** 0.3.32  
  Copyright (c) 2016 Alex Crichton  
  Copyright (c) 2017 The Tokio Authors
- **futures-io** 0.3.32  
  Copyright (c) 2016 Alex Crichton  
  Copyright (c) 2017 The Tokio Authors
- **futures-lite** 2.6.1
- **futures-macro** 0.3.32  
  Copyright (c) 2016 Alex Crichton  
  Copyright (c) 2017 The Tokio Authors
- **futures-task** 0.3.32  
  Copyright (c) 2016 Alex Crichton  
  Copyright (c) 2017 The Tokio Authors
- **futures-util** 0.3.32  
  Copyright (c) 2016 Alex Crichton  
  Copyright (c) 2017 The Tokio Authors
- **fxhash** 0.2.1
- **gdk** 0.18.2
- **gdk-pixbuf** 0.18.5
- **gdk-pixbuf-sys** 0.18.0
- **gdk-sys** 0.18.2
- **gdkwayland-sys** 0.18.2
- **gdkx11** 0.18.2
- **gdkx11-sys** 0.18.2
- **generic-array** 0.14.7  
  Copyright (c) 2015 Bartłomiej Kamiński
- **getrandom** 0.3.4  
  Copyright (c) 2018-2025 The rust-random Project Developers  
  Copyright (c) 2014 The Rust Project Developers
- **getrandom** 0.4.2  
  Copyright (c) 2018-2026 The rust-random Project Developers  
  Copyright (c) 2014 The Rust Project Developers
- **getrandom** 0.2.17  
  Copyright (c) 2018-2024 The rust-random Project Developers  
  Copyright (c) 2014 The Rust Project Developers
- **gio** 0.18.4
- **gio-sys** 0.18.1
- **glib** 0.18.5
- **glib-macros** 0.18.5
- **glib-sys** 0.18.1
- **glob** 0.3.3  
  Copyright (c) 2014 The Rust Project Developers
- **gobject-sys** 0.18.0
- **gtk** 0.18.2
- **gtk-sys** 0.18.2
- **gtk3-macros** 0.18.2
- **hashbrown** 0.17.0  
  Copyright (c) 2016 Amanieu d'Antras
- **hashbrown** 0.12.3  
  Copyright (c) 2016 Amanieu d'Antras
- **heck** 0.5.0  
  Copyright (c) 2015 The Rust Project Developers
- **heck** 0.4.1  
  Copyright (c) 2015 The Rust Project Developers
- **hex** 0.4.3  
  Copyright (c) 2013-2014 The Rust Project Developers.  
  Copyright (c) 2015-2020 The rust-hex Developers
- **html5ever** 0.38.0  
  Copyright (c) 2014 The html5ever Project Developers
- **html5ever** 0.29.1  
  Copyright (c) 2014 The html5ever Project Developers
- **http** 1.4.0  
  Copyright (c) 2017 http-rs authors
- **ico** 0.5.0  
  Copyright (c) 2018 Matthew D. Steele
- **ident_case** 1.0.1
- **idna** 1.1.0  
  Copyright (c) 2013-2025 The rust-url developers
- **idna_adapter** 1.2.1  
  Copyright (c) The rust-url developers
- **indexmap** 2.14.0  
  Copyright (c) 2016--2017
- **indexmap** 1.9.3  
  Copyright (c) 2016--2017
- **infer** 0.19.0  
  Copyright (c) 2019 Bojan
- **is-docker** 0.2.0  
  Copyright (c) 2023 Sean Larkin
- **is-wsl** 0.4.0  
  Copyright (c) 2023 Sean Larkin
- **itoa** 1.0.18
- **javascriptcore-rs** 1.1.2  
  Copyright (c) 2013-2021, The Gtk-rs Project Developers.  
  Copyright (c) 2021, Tauri Programme within The Commons Conservancy.
- **javascriptcore-rs-sys** 1.1.1  
  Copyright (c) 2013-2017, The Gtk-rs Project Developers.
- **json-patch** 3.0.1  
  Copyright (c) 2017 Ivan Dubrov
- **jsonptr** 0.6.3  
  Copyright (c) 2022 Chance Dinkins
- **keyboard-types** 0.7.0  
  Copyright (c) 2017 Pyfisch
- **kuchikiki** 0.8.8-speedreader
- **libc** 0.2.185  
  Copyright (c) The Rust Project Developers
- **libdbus-sys** 0.2.7  
  Copyright (c) 2014-2018 David Henningsson <diwic@ubuntu.com> and other contributors
- **linux-raw-sys** 0.12.1
- **lock_api** 0.4.14  
  Copyright (c) 2016 The Rust Project Developers
- **log** 0.4.29  
  Copyright (c) 2014 The Rust Project Developers
- **mac** 0.1.1
- **markup5ever** 0.38.0  
  Copyright (c) 2014 The html5ever Project Developers
- **markup5ever** 0.14.1  
  Copyright (c) 2014 The html5ever Project Developers
- **match_token** 0.1.0
- **matches** 0.1.10  
  Copyright (c) 2014-2016 Simon Sapin
- **memchr** 2.8.0  
  Copyright (c) 2015 Andrew Gallant
- **memoffset** 0.9.1  
  Copyright (c) 2017 Gilad Naaman
- **mime** 0.3.17  
  Copyright (c) 2014 Sean McArthur
- **miniz_oxide** 0.8.9  
  Copyright 2013-2014 RAD Game Tools and Valve Software  
  Copyright 2010-2014 Rich Geldreich and Tenacious Software LLC  
  Copyright (c) 2017 Frommi
- **muda** 0.19.1  
  Copyright (c) 2022-2022 Tauri Programme within The Commons Conservancy
- **new_debug_unreachable** 1.0.6  
  Copyright (c) 2015 Jonathan Reem
- **nodrop** 0.1.14  
  Copyright (c) Ulrik Sverdrup "bluss" 2015-2017
- **num-conv** 0.2.1  
  Copyright (c) Jacob Pratt
- **objc2** 0.6.4
- **objc2-app-kit** 0.3.2
- **objc2-core-foundation** 0.3.2
- **objc2-encode** 4.1.0
- **objc2-exception-helper** 0.1.1
- **objc2-foundation** 0.3.2
- **objc2-web-kit** 0.3.2
- **once_cell** 1.21.4
- **open** 5.3.3  
  Copyright © `2015` `Sebastian Thiel`
- **ordered-stream** 0.2.0
- **os_pipe** 1.2.3
- **pango** 0.18.3
- **pango-sys** 0.18.0
- **parking** 2.2.1
- **parking_lot** 0.12.5  
  Copyright (c) 2016 The Rust Project Developers
- **parking_lot_core** 0.9.12  
  Copyright (c) 2016 The Rust Project Developers
- **pathdiff** 0.2.3
- **percent-encoding** 2.3.2  
  Copyright (c) 2013-2025 The rust-url developers
- **phf** 0.13.1  
  Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi
- **phf** 0.11.3  
  Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi
- **phf** 0.10.1
- **phf** 0.8.0
- **phf_generator** 0.13.1  
  Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi
- **phf_generator** 0.10.0
- **phf_macros** 0.13.1  
  Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi
- **phf_macros** 0.10.0
- **phf_shared** 0.13.1  
  Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi
- **phf_shared** 0.11.3  
  Copyright (c) 2014-2022 Steven Fackler, Yuki Okushi
- **phf_shared** 0.10.0
- **phf_shared** 0.8.0
- **pin-project-lite** 0.2.17
- **piper** 0.2.5
- **plist** 1.8.0  
  Copyright (c) 2015 Edward Barnard
- **png** 0.18.1  
  Copyright (c) 2015 nwin
- **png** 0.17.16  
  Copyright (c) 2015 nwin
- **polling** 3.11.0
- **powerfmt** 0.2.0  
  Copyright (c) 2023 Jacob Pratt et al.
- **ppv-lite86** 0.2.21  
  Copyright (c) 2019 The CryptoCorrosion Contributors
- **precomputed-hash** 0.1.1  
  Copyright (c) 2017 Emilio Cobos Álvarez
- **proc-macro-crate** 2.0.2
- **proc-macro-crate** 1.3.1
- **proc-macro-crate** 3.5.0
- **proc-macro-error** 1.0.4  
  Copyright (c) 2019-2020 CreepySkeleton
- **proc-macro-error-attr** 1.0.4  
  Copyright (c) 2019-2020 CreepySkeleton
- **proc-macro-hack** 0.5.20+deprecated  
  Copyright (c) 2018 David Tolnay
- **proc-macro2** 1.0.106
- **quick-xml** 0.38.4  
  Copyright (c) 2016 Johann Tuffe
- **quote** 1.0.45
- **rand** 0.8.5  
  Copyright 2018 Developers of the Rand project  
  Copyright (c) 2014 The Rust Project Developers
- **rand_chacha** 0.3.1  
  Copyright 2018 Developers of the Rand project  
  Copyright (c) 2014 The Rust Project Developers
- **rand_core** 0.6.4  
  Copyright 2018 Developers of the Rand project  
  Copyright (c) 2014 The Rust Project Developers
- **raw-window-handle** 0.6.2  
  Copyright (c) 2019 Osspial
- **regex** 1.12.3  
  Copyright (c) 2014 The Rust Project Developers
- **regex-automata** 0.4.14  
  Copyright (c) 2014 The Rust Project Developers
- **regex-syntax** 0.8.11  
  Copyright (c) 2014 The Rust Project Developers
- **rfd** 0.16.0  
  Copyright (c) 2022 Bartłomiej Maryńczak
- **rustc-hash** 2.1.2
- **rustix** 1.1.4
- **same-file** 1.0.6  
  Copyright (c) 2017 Andrew Gallant
- **schemars** 0.8.22  
  Copyright (c) 2019 Graham Esau
- **schemars_derive** 0.8.22  
  Copyright (c) 2019 Graham Esau
- **scopeguard** 1.2.0  
  Copyright (c) 2016-2019 Ulrik Sverdrup "bluss" and scopeguard developers
- **semver** 1.0.28
- **serde** 1.0.228
- **serde_core** 1.0.228
- **serde_derive** 1.0.228
- **serde_derive_internals** 0.29.1
- **serde_json** 1.0.150
- **serde_repr** 0.1.20
- **serde_spanned** 1.1.1  
  Copyright (c) Individual contributors
- **serde_spanned** 0.6.9  
  Copyright (c) Individual contributors
- **serde_with** 3.18.0  
  Copyright (c) 2015
- **serde_with_macros** 3.18.0  
  Copyright (c) 2015
- **serde-untagged** 0.1.9
- **serialize-to-javascript** 0.1.2  
  Copyright (c) 2021 Chip Reed
- **serialize-to-javascript-impl** 0.1.2  
  Copyright (c) 2021 Chip Reed
- **servo_arc** 0.4.3
- **servo_arc** 0.2.0
- **sha2** 0.10.9  
  Copyright (c) 2006-2009 Graydon Hoare  
  Copyright (c) 2009-2013 Mozilla Foundation  
  Copyright (c) 2016 Artyom Pavlov
- **shared_child** 1.1.1
- **sigchld** 0.2.4
- **signal-hook** 0.3.18  
  Copyright (c) 2017 tokio-jsonrpc developers
- **signal-hook-registry** 1.4.8  
  Copyright (c) 2017 tokio-jsonrpc developers
- **simd-adler32** 0.3.9  
  Copyright (c) [2021] [Marvin Countryman]
- **siphasher** 1.0.2  
  Copyright 2012-2016 The Rust Project Developers.  
  Copyright 2016-2026 Frank Denis.
- **siphasher** 0.3.11  
  Copyright 2012-2016 The Rust Project Developers.  
  Copyright 2016-2023 Frank Denis.
- **slab** 0.4.12  
  Copyright (c) 2019 Carl Lerche
- **smallvec** 1.15.1  
  Copyright (c) 2018 The Servo Project Developers
- **softbuffer** 0.4.8  
  Copyright 2022 Kirill Chibisov
- **soup3** 0.5.0  
  Copyright (c) 2013-2017, The Gtk-rs Project Developers.
- **soup3-sys** 0.5.0  
  Copyright (c) 2013-2017, The Gtk-rs Project Developers.
- **stable_deref_trait** 1.2.1  
  Copyright (c) 2017 Robert Grosse
- **string_cache** 0.9.0  
  Copyright (c) 2012-2013 Mozilla Foundation
- **string_cache** 0.8.9  
  Copyright (c) 2012-2013 Mozilla Foundation
- **strsim** 0.11.1  
  Copyright (c) 2015 Danny Guo  
  Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com>  
  Copyright (c) 2018 Akash Kurdekar
- **syn** 2.0.117
- **syn** 1.0.109
- **synstructure** 0.13.2  
  Copyright 2016 Nika Layzell
- **tauri** 2.11.4  
  Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-codegen** 2.6.3  
  Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-macros** 2.6.3  
  Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-plugin-dialog** 2.7.1  
  Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-plugin-fs** 2.5.1  
  Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-plugin-opener** 2.5.4  
  Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-plugin-shell** 2.3.5  
  Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-runtime** 2.11.3  
  Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-runtime-wry** 2.11.4  
  Copyright (c) 2017 - Present Tauri Apps Contributors
- **tauri-utils** 2.9.3  
  Copyright (c) 2017 - Present Tauri Apps Contributors
- **tendril** 0.5.0  
  Copyright (c) 2015 Keegan McAllister
- **tendril** 0.4.3  
  Copyright (c) 2015 Keegan McAllister
- **thiserror** 2.0.18
- **thiserror** 1.0.69
- **thiserror-impl** 2.0.18
- **thiserror-impl** 1.0.69
- **time** 0.3.47  
  Copyright (c) Jacob Pratt et al.
- **time-core** 0.1.8  
  Copyright (c) Jacob Pratt et al.
- **time-macros** 0.2.27  
  Copyright (c) Jacob Pratt et al.
- **tokio** 1.52.3  
  Copyright (c) Tokio Contributors
- **toml** 1.1.2+spec-1.1.0  
  Copyright (c) Individual contributors
- **toml_datetime** 1.1.1+spec-1.1.0  
  Copyright (c) Individual contributors
- **toml_datetime** 0.6.3  
  Copyright (c) 2014 Alex Crichton
- **toml_edit** 0.20.2  
  Copyright (c) Individual contributors
- **toml_edit** 0.19.15  
  Copyright (c) Individual contributors
- **toml_edit** 0.25.11+spec-1.1.0  
  Copyright (c) Individual contributors
- **toml_parser** 1.1.2+spec-1.1.0  
  Copyright (c) Individual contributors
- **toml_writer** 1.1.1+spec-1.1.0  
  Copyright (c) Individual contributors
- **tracing** 0.1.44  
  Copyright (c) 2019 Tokio Contributors
- **tracing-attributes** 0.1.31  
  Copyright (c) 2019 Tokio Contributors
- **tracing-core** 0.1.36  
  Copyright (c) 2019 Tokio Contributors
- **typeid** 1.0.3
- **typenum** 1.19.0  
  Copyright (c) 2014 Paho Lurie-Gregg
- **unic-char-property** 0.9.0
- **unic-char-range** 0.9.0
- **unic-common** 0.9.0
- **unic-ucd-ident** 0.9.0
- **unic-ucd-version** 0.9.0
- **unicode-segmentation** 1.13.2  
  Copyright (c) 2015 The Rust Project Developers
- **url** 2.5.8  
  Copyright (c) 2013-2025 The rust-url developers
- **urlpattern** 0.3.0  
  Copyright (c) 2021 the Deno authors
- **utf-8** 0.7.6
- **utf8_iter** 1.0.4  
  Copyright Mozilla Foundation
- **uuid** 1.23.0  
  Copyright (c) 2014 The Rust Project Developers  
  Copyright (c) 2018 Ashley Mannix, Christopher Armstrong, Dylan DPC, Hunar Roop Kahlon
- **walkdir** 2.5.0  
  Copyright (c) 2015 Andrew Gallant
- **web_atoms** 0.2.3  
  Copyright (c) 2014 The html5ever Project Developers
- **webkit2gtk** 2.0.2  
  Copyright (c) 2016 Boucher, Antoni <bouanto@zoho.com>  
  Copyright (c) 2017-2021, The Gtk-rs Project Developers.  
  Copyright (c) 2021, Tauri Programme within The Commons Conservancy
- **webkit2gtk-sys** 2.0.2  
  Copyright (c) 2016 Boucher, Antoni <bouanto@zoho.com>
- **webview2-com** 0.38.2
- **webview2-com-macros** 0.8.1
- **webview2-com-sys** 0.38.2
- **winapi-util** 0.1.11  
  Copyright (c) 2017 Andrew Gallant
- **window-vibrancy** 0.6.0  
  Copyright (c) 2020-2022 Tauri Programme within The Commons Conservancy
- **windows** 0.61.3  
  Copyright (c) Microsoft Corporation.
- **windows_x86_64_msvc** 0.53.1  
  Copyright (c) Microsoft Corporation.
- **windows_x86_64_msvc** 0.52.6  
  Copyright (c) Microsoft Corporation.
- **windows-collections** 0.2.0  
  Copyright (c) Microsoft Corporation.
- **windows-core** 0.61.2  
  Copyright (c) Microsoft Corporation.
- **windows-future** 0.2.1  
  Copyright (c) Microsoft Corporation.
- **windows-implement** 0.60.2  
  Copyright (c) Microsoft Corporation.
- **windows-interface** 0.59.3  
  Copyright (c) Microsoft Corporation.
- **windows-link** 0.2.1  
  Copyright (c) Microsoft Corporation.
- **windows-link** 0.1.3  
  Copyright (c) Microsoft Corporation.
- **windows-numerics** 0.2.0  
  Copyright (c) Microsoft Corporation.
- **windows-result** 0.3.4  
  Copyright (c) Microsoft Corporation.
- **windows-strings** 0.4.2  
  Copyright (c) Microsoft Corporation.
- **windows-sys** 0.60.2  
  Copyright (c) Microsoft Corporation.
- **windows-sys** 0.61.2  
  Copyright (c) Microsoft Corporation.
- **windows-sys** 0.59.0  
  Copyright (c) Microsoft Corporation.
- **windows-targets** 0.53.5  
  Copyright (c) Microsoft Corporation.
- **windows-targets** 0.52.6  
  Copyright (c) Microsoft Corporation.
- **windows-threading** 0.1.0  
  Copyright (c) Microsoft Corporation.
- **windows-version** 0.1.7  
  Copyright (c) Microsoft Corporation.
- **winnow** 1.0.1
- **winnow** 0.5.40
- **wry** 0.55.1  
  Copyright (c) 2020-2023 Ngo Iok Ui & Tauri Programme within The Commons Conservancy
- **x11** 2.21.0
- **x11-dl** 2.21.0
- **zbus** 5.16.0  
  Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors
- **zbus_macros** 5.16.0  
  Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors
- **zbus_names** 4.3.2  
  Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors
- **zerocopy** 0.8.48  
  Copyright 2023 The Fuchsia Authors
- **zmij** 1.0.21
- **zvariant** 5.12.0  
  Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors
- **zvariant_derive** 5.12.0  
  Copyright (c) 2024 Zeeshan Ali Khan & zbus contributors
- **zvariant_utils** 3.4.0

### Apache-2.0 (2)

- **dunce** 1.0.5
- **tao** 0.35.2

### BSD-3-Clause (2)

- **alloc-no-stdlib** 2.0.4  
  Copyright (c) 2016 Dropbox, Inc.
- **alloc-stdlib** 0.2.2

### Zlib (1)

- **foldhash** 0.2.0  
  Copyright (c) 2024 Orson Peters

### Unicode-3.0 (18)

- **icu_collections** 2.2.0  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **icu_locale_core** 2.2.0  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **icu_normalizer** 2.2.0  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **icu_normalizer_data** 2.2.0  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **icu_properties** 2.2.0  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **icu_properties_data** 2.2.0  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **icu_provider** 2.2.0  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **litemap** 0.8.2  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **potential_utf** 0.1.5  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **tinystr** 0.8.3  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **writeable** 0.6.3  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **yoke** 0.8.2  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **yoke-derive** 0.8.2  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **zerofrom** 0.1.7  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **zerofrom-derive** 0.1.7  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **zerotrie** 0.2.4  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **zerovec** 0.11.6  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.
- **zerovec-derive** 0.11.3  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 2020-2024 Unicode, Inc.

### MPL-2.0 (7)

- **cssparser** 0.36.0
- **cssparser** 0.29.6
- **cssparser-macros** 0.6.1
- **dtoa-short** 0.3.5
- **option-ext** 0.2.0
- **selectors** 0.36.1
- **selectors** 0.24.0

### Apache-2.0 AND MIT (1)

- **dpi** 0.1.2  
  Copyright (c) 2018 Jorge Aparicio  
  copyright:  
  Copyright © 2005-2020 Rich Felker, et al.

### BSD-3-Clause AND MIT (1)

- **brotli** 8.0.2  
  Copyright (c) 2009, 2010, 2013-2016 by the Brotli Authors.

### MIT AND BSD-3-Clause (1)

- **encoding_rs** 0.8.35  
  Copyright Mozilla Foundation

### MIT AND Unicode-3.0 (1)

- **unicode-ident** 1.0.24  
  COPYRIGHT AND PERMISSION NOTICE  
  Copyright © 1991-2023 Unicode, Inc.

## NOTICE files

Reproduced as required by Apache License 2.0, clause 4(d).

From github.com/agext/levenshtein:

```
Alrux Go EXTensions (AGExt) - package levenshtein
Copyright 2016 ALRUX Inc.

This product includes software developed at ALRUX Inc.
(http://www.alrux.com/).
```

From gopkg.in/yaml.v3:

```
Copyright 2011-2016 Canonical Ltd.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

From github.com/aws/aws-sdk-go-v2:

```
AWS SDK for Go
Copyright 2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.
Copyright 2014-2015 Stripe, Inc.
```

From github.com/aws/smithy-go:

```
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
```

## Licence texts

### MIT

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Apache-2.0

```
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### BSD-3-Clause

```
BSD 3-Clause License

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

### ISC

```
ISC License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

### Zlib

```
zlib License

This software is provided 'as-is', without any express or implied warranty.
In no event will the authors be held liable for any damages arising from the
use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
   claim that you wrote the original software. If you use this software in a
   product, an acknowledgment in the product documentation would be
   appreciated but is not required.

2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.

3. This notice may not be removed or altered from any source distribution.
```

### 0BSD

```
Zero-Clause BSD (0BSD)

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

### Unicode-3.0

```
UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 1991-2023 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.
```

### Python-2.0

```
A. HISTORY OF THE SOFTWARE
==========================

Python was created in the early 1990s by Guido van Rossum at Stichting
Mathematisch Centrum (CWI, see http://www.cwi.nl) in the Netherlands
as a successor of a language called ABC.  Guido remains Python's
principal author, although it includes many contributions from others.

In 1995, Guido continued his work on Python at the Corporation for
National Research Initiatives (CNRI, see http://www.cnri.reston.va.us)
in Reston, Virginia where he released several versions of the
software.

In May 2000, Guido and the Python core development team moved to
BeOpen.com to form the BeOpen PythonLabs team.  In October of the same
year, the PythonLabs team moved to Digital Creations, which became
Zope Corporation.  In 2001, the Python Software Foundation (PSF, see
https://www.python.org/psf/) was formed, a non-profit organization
created specifically to own Python-related Intellectual Property.
Zope Corporation was a sponsoring member of the PSF.

All Python releases are Open Source (see http://www.opensource.org for
the Open Source Definition).  Historically, most, but not all, Python
releases have also been GPL-compatible; the table below summarizes
the various releases.

    Release         Derived     Year        Owner       GPL-
                    from                                compatible? (1)

    0.9.0 thru 1.2              1991-1995   CWI         yes
    1.3 thru 1.5.2  1.2         1995-1999   CNRI        yes
    1.6             1.5.2       2000        CNRI        no
    2.0             1.6         2000        BeOpen.com  no
    1.6.1           1.6         2001        CNRI        yes (2)
    2.1             2.0+1.6.1   2001        PSF         no
    2.0.1           2.0+1.6.1   2001        PSF         yes
    2.1.1           2.1+2.0.1   2001        PSF         yes
    2.1.2           2.1.1       2002        PSF         yes
    2.1.3           2.1.2       2002        PSF         yes
    2.2 and above   2.1.1       2001-now    PSF         yes

Footnotes:

(1) GPL-compatible doesn't mean that we're distributing Python under
    the GPL.  All Python licenses, unlike the GPL, let you distribute
    a modified version without making your changes open source.  The
    GPL-compatible licenses make it possible to combine Python with
    other software that is released under the GPL; the others don't.

(2) According to Richard Stallman, 1.6.1 is not GPL-compatible,
    because its license has a choice of law clause.  According to
    CNRI, however, Stallman's lawyer has told CNRI's lawyer that 1.6.1
    is "not incompatible" with the GPL.

Thanks to the many outside volunteers who have worked under Guido's
direction to make these releases possible.


B. TERMS AND CONDITIONS FOR ACCESSING OR OTHERWISE USING PYTHON
===============================================================

PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2
--------------------------------------------

1. This LICENSE AGREEMENT is between the Python Software Foundation
("PSF"), and the Individual or Organization ("Licensee") accessing and
otherwise using this software ("Python") in source or binary form and
its associated documentation.

2. Subject to the terms and conditions of this License Agreement, PSF hereby
grants Licensee a nonexclusive, royalty-free, world-wide license to reproduce,
analyze, test, perform and/or display publicly, prepare derivative works,
distribute, and otherwise use Python alone or in any derivative version,
provided, however, that PSF's License Agreement and PSF's notice of copyright,
i.e., "Copyright (c) 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010,
2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020 Python Software Foundation;
All Rights Reserved" are retained in Python alone or in any derivative version
prepared by Licensee.

3. In the event Licensee prepares a derivative work that is based on
or incorporates Python or any part thereof, and wants to make
the derivative work available to others as provided herein, then
Licensee hereby agrees to include in any such work a brief summary of
the changes made to Python.

4. PSF is making Python available to Licensee on an "AS IS"
basis.  PSF MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR
IMPLIED.  BY WAY OF EXAMPLE, BUT NOT LIMITATION, PSF MAKES NO AND
DISCLAIMS ANY REPRESENTATION OR WARRANTY OF MERCHANTABILITY OR FITNESS
FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF PYTHON WILL NOT
INFRINGE ANY THIRD PARTY RIGHTS.

5. PSF SHALL NOT BE LIABLE TO LICENSEE OR ANY OTHER USERS OF PYTHON
FOR ANY INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES OR LOSS AS
A RESULT OF MODIFYING, DISTRIBUTING, OR OTHERWISE USING PYTHON,
OR ANY DERIVATIVE THEREOF, EVEN IF ADVISED OF THE POSSIBILITY THEREOF.

6. This License Agreement will automatically terminate upon a material
breach of its terms and conditions.

7. Nothing in this License Agreement shall be deemed to create any
relationship of agency, partnership, or joint venture between PSF and
Licensee.  This License Agreement does not grant permission to use PSF
trademarks or trade name in a trademark sense to endorse or promote
products or services of Licensee, or any third party.

8. By copying, installing or otherwise using Python, Licensee
agrees to be bound by the terms and conditions of this License
Agreement.


BEOPEN.COM LICENSE AGREEMENT FOR PYTHON 2.0
-------------------------------------------

BEOPEN PYTHON OPEN SOURCE LICENSE AGREEMENT VERSION 1

1. This LICENSE AGREEMENT is between BeOpen.com ("BeOpen"), having an
office at 160 Saratoga Avenue, Santa Clara, CA 95051, and the
Individual or Organization ("Licensee") accessing and otherwise using
this software in source or binary form and its associated
documentation ("the Software").

2. Subject to the terms and conditions of this BeOpen Python License
Agreement, BeOpen hereby grants Licensee a non-exclusive,
royalty-free, world-wide license to reproduce, analyze, test, perform
and/or display publicly, prepare derivative works, distribute, and
otherwise use the Software alone or in any derivative version,
provided, however, that the BeOpen Python License is retained in the
Software, alone or in any derivative version prepared by Licensee.

3. BeOpen is making the Software available to Licensee on an "AS IS"
basis.  BEOPEN MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR
IMPLIED.  BY WAY OF EXAMPLE, BUT NOT LIMITATION, BEOPEN MAKES NO AND
DISCLAIMS ANY REPRESENTATION OR WARRANTY OF MERCHANTABILITY OR FITNESS
FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE SOFTWARE WILL NOT
INFRINGE ANY THIRD PARTY RIGHTS.

4. BEOPEN SHALL NOT BE LIABLE TO LICENSEE OR ANY OTHER USERS OF THE
SOFTWARE FOR ANY INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES OR LOSS
AS A RESULT OF USING, MODIFYING OR DISTRIBUTING THE SOFTWARE, OR ANY
DERIVATIVE THEREOF, EVEN IF ADVISED OF THE POSSIBILITY THEREOF.

5. This License Agreement will automatically terminate upon a material
breach of its terms and conditions.

6. This License Agreement shall be governed by and interpreted in all
respects by the law of the State of California, excluding conflict of
law provisions.  Nothing in this License Agreement shall be deemed to
create any relationship of agency, partnership, or joint venture
between BeOpen and Licensee.  This License Agreement does not grant
permission to use BeOpen trademarks or trade names in a trademark
sense to endorse or promote products or services of Licensee, or any
third party.  As an exception, the "BeOpen Python" logos available at
http://www.pythonlabs.com/logos.html may be used according to the
permissions granted on that web page.

7. By copying, installing or otherwise using the software, Licensee
agrees to be bound by the terms and conditions of this License
Agreement.


CNRI LICENSE AGREEMENT FOR PYTHON 1.6.1
---------------------------------------

1. This LICENSE AGREEMENT is between the Corporation for National
Research Initiatives, having an office at 1895 Preston White Drive,
Reston, VA 20191 ("CNRI"), and the Individual or Organization
("Licensee") accessing and otherwise using Python 1.6.1 software in
source or binary form and its associated documentation.

2. Subject to the terms and conditions of this License Agreement, CNRI
hereby grants Licensee a nonexclusive, royalty-free, world-wide
license to reproduce, analyze, test, perform and/or display publicly,
prepare derivative works, distribute, and otherwise use Python 1.6.1
alone or in any derivative version, provided, however, that CNRI's
License Agreement and CNRI's notice of copyright, i.e., "Copyright (c)
1995-2001 Corporation for National Research Initiatives; All Rights
Reserved" are retained in Python 1.6.1 alone or in any derivative
version prepared by Licensee.  Alternately, in lieu of CNRI's License
Agreement, Licensee may substitute the following text (omitting the
quotes): "Python 1.6.1 is made available subject to the terms and
conditions in CNRI's License Agreement.  This Agreement together with
Python 1.6.1 may be located on the Internet using the following
unique, persistent identifier (known as a handle): 1895.22/1013.  This
Agreement may also be obtained from a proxy server on the Internet
using the following URL: http://hdl.handle.net/1895.22/1013".

3. In the event Licensee prepares a derivative work that is based on
or incorporates Python 1.6.1 or any part thereof, and wants to make
the derivative work available to others as provided herein, then
Licensee hereby agrees to include in any such work a brief summary of
the changes made to Python 1.6.1.

4. CNRI is making Python 1.6.1 available to Licensee on an "AS IS"
basis.  CNRI MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR
IMPLIED.  BY WAY OF EXAMPLE, BUT NOT LIMITATION, CNRI MAKES NO AND
DISCLAIMS ANY REPRESENTATION OR WARRANTY OF MERCHANTABILITY OR FITNESS
FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF PYTHON 1.6.1 WILL NOT
INFRINGE ANY THIRD PARTY RIGHTS.

5. CNRI SHALL NOT BE LIABLE TO LICENSEE OR ANY OTHER USERS OF PYTHON
1.6.1 FOR ANY INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES OR LOSS AS
A RESULT OF MODIFYING, DISTRIBUTING, OR OTHERWISE USING PYTHON 1.6.1,
OR ANY DERIVATIVE THEREOF, EVEN IF ADVISED OF THE POSSIBILITY THEREOF.

6. This License Agreement will automatically terminate upon a material
breach of its terms and conditions.

7. This License Agreement shall be governed by the federal
intellectual property law of the United States, including without
limitation the federal copyright law, and, to the extent such
U.S. federal law does not apply, by the law of the Commonwealth of
Virginia, excluding Virginia's conflict of law provisions.
Notwithstanding the foregoing, with regard to derivative works based
on Python 1.6.1 that incorporate non-separable material that was
previously distributed under the GNU General Public License (GPL), the
law of the Commonwealth of Virginia shall govern this License
Agreement only as to issues arising under or with respect to
Paragraphs 4, 5, and 7 of this License Agreement.  Nothing in this
License Agreement shall be deemed to create any relationship of
agency, partnership, or joint venture between CNRI and Licensee.  This
License Agreement does not grant permission to use CNRI trademarks or
trade name in a trademark sense to endorse or promote products or
services of Licensee, or any third party.

8. By clicking on the "ACCEPT" button where indicated, or by copying,
installing or otherwise using Python 1.6.1, Licensee agrees to be
bound by the terms and conditions of this License Agreement.

        ACCEPT


CWI LICENSE AGREEMENT FOR PYTHON 0.9.0 THROUGH 1.2
--------------------------------------------------

Copyright (c) 1991 - 1995, Stichting Mathematisch Centrum Amsterdam,
The Netherlands.  All rights reserved.

Permission to use, copy, modify, and distribute this software and its
documentation for any purpose and without fee is hereby granted,
provided that the above copyright notice appear in all copies and that
both that copyright notice and this permission notice appear in
supporting documentation, and that the name of Stichting Mathematisch
Centrum or CWI not be used in advertising or publicity pertaining to
distribution of the software without specific, written prior
permission.

STICHTING MATHEMATISCH CENTRUM DISCLAIMS ALL WARRANTIES WITH REGARD TO
THIS SOFTWARE, INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS, IN NO EVENT SHALL STICHTING MATHEMATISCH CENTRUM BE LIABLE
FOR ANY SPECIAL, INDIRECT OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT
OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### MPL-2.0

```
Mozilla Public License Version 2.0
==================================

1. Definitions
--------------

1.1. "Contributor"
means each individual or legal entity that creates, contributes to
the creation of, or owns Covered Software.

1.2. "Contributor Version"
means the combination of the Contributions of others (if any) used
by a Contributor and that particular Contributor's Contribution.

1.3. "Contribution"
means Covered Software of a particular Contributor.

1.4. "Covered Software"
means Source Code Form to which the initial Contributor has attached
the notice in Exhibit A, the Executable Form of such Source Code
Form, and Modifications of such Source Code Form, in each case
including portions thereof.

1.5. "Incompatible With Secondary Licenses"
means

(a) that the initial Contributor has attached the notice described
in Exhibit B to the Covered Software; or

(b) that the Covered Software was made available under the terms of
version 1.1 or earlier of the License, but not also under the
terms of a Secondary License.

1.6. "Executable Form"
means any form of the work other than Source Code Form.

1.7. "Larger Work"
means a work that combines Covered Software with other material, in
a separate file or files, that is not Covered Software.

1.8. "License"
means this document.

1.9. "Licensable"
means having the right to grant, to the maximum extent possible,
whether at the time of the initial grant or subsequently, any and
all of the rights conveyed by this License.

1.10. "Modifications"
means any of the following:

(a) any file in Source Code Form that results from an addition to,
deletion from, or modification of the contents of Covered
Software; or

(b) any new file in Source Code Form that contains any Covered
Software.

1.11. "Patent Claims" of a Contributor
means any patent claim(s), including without limitation, method,
process, and apparatus claims, in any patent Licensable by such
Contributor that would be infringed, but for the grant of the
License, by the making, using, selling, offering for sale, having
made, import, or transfer of either its Contributions or its
Contributor Version.

1.12. "Secondary License"
means either the GNU General Public License, Version 2.0, the GNU
Lesser General Public License, Version 2.1, the GNU Affero General
Public License, Version 3.0, or any later versions of those
licenses.

1.13. "Source Code Form"
means the form of the work preferred for making modifications.

1.14. "You" (or "Your")
means an individual or a legal entity exercising rights under this
License. For legal entities, "You" includes any entity that
controls, is controlled by, or is under common control with You. For
purposes of this definition, "control" means (a) the power, direct
or indirect, to cause the direction or management of such entity,
whether by contract or otherwise, or (b) ownership of more than
fifty percent (50%) of the outstanding shares or beneficial
ownership of such entity.

2. License Grants and Conditions
--------------------------------

2.1. Grants

Each Contributor hereby grants You a world-wide, royalty-free,
non-exclusive license:

(a) under intellectual property rights (other than patent or trademark)
Licensable by such Contributor to use, reproduce, make available,
modify, display, perform, distribute, and otherwise exploit its
Contributions, either on an unmodified basis, with Modifications, or
as part of a Larger Work; and

(b) under Patent Claims of such Contributor to make, use, sell, offer
for sale, have made, import, and otherwise transfer either its
Contributions or its Contributor Version.

2.2. Effective Date

The licenses granted in Section 2.1 with respect to any Contribution
become effective for each Contribution on the date the Contributor first
distributes such Contribution.

2.3. Limitations on Grant Scope

The licenses granted in this Section 2 are the only rights granted under
this License. No additional rights or licenses will be implied from the
distribution or licensing of Covered Software under this License.
Notwithstanding Section 2.1(b) above, no patent license is granted by a
Contributor:

(a) for any code that a Contributor has removed from Covered Software;
or

(b) for infringements caused by: (i) Your and any other third party's
modifications of Covered Software, or (ii) the combination of its
Contributions with other software (except as part of its Contributor
Version); or

(c) under Patent Claims infringed by Covered Software in the absence of
its Contributions.

This License does not grant any rights in the trademarks, service marks,
or logos of any Contributor (except as may be necessary to comply with
the notice requirements in Section 3.4).

2.4. Subsequent Licenses

No Contributor makes additional grants as a result of Your choice to
distribute the Covered Software under a subsequent version of this
License (see Section 10.2) or under the terms of a Secondary License (if
permitted under the terms of Section 3.3).

2.5. Representation

Each Contributor represents that the Contributor believes its
Contributions are its original creation(s) or it has sufficient rights
to grant the rights to its Contributions conveyed by this License.

2.6. Fair Use

This License is not intended to limit any rights You have under
applicable copyright doctrines of fair use, fair dealing, or other
equivalents.

2.7. Conditions

Sections 3.1, 3.2, 3.3, and 3.4 are conditions of the licenses granted
in Section 2.1.

3. Responsibilities
-------------------

3.1. Distribution of Source Form

All distribution of Covered Software in Source Code Form, including any
Modifications that You create or to which You contribute, must be under
the terms of this License. You must inform recipients that the Source
Code Form of the Covered Software is governed by the terms of this
License, and how they can obtain a copy of this License. You may not
attempt to alter or restrict the recipients' rights in the Source Code
Form.

3.2. Distribution of Executable Form

If You distribute Covered Software in Executable Form then:

(a) such Covered Software must also be made available in Source Code
Form, as described in Section 3.1, and You must inform recipients of
the Executable Form how they can obtain a copy of such Source Code
Form by reasonable means in a timely manner, at a charge no more
than the cost of distribution to the recipient; and

(b) You may distribute such Executable Form under the terms of this
License, or sublicense it under different terms, provided that the
license for the Executable Form does not attempt to limit or alter
the recipients' rights in the Source Code Form under this License.

3.3. Distribution of a Larger Work

You may create and distribute a Larger Work under terms of Your choice,
provided that You also comply with the requirements of this License for
the Covered Software. If the Larger Work is a combination of Covered
Software with a work governed by one or more Secondary Licenses, and the
Covered Software is not Incompatible With Secondary Licenses, this
License permits You to additionally distribute such Covered Software
under the terms of such Secondary License(s), so that the recipient of
the Larger Work may, at their option, further distribute the Covered
Software under the terms of either this License or such Secondary
License(s).

3.4. Notices

You may not remove or alter the substance of any license notices
(including copyright notices, patent notices, disclaimers of warranty,
or limitations of liability) contained within the Source Code Form of
the Covered Software, except that You may alter any license notices to
the extent required to remedy known factual inaccuracies.

3.5. Application of Additional Terms

You may choose to offer, and to charge a fee for, warranty, support,
indemnity or liability obligations to one or more recipients of Covered
Software. However, You may do so only on Your own behalf, and not on
behalf of any Contributor. You must make it absolutely clear that any
such warranty, support, indemnity, or liability obligation is offered by
You alone, and You hereby agree to indemnify every Contributor for any
liability incurred by such Contributor as a result of warranty, support,
indemnity or liability terms You offer. You may include additional
disclaimers of warranty and limitations of liability specific to any
jurisdiction.

4. Inability to Comply Due to Statute or Regulation
---------------------------------------------------

If it is impossible for You to comply with any of the terms of this
License with respect to some or all of the Covered Software due to
statute, judicial order, or regulation then You must: (a) comply with
the terms of this License to the maximum extent possible; and (b)
describe the limitations and the code they affect. Such description must
be placed in a text file included with all distributions of the Covered
Software under this License. Except to the extent prohibited by statute
or regulation, such description must be sufficiently detailed for a
recipient of ordinary skill to be able to understand it.

5. Termination
--------------

5.1. The rights granted under this License will terminate automatically
if You fail to comply with any of its terms. However, if You become
compliant, then the rights granted under this License from a particular
Contributor are reinstated (a) provisionally, unless and until such
Contributor explicitly and finally terminates Your grants, and (b) on an
ongoing basis, if such Contributor fails to notify You of the
non-compliance by some reasonable means prior to 60 days after You have
come back into compliance. Moreover, Your grants from a particular
Contributor are reinstated on an ongoing basis if such Contributor
notifies You of the non-compliance by some reasonable means, this is the
first time You have received notice of non-compliance with this License
from such Contributor, and You become compliant prior to 30 days after
Your receipt of the notice.

5.2. If You initiate litigation against any entity by asserting a patent
infringement claim (excluding declaratory judgment actions,
counter-claims, and cross-claims) alleging that a Contributor Version
directly or indirectly infringes any patent, then the rights granted to
You by any and all Contributors for the Covered Software under Section
2.1 of this License shall terminate.

5.3. In the event of termination under Sections 5.1 or 5.2 above, all
end user license agreements (excluding distributors and resellers) which
have been validly granted by You or Your distributors under this License
prior to termination shall survive termination.

************************************************************************
* *
* 6. Disclaimer of Warranty *
* ------------------------- *
* *
* Covered Software is provided under this License on an "as is" *
* basis, without warranty of any kind, either expressed, implied, or *
* statutory, including, without limitation, warranties that the *
* Covered Software is free of defects, merchantable, fit for a *
* particular purpose or non-infringing. The entire risk as to the *
* quality and performance of the Covered Software is with You. *
* Should any Covered Software prove defective in any respect, You *
* (not any Contributor) assume the cost of any necessary servicing, *
* repair, or correction. This disclaimer of warranty constitutes an *
* essential part of this License. No use of any Covered Software is *
* authorized under this License except under this disclaimer. *
* *
************************************************************************

************************************************************************
* *
* 7. Limitation of Liability *
* -------------------------- *
* *
* Under no circumstances and under no legal theory, whether tort *
* (including negligence), contract, or otherwise, shall any *
* Contributor, or anyone who distributes Covered Software as *
* permitted above, be liable to You for any direct, indirect, *
* special, incidental, or consequential damages of any character *
* including, without limitation, damages for lost profits, loss of *
* goodwill, work stoppage, computer failure or malfunction, or any *
* and all other commercial damages or losses, even if such party *
* shall have been informed of the possibility of such damages. This *
* limitation of liability shall not apply to liability for death or *
* personal injury resulting from such party's negligence to the *
* extent applicable law prohibits such limitation. Some *
* jurisdictions do not allow the exclusion or limitation of *
* incidental or consequential damages, so this exclusion and *
* limitation may not apply to You. *
* *
************************************************************************

8. Litigation
-------------

Any litigation relating to this License may be brought only in the
courts of a jurisdiction where the defendant maintains its principal
place of business and such litigation shall be governed by laws of that
jurisdiction, without reference to its conflict-of-law provisions.
Nothing in this Section shall prevent a party's ability to bring
cross-claims or counter-claims.

9. Miscellaneous
----------------

This License represents the complete agreement concerning the subject
matter hereof. If any provision of this License is held to be
unenforceable, such provision shall be reformed only to the extent
necessary to make it enforceable. Any law or regulation which provides
that the language of a contract shall be construed against the drafter
shall not be used to construe this License against a Contributor.

10. Versions of the License
---------------------------

10.1. New Versions

Mozilla Foundation is the license steward. Except as provided in Section
10.3, no one other than the license steward has the right to modify or
publish new versions of this License. Each version will be given a
distinguishing version number.

10.2. Effect of New Versions

You may distribute the Covered Software under the terms of the version
of the License under which You originally received the Covered Software,
or under the terms of any subsequent version published by the license
steward.

10.3. Modified Versions

If you create software not governed by this License, and you want to
create a new license for such software, you may create and use a
modified version of this License if you rename the license and remove
any references to the name of the license steward (except to note that
such modified license differs from this License).

10.4. Distributing Source Code Form that is Incompatible With Secondary
Licenses

If You choose to distribute Source Code Form that is Incompatible With
Secondary Licenses under the terms of this version of the License, the
notice described in Exhibit B of this License must be attached.

Exhibit A - Source Code Form License Notice
-------------------------------------------

This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.

If it is not possible or desirable to put the notice in a particular
file, then You may include the notice in a location (such as a LICENSE
file in a relevant directory) where a recipient would be likely to look
for such a notice.

You may add additional accurate notices of copyright ownership.

Exhibit B - "Incompatible With Secondary Licenses" Notice
---------------------------------------------------------

This Source Code Form is "Incompatible With Secondary Licenses", as
defined by the Mozilla Public License, v. 2.0.
```

## Additional notes

- MPL-2.0 licensed components (HashiCorp Go modules, Rust crates) are used
  unmodified; their source code is available from their upstream repositories,
  <https://pkg.go.dev>, and <https://crates.io>.
- OpenTofu (MPL-2.0) is not distributed with CloudSprocket; the application
  downloads official releases from upstream at the user's request.
- AWS, Amazon Web Services, Microsoft, Azure, Google Cloud, and related logos
  are trademarks of their respective owners, used solely to identify the
  corresponding services. No endorsement is implied.
