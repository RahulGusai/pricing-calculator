# Railway deployment

This repository deploys as two application services from one Git repository. Railway
Postgres owns canonical users, structured pricing documents, lifecycle state, and
totals; a private S3 bucket stores immutable finalized export artifacts. The browser
talks only to the web origin: Caddy serves the React bundle and proxies `/api/*` to
FastAPI over Railway's private network.

## Project topology

Create an empty Railway project, then add these resources in the same environment:

| Railway resource | Source | Repository root directory | Config-as-code path | Public domain |
| --- | --- | --- | --- | --- |
| `web` | This GitHub repository | `/apps/web` | `/apps/web/railway.json` | Required |
| `api` | This GitHub repository | `/apps/api` | `/apps/api/railway.json` | Recommended for reviewer access; optional otherwise |
| `Postgres` | Railway PostgreSQL | n/a | n/a | No |
| `documents` | AWS S3 or a Railway Storage Bucket | n/a | n/a | No |

Use the service names above if copying the variable references in this guide. Railway references are service-name sensitive.

The Root Directory and config file are separate settings. Railway does not resolve the config-as-code path relative to Root Directory, so enter the absolute repository paths shown above. Connect both application services to the same branch. Each `railway.json` contains repository-root watch patterns so a frontend-only change does not rebuild the API and vice versa.

The web image is built with Node 24 and `npm ci`, then served by Caddy. It does not run Vite's development or preview server in production. Caddy provides SPA fallback routing, an explicit `/health` response, and the private API proxy.

## Service variables

### API

Set these variables on `api`:

```dotenv
APP_ENVIRONMENT=production
PORT=8000
DATABASE_URL=${{Postgres.DATABASE_URL}}
CORS_ALLOWED_ORIGINS=
PRICING_SUPPORTED_CURRENCIES=USD,INR,AED
PRICING_DEFAULT_CURRENCY=USD
SESSION_COOKIE_NAME=pricing_session
SESSION_COOKIE_SECURE=true
SESSION_TTL_HOURS=8
CSRF_SECRET=replace-with-a-unique-high-entropy-secret
ARTIFACT_STORAGE=s3
S3_BUCKET=replace-for-aws
S3_REGION=replace-for-aws
AWS_ACCESS_KEY_ID=replace-for-aws
AWS_SECRET_ACCESS_KEY=replace-for-aws
S3_URL_STYLE=virtual
S3_PRESIGNED_URL_TTL_SECONDS=300
```

`APP_ENVIRONMENT=production` makes FastAPI refuse SQLite, local artifact storage,
an insecure session cookie, or the development CSRF secret at startup. The three
configured currencies are USD, INR, and AED; all use two decimal places. Leave
`CORS_ALLOWED_ORIGINS` empty for the same-origin Caddy topology. `PORT` is deliberately
fixed. The API process binds to it, Railway uses it for health checks and public
routing, and Caddy uses the same port over private networking. `DATABASE_URL`
references the Postgres service's private connection string; do not substitute
`DATABASE_PUBLIC_URL` for service-to-service traffic.

`S3_URL_STYLE` and `S3_PRESIGNED_URL_TTL_SECONDS` are optional. Virtual-hosted addressing is the production default, and five-minute presigned links limit the exposure of private artifacts. Store object keys and metadata in Postgres rather than permanent signed URLs.

Keep `CSRF_SECRET` and storage credentials on `api` only. Never add them to `web`,
prefix them with `VITE_`, or commit them to an environment file. Manually entered AWS
credentials should be sealed in Railway after verification.

### Web

Set this variable on `web`:

```dotenv
API_UPSTREAM=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8000
```

`API_UPSTREAM` is expanded by Caddy at container startup. The `http` scheme is intentional: the connection remains inside Railway's encrypted private network, where Railway's public TLS termination is not involved. Browser code should call relative URLs such as `/api/v1/documents`; it cannot resolve `railway.internal` itself.

This same-origin arrangement avoids CORS configuration and avoids baking an environment-specific API hostname into the Vite bundle.

## Object storage

The API uses one S3-compatible configuration contract for AWS S3, Railway Buckets, and local MinIO.

### AWS S3

For Amazon S3, set:

```dotenv
S3_BUCKET=your-private-bucket
S3_REGION=your-aws-region
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
S3_URL_STYLE=virtual
S3_PRESIGNED_URL_TTL_SECONDS=300
```

Leave `S3_ENDPOINT_URL` unset. Use a private bucket with public access blocked and a least-privilege IAM principal restricted to the required bucket and object prefix. Prefer AWS S3 when the requirement literally names Amazon S3 or needs server-side encryption controls, versioning, lifecycle policies, retention, or object lock.

### Railway Storage Bucket

If S3-compatible storage is acceptable, add a Railway Bucket named `documents` and set these references on `api`:

```dotenv
S3_BUCKET=${{documents.BUCKET}}
S3_REGION=${{documents.REGION}}
S3_ENDPOINT_URL=${{documents.ENDPOINT}}
AWS_ACCESS_KEY_ID=${{documents.ACCESS_KEY_ID}}
AWS_SECRET_ACCESS_KEY=${{documents.SECRET_ACCESS_KEY}}
S3_URL_STYLE=virtual
S3_PRESIGNED_URL_TTL_SECONDS=300
```

