# Authentication configuration

Authentication uses opaque MongoDB-backed sessions. A 32-byte random token is
sent only in the `it_help_desk_session` HttpOnly cookie. MongoDB stores only its
SHA-256 digest. Authentication responses and session listings never include the
raw token or its digest.

## Environment

Copy the `AUTH_*` settings from `.env.example` into the private `.env` file and
replace `AUTH_CSRF_SECRET` with at least 32 random characters. In production,
`AUTH_COOKIE_SECURE=true` and a non-placeholder `AUTH_CSRF_SECRET` are required.
`AUTH_ALLOWED_ORIGINS` is a comma-separated allowlist of exact origins; paths
and wildcard origins are not accepted.

For local HTTP development, explicitly use:

```dotenv
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAME_SITE=lax
```

Do not use that cookie configuration in production.

## CSRF flow

Successful `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, and
`POST /api/v1/auth/change-password` responses include a `csrfToken` value. The
client keeps the session cookie through the browser cookie jar and sends the
CSRF value in the `X-CSRF-Token` header for authenticated `POST` and `DELETE`
requests. The CSRF value is bound to the current session and changes when a new
session is issued. It is not an authentication token and must not be stored in
localStorage.

## Password policy

New passwords must contain 12 through 128 Unicode characters and may contain at
most 1024 UTF-8 bytes. Passphrases are supported; composition rules are not
imposed. Reusing the current password is rejected. Passwords are stored as
Argon2id hashes using Node.js 24's built-in cryptography implementation.

## MongoDB transaction prerequisite

Password change updates the password, increments `sessionVersion`, revokes old
sessions, and creates the replacement session in one MongoDB transaction.
Transactions require a replica set or `mongos`. On a standalone MongoDB server,
the endpoint returns `503 TRANSACTIONS_UNAVAILABLE` without applying a partial
password change.

For a local single-node MongoDB installation, back up the database, add the
following to the MongoDB server configuration, restart MongoDB, and initialize
the replica set once:

```yaml
replication:
  replSetName: rs0
```

```powershell
Restart-Service MongoDB
mongosh --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]})"
```

Then use a replica-set-aware connection string:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/it_help_desk?replicaSet=rs0
```

The in-memory login limiter is suitable for this single-process foundation. A
shared limiter such as Redis is required before running multiple API instances.
