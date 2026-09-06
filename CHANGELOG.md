# Changelog

All notable changes are documented here. The project follows [Semantic Versioning](https://semver.org/) and the structure of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Automated tests, CI, CodeQL, dependency review, releases, and GHCR publication.
- English, German, and Russian project documentation.
- Community health, contribution, support, and security files.
- Parent-account student discovery with an explicit child-selection override.
- Custom Google Calendar title templates, per-subject emoji mappings, optional cancelled-title strikethrough, and support for included cancelled and replacement-event lessons.

### Changed

- Runtime and CI now use the latest Node.js 24 LTS line.
- Raw Schulmanager response objects are removed before timetable snapshots are persisted.
- Health responses no longer contain the Google Calendar ID.
- Container defaults now use a read-only filesystem, no Linux capabilities, and an integrated health check.

### Fixed

- Managed Google Calendar events deleted outside the service are restored from Google's cancelled tombstones instead of aborting synchronization with HTTP 409.

## [0.1.0] - 2026-07-11

### Added

- Initial self-hosted Schulmanager-to-Google-Calendar synchronization service.