Use `documents.BUCKET`, not `documents.RAILWAY_BUCKET_NAME`; the latter is a display name rather than the S3 API bucket name.

Railway Buckets are private and support common S3 operations, presigned URLs, and multipart uploads. At the time this repository was prepared, they did not support S3 server-side encryption options, object versioning, object lock, or lifecycle configuration. Record the chosen provider in the deployment handoff rather than presenting Railway Buckets as Amazon S3. If browser-direct presigned uploads are introduced later, configure a narrow bucket CORS policy for the web origin.

## First deployment

1. Push the repository to GitHub and connect it to the empty Railway project.
2. Provision `Postgres` and, if selected, the `documents` Railway Bucket.
3. Create `api` and `web` as empty services, connect both to the repository, then set their Root Directory and config-as-code paths from the topology table.
4. Add the API variables. For AWS, enter and test the credentials before sealing them. For a Railway Bucket, use the reference variables above.
5. Add `API_UPSTREAM` to `web`.
6. Deploy `api` first. Its pre-deploy command runs Alembic against Postgres before the new API revision starts.
7. Deploy `web`.
8. In each application service's **Settings → Networking**, generate a Railway domain. The web domain is the user-facing URL. The API domain makes `/docs`, `/openapi.json`, and `/health` convenient for evaluation; remove that domain in a private production topology if direct API access is unnecessary.
9. Verify the web `/health`, API `/health`, one browser request under `/api/*`, database persistence across an API redeploy, and an S3 upload/download round trip.

Do not expose Postgres with a TCP proxy for normal application traffic and do not make the document bucket public.

## Migrations and health checks

The API Railway config runs:

```sh
uv run alembic upgrade head
```

as a pre-deploy command. Railway runs it in a separate container with private networking and service variables available. A non-zero exit stops the deployment before traffic moves to the new revision. Keep migrations backward-compatible with the previous application revision and never run development seed data from the production migration command.

Both application services expose unauthenticated, fast health endpoints:

- `web /health` is answered directly by Caddy and does not fall through to `index.html`.
- `api /health` verifies the API is ready to accept traffic. It should not perform slow object-storage operations.

Railway deployment health checks gate traffic cutover; they are not continuous uptime monitoring. Configure an external monitor separately if continuous checks are required.

## Troubleshooting

### Railway ignores `railway.json`

Confirm the service's config-as-code path is `/apps/web/railway.json` or `/apps/api/railway.json`. Root Directory does not change where Railway searches for a custom config file.

### `npm ci` reports an out-of-sync lockfile

Run `npm install` in `apps/web`, review the dependency change, and commit the resulting `package-lock.json`. Do not replace `npm ci` with `npm install` in the production image.

### The web deployment is healthy but `/api/*` returns 502

Check all of the following:

- `API_UPSTREAM` includes `http://`, the exact API service reference, and port `8000`.
- `api` and `web` are in the same Railway project and environment.
- `api` has `PORT=8000` and listens on all interfaces (`::` or `0.0.0.0`), not only localhost.
- The API deployment is active and its own `/health` returns 200.

Do not replace the private hostname with a public domain as a first fix; that adds an unnecessary public network hop.

### Railway reports `service unavailable` during a health check

The application is usually listening on a different port or interface. Confirm Caddy reads Railway's `PORT`, the API reads `PORT=8000`, and each Railway health-check path is exactly `/health`.

### Refreshing a frontend route returns 404

Confirm the web service is using the repository Caddyfile and that the final image contains the Vite output under `/srv`. The `try_files {path} /index.html` fallback is what lets React Router handle deep links.

### The API cannot connect to Postgres

Confirm `DATABASE_URL` is the reference `${{Postgres.DATABASE_URL}}`, the service is named `Postgres`, and the migration container is in the same environment. Inspect pre-deploy logs separately from runtime logs.

### S3 requests fail with a signature or redirect error

Verify the bucket, region, endpoint, URL style, and credentials as one set. Omit `S3_ENDPOINT_URL` for AWS S3. For a Railway Bucket, use its base `ENDPOINT` and API `BUCKET` value with `S3_URL_STYLE=virtual`. A credential from one Railway environment cannot access another environment's bucket instance.

### A document URL returns 403 after several minutes

Presigned URLs expire by design. Request a new URL from the API instead of storing or caching the signed URL as document metadata.

## References

- [Deploying a monorepo on Railway](https://docs.railway.com/guides/deploying-a-monorepo)
- [Railway build configuration and root directories](https://docs.railway.com/builds/build-configuration)
- [Railway config as code](https://docs.railway.com/config-as-code)
- [Railway private networking](https://docs.railway.com/private-networking)
- [Railway SPA routing with Caddy](https://docs.railway.com/guides/spa-routing-configuration)
- [Railway PostgreSQL](https://docs.railway.com/databases/postgresql)
- [Railway Storage Buckets](https://docs.railway.com/storage-buckets)
- [Railway pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command)
- [Railway health checks](https://docs.railway.com/deployments/healthchecks)
- [Vite static deployment](https://vite.dev/guide/static-deploy.html)
