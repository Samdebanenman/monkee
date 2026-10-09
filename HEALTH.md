# Application health

Monkee extends its existing loopback `GET /health` and Docker `healthcheck.js`.
No port needs to be published. The endpoint uses cached measurements and does
not make external calls or query SQLite on demand. Monitoring timers are
unreferenced, observations retain application return values/exceptions, and
Monkee stores only the latest state per component.

## States and core availability

`operational`: every measured component is within its threshold.
`degraded`: core functionality remains available but a component is slow,
recovering, or failing. `down`: a confirmed critical failure prevents essential
processing. `unknown`: initialization or incomplete/stale monitoring evidence.

Application readiness/event-loop responsiveness, interaction dispatch, and
Discord gateway connectivity are critical. SQLite, game API, Discord REST, and
feature integrations are noncritical: independent commands remain available.
Repeated failures in the essential dispatch path can still make processing Down.
An uncaught fatal process failure is detected by an unanswered local probe;
monitoring does not swallow fatal application errors.

The aggregation order is confirmed critical Down, Unknown evidence, Degraded
components, then Operational. A stale Down measurement is no longer a confirmed
current failure. Discord reconnects are Degraded for the grace period, then Down.
Before the first gateway connection or a valid heartbeat measurement, Discord is
Unknown rather than healthy. A healthy tick does not erase a dispatch failure;
successful interactions must provide recovery evidence.

`coreAvailable` is independently `true`, `false`, or `null` (not established).
Docker exits 0 when core availability is established, including Degraded periods
and an overall Unknown caused solely by optional evidence. It exits 1 for Down
or unknown core liveness. The probe aborts after 3 seconds; Docker retains its
existing 30-second interval, 5-second timeout, startup grace and retries.

## Measurements

- Event-loop timer drift is sampled each second on the same loop as the bot.
- Discord readiness, shard reconnect/resume events and gateway ping are sampled
  locally. REST measurements wrap Discord's supported `makeRequest` transport;
  the default transport is preserved and no synthetic REST calls are added.
  Reconnection attempts are counted. Request-scoped REST errors (such as missing
  messages or channel permissions) do not imply a global Discord transport outage.
- Existing native SQLite statement `get`, `all`, and `run` methods are observed.
  A background read touches `meta` every 30 seconds on the existing connection.
  Its lock timeout is temporarily bounded and restored. Successful reads do not
  erase observed write failures: actual successful writes establish recovery.
  Native SQLite operations cannot be interrupted by a JavaScript Promise timeout.
- Game API measurements cover logical requests across fallback hosts, including
  inventory requests. If idle, `/ei/get_periodicals` is read without writing game
  state or updating caches. Probes run at most once every five minutes, use a
  five-second timeout per host, and back off after failures. Existing command
  requests keep their current timeouts (up to 80 seconds per host). An in-flight
  request crossing the slow threshold is reported as Degraded.
- Planner, Sheets, leaderboard, member API, contract archive and OpenAI are
  observed only when used. Unused/unconfigured feature integrations are not
  registered; registered integrations become Unknown when their observations
  expire. This can make overall health Unknown while core remains available.
  Missing game credentials do not result in synthetic successful measurements.

The initial failure threshold is three; recovery requires two consecutive
responses below the slow threshold. First failures are Degraded. Slow successful
responses retain a successful-request timestamp but do not count as recovery.
Reasons are fixed descriptions or HTTP status codes; no tokens, request URLs,
SQL, database values, player data, or raw error messages enter the health snapshot.

## Configuration

All variables are optional positive numbers, in milliseconds unless stated.

| Variable | Default |
| --- | ---: |
| `HEALTHCHECK_PORT` | 3000 |
| `HEALTH_FAILURE_THRESHOLD` (count) | 3 |
| `HEALTH_RECOVERY_THRESHOLD` (count) | 2 |
| `HEALTH_EVENT_LOOP_SLOW_MS` | 250 |
| `HEALTH_EVENT_LOOP_DOWN_MS` | 5000 |
| `HEALTH_DISCORD_SLOW_MS` | 1000 |
| `HEALTH_DISCORD_GRACE_MS` | 90000 |
| `HEALTH_DISCORD_REST_SLOW_MS` | 2000 |
| `HEALTH_DATABASE_SLOW_MS` | 100 |
| `HEALTH_DATABASE_TIMEOUT_MS` | 250 |
| `HEALTH_GAME_API_SLOW_MS` | 3000 |
| `HEALTH_GAME_API_PROBE_MS` | 300000 |
| `HEALTH_GAME_API_TIMEOUT_MS` | 5000 |
| `HEALTH_GAME_API_STALE_MS` | 900000 |
| `HEALTH_PASSIVE_STALE_MS` | 3600000 |

Local database observations expire after 90 seconds and gateway observations
after 15 seconds. Application and dispatch freshness follows the local timer.
Choose a game freshness limit longer than the probe interval plus both host
timeouts and expected backoff. Background probes never overlap for a component.

## Status Server transport and deployment

`healthcheck.js` prints a single compact `application-health/v1` JSON object.
Docker stores this in the latest inspect health log, even for a nonzero exit.
The existing Status Server proxy parses and filters that object through the
same read-only list/inspect routes. This does not require access to Monkee's
loopback from another container, a shared network, Docker exec, or new mounts.

Snapshots include overall/core state, component states and criticality,
latency, attempt/success times, failure/recovery counts, a source timestamp,
and a 90-second validity. Output is capped at 4,000 bytes (Docker stores 4,096).
An unavailable local endpoint produces a small Down snapshot. Full detail is
available locally; the current component set also fits within the Docker budget.
Polling adds roughly 30–90 seconds of reporting delay at default intervals.

Rebuild Monkee and both Status Server images, preserving existing data volumes
and the Docker monitor targeting `monkee`. No Compose network changes are needed.
Status Server owns history, time-weighted availability, and coverage; restarting
Monkee resets only its current in-memory measurements.

Tests use fake clocks, HTTP servers, mocked API requests and temporary SQLite
connections with controlled locking; they do not depend on external outages.
