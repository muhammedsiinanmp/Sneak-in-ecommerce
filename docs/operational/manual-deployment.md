# Manual deployment fallback

**Type:** runbook. **Status:** transitional — this describes the Docker Compose deployment that
exists today, and it is replaced by the per-phase deployment work in §20 Phase 7–8.

The normal path is not this document. A push to `main` runs the CD pipeline in
`.github/workflows/cd.yml`, which performs these steps itself: SSH into EC2, pull, rebuild,
migrate, health-check. Use the manual path only when the pipeline cannot be run.

This lives in `docs/operational/` rather than in the root `README.md` because §2.6 prohibits a
README from documenting a sequence that is not expressed as Make targets, and I §18.9 makes "no
manual steps" an acceptance criterion for the target platform. The sequence is recorded here so
that it is not lost, not because it is the intended interface.

## Steps

```text
ssh -i <your-key>.pem ubuntu@<EC2_HOST>
cd ~/Sneak-in-ecommerce
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Then verify the health check reported by the pipeline, or `GET /api/health/` directly.

## Why this cannot be a Make target yet

`make deploy` in I §18.7 means something different from this: "Push to the local registry, run
migrations, start services" for the local Terraform-managed platform (I §18.5). Reusing the name
for a production SSH fallback would make the target mean two things, and I §18.1's target list is
the one the merge gate and CI compare against (§2.6). A production deploy target belongs with the
platform work in §20 Phase 7, where it can be expressed against the release manifest rather than a
shell sequence.

## Related

- [`../../.github/workflows/cd.yml`](../../.github/workflows/cd.yml) — the automated path
- `INFRASTRUCTURE_ARCHITECTURE.md` I §18.5, I §18.9 — the target deployment interface
- `REPOSITORY_ENGINEERING_STANDARD.md` §2.6, §2.7 — Make targets and `deploy/`
