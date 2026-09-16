# CI/CD and next steps

1. CI: run Python tests, frontend lint/typecheck/build, and the headless browser smoke with an isolated temporary DB. Cache dependencies by lockfile; retain test logs and screenshots. No device or paid API credentials in pull-request jobs.
2. Integration CI: run pinned Mosquitto with topic ACL tests and serial fixture transport; compile USB and Wi-Fi firmware with pinned board core/library versions. Keep real hardware acceptance a separate manual job.
3. Artifacts: publish frontend `dist/`, backend source plus Python lockfile, firmware binaries only after successful compile, schema version, test report and source revision. Add image digests and dependency/license scanning.
4. Release: SQLite backup/restore rehearsal and schema migration framework before modifying existing schemas; tag a demonstrated revision. Later deploy only with explicit authorization, authentication, TLS, origin/host configuration and tested secrets management.
5. Hardware: identify breakout module; validate supply/output/wiring; measure ADC reference; verify boot/reconnect and direct MQTT operation. Add valid calibration metadata/conversion only after collecting calibration evidence.
6. Platform: selectable overview source preferences, full localization catalog, multi-device projects, field type/range editor, sampling configuration acknowledgement from firmware, paging/retention/exports, explicit recording capture boundaries, replay speed/stop controls, better per-field freshness and backend subscription fanout.
7. Agent: real-account provider test; adversarial/evidence eval set; rate limiting and cost controls; event-triggered analysis if useful. Review provider data handling before sending sensitive project data.
8. Optional: independently validated behavioral model, trained/evaluated Isolation Forest adapter, additional connectors. No predictive or physical-control claims until supported capabilities exist.
