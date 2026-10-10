# Application health

The existing loopback `GET /health` server, Docker `healthcheck.js`, bot timers,
Discord client, and SQLite connection provide health measurements independently
of commands, messages, interactions, or dashboard requests. No port is published.

## Active checks and passive observations

Application responsiveness, processing readiness, and Discord connectivity are
critical. Database, game API, and Discord REST are noncritical. Operational means
all active components are healthy. Slow checks and early failures are Degraded;
three consecutive failures establish Down, and two fast successes establish
recovery. Confirmed critical Down overrides Unknown evidence. Unknown means
startup, missing measurements, or stale monitoring, and never means no users.

- Application: sample event-loop timer drift every second.
- Processing: every five seconds, check the registered interaction handler and
  command registry through an asynchronous local probe. No commands are executed.
  Real interaction outcomes are separate passive `interactionDispatch` observations.
- Discord: every second, sample client/shard readiness and the existing gateway
  heartbeat latency. Discord's own heartbeat supplies network liveness evidence.
  Reconnection is Degraded during the 90-second grace period, then Down.
- Database: every 30 seconds, read `meta` on the existing connection with a
  bounded lock timeout. After a write failure, also acquire an immediate write
  reservation without changing rows. Two successful probes can establish write
  recovery without waiting for a user command. The normal lock timeout is restored.
- Discord REST: when ready and idle for five minutes, request authenticated
  `GET /users/@me` through the existing REST client, rate-limit queue, and transport.
  The probe has a five-second abort deadline and never overlaps another REST probe.
- Game API: when idle for five minutes, read `/ei/get_periodicals` with a
  five-second timeout per fallback host, without changing game state or caches.
  Normal requests retain their existing timeouts. Without `EID`, game evidence is
  explicitly passive/unmeasured and does not determine availability.

Feature integrations (planner, Sheets, leaderboard, member API, archive, OpenAI,
and interaction outcomes) are passive. They remain visible, including failures or
expired observations, but do not determine active core/full availability. An
unused feature no longer makes the application Unknown. Processing readiness
does not prove that every command or feature will execute successfully.

## Configuration

All values are positive milliseconds except the failure/recovery counts.

| Component | Probe variable/default | Freshness variable/default | Slow variable/default |
| --- | --- | --- | --- |
| Application | `HEALTH_EVENT_LOOP_PROBE_MS` / 1000 | `HEALTH_EVENT_LOOP_STALE_MS` / 5000 | `HEALTH_EVENT_LOOP_SLOW_MS` / 250 |
| Processing | `HEALTH_PROCESSING_PROBE_MS` / 5000 | `HEALTH_PROCESSING_STALE_MS` / 15000 | `HEALTH_PROCESSING_SLOW_MS` / 250 |
| Discord | `HEALTH_DISCORD_PROBE_MS` / 1000 | `HEALTH_DISCORD_STALE_MS` / 15000 | `HEALTH_DISCORD_SLOW_MS` / 1000 |
| Database | `HEALTH_DATABASE_PROBE_MS` / 30000 | `HEALTH_DATABASE_STALE_MS` / 90000 | `HEALTH_DATABASE_SLOW_MS` / 100 |
| Discord REST | `HEALTH_DISCORD_REST_PROBE_MS` / 300000 | `HEALTH_DISCORD_REST_STALE_MS` / 900000 | `HEALTH_DISCORD_REST_SLOW_MS` / 2000 |
| Game API | `HEALTH_GAME_API_PROBE_MS` / 300000 | `HEALTH_GAME_API_STALE_MS` / 900000 | `HEALTH_GAME_API_SLOW_MS` / 3000 |

Other defaults: `HEALTHCHECK_PORT=3000`, `HEALTH_FAILURE_THRESHOLD=3`,
`HEALTH_RECOVERY_THRESHOLD=2`, `HEALTH_EVENT_LOOP_DOWN_MS=5000`,
`HEALTH_DISCORD_GRACE_MS=90000`, `HEALTH_DATABASE_TIMEOUT_MS=250`,
`HEALTH_DISCORD_REST_TIMEOUT_MS=5000`, `HEALTH_GAME_API_TIMEOUT_MS=5000`, and
`HEALTH_PASSIVE_STALE_MS=3600000`. Local freshness is raised to at least twice
the interval plus the timeout/lag allowance (both host timeouts for game probes).
The default effective application freshness is therefore seven seconds.

## Timestamps and Docker transport

Components distinguish `lastAttempt`, `lastSuccess`, `lastFailure`,
`lastMeasurement`, and `lastStatusChange`, with UTC timezone-qualified times.
Successful slow responses still update success time. Failures preserve the
previous success. Snapshot reads preserve measurement times. The report timestamp
comes from the latest application measurement, not the health HTTP request.

Docker runs its existing check every 30 seconds and retains one compact
`application-health/v1` report, valid for 180 seconds. This includes cached probe
age, Docker's interval, the default 60-second Status Server interval, and scheduling
margin. Component transport freshness allows at least that 180-second window;
shorter local limits are enforced
before publishing. Core availability remains independent of optional evidence.
The command exits 0 for established core liveness, including an Unknown overall
result due solely to an unmeasured active optional dependency; Down/unknown core
or an unanswered endpoint exits 1. Reasons contain no private request data.

The 4000-byte transport budget keeps every component's state, measurement type,
measurement timestamp, and success time. Null optional fields are omitted. If many
features are registered, optional timelines/counters and passive metadata may be
omitted; complete data remains available on the local endpoint.

Rebuild Monkee and both Status Server images, preserving data volumes and monitor
IDs. The updated proxy/parser understands passive observations and component
freshness without changing the contract version. History stays in Status Server;
restarting Monkee resets only its in-memory state. Run `npm test`; tests include
24 simulated idle hours, real temporary SQLite locking/recovery, and Docker
command transport against local HTTP fixtures with no external API calls.
