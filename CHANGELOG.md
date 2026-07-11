# Changelog

All notable changes are documented here. The project follows [Semantic Versioning](https://semver.org/) and the structure of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Automated tests, CI, CodeQL, dependency review, releases, and GHCR publication.
- English, German, and Russian project documentation.
- Community health, contribution, support, and security files.

### Changed

- Runtime and CI now use the latest Node.js 24 LTS line.
- Raw Schulmanager response objects are removed before timetable snapshots are persisted.
- Health responses no longer contain the Google Calendar ID.
- Container defaults now use a read-only filesystem, no Linux capabilities, and an integrated health check.

## [0.1.0] - 2026-07-11

### Added

- Initial self-hosted Schulmanager-to-Google-Calendar synchronization service.
