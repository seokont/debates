# Docker

Start the full backend stack:

```bash
docker compose up --build
```

The compose stack runs:

- `api` on `http://localhost:3000`
- `postgres` on `localhost:5432`
- `redis` on `localhost:6379`

The API container runs `prisma migrate deploy` before starting. Set `RUN_MIGRATIONS=false` if you want to skip that step.

Swagger documentation:

```text
http://localhost:3000/docs
```

Stop services:

```bash
docker compose down
```

Remove database and Redis volumes too:

```bash
docker compose down -v
```
