# DNS change monitoring — developer field guide

Live resource: https://dns-change-monitoring.github.io/

Published by [DNS Notify](https://dnsnotify.com/about/). A practical reference for developers who need to monitor DNS changes and investigate DNS change alerts.

## Developer resources

- [DNS change monitoring overview](https://dns-change-monitoring.github.io/): baseline-to-alert workflow and DNS Notify product details.
- [How to monitor DNS changes](https://dns-change-monitoring.github.io/how-to-monitor-dns-changes/): authoritative lookups, polling design and baseline review.
- [DNS change alerts](https://dns-change-monitoring.github.io/dns-change-alerts/): worked alert, triage and incident response.
- [Compare DNS records](https://dns-change-monitoring.github.io/compare-dns-records/): browser-local comparison tool and record examples.
- [DNS monitoring false positives](https://dns-change-monitoring.github.io/dns-monitoring-false-positives/): type-specific comparison rules and failure handling.

The resource set is published by [DNS Notify](https://dnsnotify.com/dns-change-monitoring/), the hosted service for ongoing DNS change monitoring. The educational site remains usable without a product account.

## Included

- Browser-local record-value comparison, with no uploads, APIs or persistence.
- Authoritative lookup commands using dig.
- Baseline, failure-handling and incident-response checklists.
- Clear product affiliation and links to the service's methodology and free tools.

This is a static educational project resource. The paid monitoring application runs separately at dnsnotify.com. This site does not provide account, billing or hosted monitoring functionality.

## Comparison scope

Paste RDATA values for the same name and type, one per line. Line order and duplicate lines are ignored. Case, internal whitespace and trailing dots are preserved. Empty input is rejected to avoid confusing a failed lookup with a deleted record. This is not a complete DNS parser or production monitor.

## Hosting

GitHub Pages, main branch, repository root. No dependencies or build step. Use a local static HTTP server to preview. All main content renders without JavaScript; JavaScript adds only the comparison tool.

## Corrections

Open an issue with the affected section, the observed behaviour and relevant technical evidence. Never include credentials, private zone data or customer details.
