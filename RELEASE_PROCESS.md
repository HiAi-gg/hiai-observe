# Release Process

Operational checklist for cutting a release of HiAi Observe.

## 1. Pre-release (local)

- [ ] All work for the release is merged to `master`
- [ ] `bun run typecheck` passes (0 errors)
- [ ] `bun run test` passes (243+ tests)
- [ ] `CHANGELOG.md` has an entry for the new version
- [ ] `package.json` version is bumped (`X.Y.Z`)
- [ ] No uncommitted changes: `git status` is clean

## 2. Cut the release (local + push)

```bash
git checkout master
git pull --rebase origin master
git add -A
git commit -m "release(observe): vX.Y.Z — <one-line summary>"
git tag -a vX.Y.Z -m "vX.Y.Z — <one-line summary>"
git push origin master
git push origin vX.Y.Z
```

## 3. GitHub release

Either use the CLI:

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z — <title>" \
  --notes-file .github/notes/vX.Y.Z.md
```

Or use the GitHub web UI: <https://github.com/HiAi-gg/hiai-observe/releases/new>

## 4. Automated CI publishes

Two workflows run automatically on the `v*` tag push:

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/publish.yml` | tag `v*` | Publishes 4 npm packages with provenance |
| `.github/workflows/docker.yml` | tag `v*` | Builds and pushes multi-arch Docker image to `hiai-observe/hiai-observe` on Docker Hub |

Required secrets (set in repo Settings → Secrets and variables → Actions):

- `NPM_TOKEN` — npm automation token, scope `@hiai-observe`
- `DOCKERHUB_USERNAME` — Docker Hub account that owns the `hiai-observe` org
- `DOCKERHUB_TOKEN` — Docker Hub access token

## 5. Manual post-release tasks

### Docker Hub

- [ ] Confirm the new tag is on <https://hub.docker.com/r/hiai-observe/hiai-observe/tags>
- [ ] Mark the tag as "latest" if it is the newest stable release
- [ ] Add a short description to the Docker Hub repo (matches GitHub repo description)

### npm

- [ ] Confirm `@hiai-gg/hiai-observe` appears at <https://www.npmjs.com/package/@hiai-gg/hiai-observe> (single package: SDK + `hiai-observe` CLI + `hiai-observe-mcp` MCP + `./mastra` exporter)
- [ ] Verify the package README renders correctly on npmjs.com
- [ ] Confirm 2FA is enabled on the `hiai-gg` npm org

### Documentation & community

- [ ] Announce on Mastodon / X / relevant subreddits
- [ ] Submit a PR to **awesome-selfhosted** (<https://github.com/awesome-selfhosted/awesome-selfhosted>) — entry under "Analytics, Events and Metrics" or "Monitoring"
- [ ] Submit a PR to **awesome-observability** if it exists
- [ ] Submit a PR to **awesome-bun** under "Frameworks / Monitoring"
- [ ] Update the GitHub repo "About" sidebar (already done for v0.1.6: 20 topics + description)
- [ ] Update any external sites (HiAiKit, HiAi OS docs) that link to the release

### Social

- [ ] Optional: post a short demo GIF to X / Mastodon
- [ ] Optional: write a short blog post on <https://github.com/HiAi-gg/hiai-observe/discussions>

## 6. Hotfix flow

If a critical bug is found after release:

1. Branch from the release tag: `git checkout -b hotfix/vX.Y.Z+1 vX.Y.Z`
2. Fix the bug, add a regression test
3. Update `CHANGELOG.md` with `[X.Y.Z+1]` and a `### Fixed` section
4. Bump `package.json` to `X.Y.Z+1`
5. Open a PR titled `hotfix(observe): vX.Y.Z+1 — <bug>`
6. After merge, follow the same tag + release flow above

## 7. Internal services (optional)

After a release, restart any internal instances that pin to a specific version:

```bash
ssh observe@<host> 'cd hiai-observe && docker compose pull && docker compose up -d'
```

Health check:

```bash
curl -fsS http://<host>:8001/health
```

## 8. Archive the work

After successful release, archive the released plan:

```bash
mv .bob/plans/<plan-name>.md .bob/plans/archive/vX.Y.Z-<plan-name>.md
```

This keeps `.bob/plans/` clean and provides historical context.
