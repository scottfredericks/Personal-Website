# Scott Fredericks Personal Website

This is a personal static website generated using [Lume](https://lume.land/).

Blog articles on the live website give more information about its creation.

## Prerequisites

- [Deno](https://docs.deno.com/runtime/getting_started/installation/)
- [Lume](https://lume.land/docs/overview/installation/)
- [Lume CLI](https://lume.land/docs/overview/command-line/) (optional)

## Dev and Deployment

### Linting and Formatting

Use `deno lint` and then `deno fmt`.

Settings are in `deno.json`.

<details>

<summary>Optional pre-commit hook</summary>

<!-- deno-fmt-ignore-start -->
```bash
#!/bin/sh

echo "Deno git hook running..."

deno fmt --quiet

if ! git diff --quiet; then
    echo "FAILED - FORMATTING APPLIED"
    echo "   Deno formatted some files. Please review the changes,"
    echo "   run 'git add', and commit again."
    exit 1
fi

if ! deno lint --quiet; then
    echo "FAILED - LINTING FAILED"
    echo "   Please fix the logic errors above."
    exit 1
fi

exit 0
```

<!-- deno-fmt-ignore-end -->

then run:

```shell
chmod +x .git/hooks/pre-commit
```

</details>

### Local Dev Deployment

After installing the prerequisites, run:

```shell
lume -s -w
```

This updates the site in the browser automatically on file change.

### Public Deployment

TODO

## Licenses

Copyright Scott Fredericks 2026.

The source code for this website is provided under the
[MIT license](https://opensource.org/license/mit).

The [Lato font](https://fonts.google.com/specimen/Lato) was designed by Łukasz
Dziedzic and is provided under the
[SIL Open Font License, Version 1.1](https://openfontlicense.org/open-font-license-official-text/).
