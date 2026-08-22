# Agent ingest protocol

`POST /api/agent/ingest` with a project API key.

Body (JSON):

- `hostId` — caller-chosen host label. Stored as `{projectId}:{hostId}` so one tenant cannot overwrite another host.
- `hostStats` — cpu, memory, disk, load, network
- `containers` — optional container snapshots
- `gpu` — optional GPU snapshots
- `hostInfo` — optional OS/kernel/cpu

Rate limit: 60 requests/minute per namespaced host id.

The published CLI is `hiai-observe-agent` (`@hiai-gg/hiai-observe`). Set `OBSERVE_URL` and `API_KEY` / `HIAI_OBSERVE_API_KEY`.
