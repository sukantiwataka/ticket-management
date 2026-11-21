# Orbit Support

An AI-assisted customer support portal built with Spring Boot, React, Tailwind CSS, and MySQL.

## What is implemented

- Google OpenID Connect sign-in; verified Google accounts are provisioned as customers.
- Server-side `CUSTOMER`, `AGENT`, and `ADMIN` authorization.
- Customer profile APIs, with staff-only customer directory and admin-only role management.
- Ticket creation, category-specific transactional ticket IDs, customer ownership checks, persistent customer/staff conversations, staff status changes, and agent ticket claiming.
- Public FAQ search and an FAQ assistant. Configure a Gemini API key to use grounded AI answers; without a key, the assistant returns matching FAQ content.
- React dashboard for tickets, profiles, FAQ search, and the support assistant.
- Local MySQL via Docker Compose and an H2-based backend test profile.

## Start locally

### Requirements

- Java 21
- Docker Desktop (or a local MySQL 8 instance)
- Node.js 20+
- Google OAuth client credentials

### 1. Start MySQL

From the project directory:

```powershell
docker compose up -d mysql
```

The compose file uses local development credentials (`ticket_user` / `ticket_password`). Do not reuse these values outside local development.

### 2. Configure Google sign-in

Create a Google OAuth 2.0 Web application client in Google Cloud Console. Add this authorized redirect URI:

```text
http://localhost:8080/login/oauth2/code/google
```

Set the client ID and secret in the terminal where you will run the backend. The example defaults let the application start but cannot complete Google sign-in.

```powershell
$env:GOOGLE_CLIENT_ID = "your-google-client-id"
$env:GOOGLE_CLIENT_SECRET = "your-google-client-secret"
$env:ADMIN_EMAILS = "admin@example.com"
# Optional; leave unset to use FAQ-matching answers without Gemini.
$env:GEMINI_API_KEY = "your-gemini-api-key"
$env:GEMINI_MODEL = "gemini-2.5-flash"
```

Emails listed in `ADMIN_EMAILS` receive the admin role at sign-in. Admins can promote signed-in users to `AGENT` or `CUSTOMER` through the role API. Never put real keys in source files or commit them.
For HTTPS deployments, set `SESSION_COOKIE_SECURE=true`; role changes take effect for the target user after their next sign-in.

### 3. Run the backend

In the project root:

```powershell
.\mvnw.cmd spring-boot:run
```

The API listens on `http://localhost:8080`. Override database details with `DB_URL`, `DB_USER`, and `DB_PASSWORD`. The schema is created/updated by Hibernate for this starter; use managed migrations before production deployment.

### 4. Run the frontend

In another terminal:

```powershell
Set-Location .\frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). To point to another API origin, copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_URL`.

## API outline

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/auth/csrf` | Public | Obtain the CSRF token for browser requests |
| `GET` | `/api/auth/me` | Signed in | Current user profile |
| `POST` | `/api/auth/logout` | Signed in | End the session (send CSRF token) |
| `GET`, `PATCH` | `/api/customers/me` | Signed in | View or update own customer profile |
| `GET` | `/api/customers` | Agent/Admin | List customers |
| `GET` | `/api/customers/{email}` | Agent/Admin | Read a customer |
| `PATCH` | `/api/customers/{email}/role` | Admin | Set `CUSTOMER`, `AGENT`, or `ADMIN` |
| `GET`, `POST` | `/api/tickets` | Signed in / Customer | List visible tickets or create a ticket |
| `GET` | `/api/tickets/{id}` | Owner, assigned Agent, Admin | Read ticket details |
| `GET`, `POST` | `/api/tickets/{id}/messages` | Owner, assigned Agent, Admin | Read the conversation or reply |
| `PATCH` | `/api/tickets/{id}/status` | Agent/Admin | Change ticket status |
| `POST` | `/api/tickets/{id}/assign` | Agent/Admin | Claim or assign an unassigned ticket |
| `GET` | `/api/faqs?q=...` | Public | Search FAQ articles |
| `POST` | `/api/faqs/ask` | Public | Ask the FAQ assistant |
| `POST`, `PUT`, `DELETE` | `/api/faqs[/{id}]` | Admin | Manage FAQs |

Ticket categories are `BILLING`, `TECHNICAL`, `ACCOUNT`, and `GENERAL`; their public ID prefixes are `BILL`, `TECH`, `ACCT`, and `GEN`. Counters are locked per category in a database transaction to avoid duplicate IDs during concurrent creation.

Customers create and follow their own requests from **My tickets**. Admins see every request in **Support inbox**; agents see unassigned and their own assigned tickets. Agents must claim a ticket before replying. Customers and staff share the ticket conversation, and customer replies reopen resolved or closed tickets. Staff inboxes refresh automatically while open.

## Validate

Backend tests use an in-memory H2 database:

```powershell
.\mvnw.cmd test
```

Build the frontend:

```powershell
Set-Location .\frontend
npm run build
```

## Good next modules

Email/in-app notifications, SLA and escalation rules, attachments, ticket conversations, audit history, and analytics are good next additions. For production, also add database migrations, rate limiting, structured audit events, and deployment-specific secret management.
