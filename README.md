# Scott Fredericks Personal Website

A simple resume/portfolio website using HTML and CSS. The site is hosted using an AWS S3 bucket and uses CloudFront for the domain.

The site is live at [https://www.scottfredericks.com/](https://www.scottfredericks.com)

## Prerequisites

Install [awscli](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).

Run `aws configure` once on each device to set credentials.

## Deployment

Run `./scripts/deploy.sh` to upload all site content to s3 and invalidate the cache.

Add the `-y` flag for automated CI: `./scripts/deploy.sh -y`

Note: Double-check the `--include` and `--exclude` options used by the deployment script when adding new files or folders to the root directory.
