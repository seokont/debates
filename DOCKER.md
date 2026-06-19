# Deploy With Docker

This project is a NestJS backend with PostgreSQL, Redis and Prisma. The Docker
stack is defined in `docker-compose.yml`.

## 1. Prepare The Server

Use a Linux VPS, for example Ubuntu 22.04/24.04.

Connect to the server:

```bash
ssh root@YOUR_SERVER_IP
```

Install Docker and the Compose plugin:

```bash
apt update
apt install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Check that Docker works:

```bash
docker --version
docker compose version
```

## 2. Copy The Project

Clone the repository on the server:

```bash
mkdir -p /opt/apps
cd /opt/apps
git clone YOUR_REPOSITORY_URL ppp-backend
cd ppp-backend
```

If the repository is private, add an SSH key to the server first or deploy via
your CI/CD system.

## 3. Configure Environment Variables

Create `.env` from the example:

```bash
cp .env.example .env
nano .env
```

For production, change at least these values:

```env
POSTGRES_USER="ppp"
POSTGRES_PASSWORD="CHANGE_TO_LONG_RANDOM_PASSWORD"
POSTGRES_DB="ppp"
POSTGRES_PORT=5432

JWT_ACCESS_SECRET="CHANGE_TO_LONG_RANDOM_SECRET"
JWT_REFRESH_SECRET="CHANGE_TO_LONG_RANDOM_SECRET"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

REDIS_PORT=6379
PORT=3000

# AI Provider Keys
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
GEMINI_API_KEY="AIza..."
XAI_API_KEY="xnd_..."
```

You can generate secrets with:

```bash
openssl rand -base64 48
```

Important: inside Docker Compose the API uses Postgres through the internal
host name `postgres` and Redis through `redis`. The `docker-compose.yml` already
sets these values for the API container.

## 4. Start The App

Build and start all services:

```bash
docker compose up -d --build
```

The stack starts:

- `api` on `http://SERVER_IP:3000`
- `postgres` with a persistent `postgres_data` volume
- `redis` with a persistent `redis_data` volume

The API container runs:

```bash
npx prisma migrate deploy
```

before starting the app. It also waits for `DATABASE_URL` to become reachable
before running migrations. To skip migrations, set this in `.env`:

```env
RUN_MIGRATIONS=false
```

If Postgres starts slowly on your server, you can increase the wait loop:

```env
DATABASE_WAIT_ATTEMPTS=60
DATABASE_WAIT_INTERVAL_SECONDS=2
```

## 5. Check The Deployment

Show running containers:

```bash
docker compose ps
```

Show API logs:

```bash
docker compose logs -f api
```

Open Swagger:

```text
http://SERVER_IP:3000/docs
```

## 6. Firewall

For a simple API deployment without Nginx, open only the API port:

```bash
ufw allow OpenSSH
ufw allow 3000/tcp
ufw enable
```

Do not expose Postgres `5432` or Redis `6379` to the public internet. If you do
not need to connect to them from outside the server, remove their `ports`
sections from `docker-compose.yml` or bind them to localhost:

```yaml
ports:
  - "127.0.0.1:${POSTGRES_PORT:-5432}:5432"
```

and:

```yaml
ports:
  - "127.0.0.1:${REDIS_PORT:-6379}:6379"
```

## 7. Optional: Domain And HTTPS With Nginx

Point your domain DNS `A` record to the server IP.

Install Nginx and Certbot:

```bash
apt install -y nginx certbot python3-certbot-nginx
```

Create an Nginx config:

```bash
nano /etc/nginx/sites-available/ppp-backend
```

Example config:

```nginx
server {
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it:

```bash
ln -s /etc/nginx/sites-available/ppp-backend /etc/nginx/sites-enabled/ppp-backend
nginx -t
systemctl reload nginx
```

Issue an HTTPS certificate:

```bash
certbot --nginx -d api.example.com
```

Then keep only SSH, HTTP and HTTPS open:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw delete allow 3000/tcp
```

The API will be available at:

```text
https://api.example.com/docs
```

## 8. Update The App

When you push new code, update the server:

```bash
cd /opt/apps/ppp-backend
git pull
docker compose up -d --build
docker compose logs -f api
```

## 9. Back Up The Database

Create a backup:

```bash
docker compose exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
```

Restore from a backup:

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB" < backup.sql
```

## 10. Useful Commands

Stop containers:

```bash
docker compose down
```

Restart containers:

```bash
docker compose restart
```

Rebuild from scratch:

```bash
docker compose up -d --build --force-recreate
```

Remove containers and volumes, including database and Redis data:

```bash
docker compose down -v
```

Use this command carefully because it deletes the local database volume.
