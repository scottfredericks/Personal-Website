# Scott Fredericks Personal Website

This is a personal static website built using [Lume](https://lume.land/) and hosted using [GitHub Pages](https://docs.github.com/en/pages).

See the live site at [https://scottfredericks.com/](https://scottfredericks.com/).

Blog articles on the live website give more information about the development process.

- [Building a Personal Website - Part 1: Using Lume](https://scottfredericks.com/blog/personal-website-part-1/)

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

Hosting is provided through GitHub Pages. Deployment is handled by GitHub actions.

The `.github/workflows/deploy.yml` file defines an action to be run when merging into the `master` branch. This builds to a temporary `_site` folder using `deno task build`, then uploads the folder to host on GitHub Pages.

See [https://lume.land/docs/advanced/deployment/](https://lume.land/docs/advanced/deployment/) for details on alternative deployment methods.

## Licenses

Copyright Scott Fredericks 2026.

The source code for this website is provided under the
[MIT license](https://opensource.org/license/mit).

The [Lato font](https://fonts.google.com/specimen/Lato) was designed by Łukasz
Dziedzic and is provided under the
[SIL Open Font License, Version 1.1](https://openfontlicense.org/open-font-license-official-text/).
