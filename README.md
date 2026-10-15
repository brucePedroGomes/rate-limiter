# Express: Rate Limiter

The task manager API of your company gets too many requests from some clients. Your team decided to limit how often each client can call the API.

Your task has 3 parts:

1. Complete the middleware in `rateLimiter.ts`.
2. Apply the middleware to every route in `app.ts`.
3. In the same middleware, send the rate limit headers.

## The API

The routes are ready in `routes/tasks.ts`. Do not change them.

- `GET /tasks` returns all the tasks. Status `200`.
- `POST /tasks` creates a task. Status `201`.

## Rules

- Identify each client by its IP address: `req.ip`. The app runs behind a load balancer, so `app.ts` turns on `trust proxy`. This way, `req.ip` comes from the `X-Forwarded-For` header.
- Each client can make at most `10` requests in any window of `60000` ms (60 seconds). All routes and all HTTP methods share the same limit.
- When a request arrives, count the requests of this client that were accepted less than `60000` ms ago:
  - If the count is less than `10`, accept the request: save its time and call `next()`.
  - Otherwise, reject the request. The response is status `429` with the JSON body `{ "error": "Too many requests" }`. Do not call `next()`.
- A rejected request does not count in the limit.
- Each client has its own limit.
- Use `Date.now()` to read the current time. The tests control the clock through `Date.now()`.

## Example

Requests from one client (`X-Forwarded-For: 10.0.0.1`):

| Time (ms) | Requests | Responses |
| --- | --- | --- |
| `0` | 4 | `200` four times |
| `30000` | 7 | `200` six times, then `429` |
| `59999` | 1 | `429`: 10 accepted requests are less than `60000` ms old |
| `60000` | 5 | `200` four times, then `429`: the 4 requests from time `0` left the window |

A rejected request:

```text
Status code: 429
Body: { "error": "Too many requests" }
```

## Rate limit headers

In this section, "the window" means the accepted requests of the client that are less than `60000` ms old. When the current request is accepted, it is in the window too.

Send these headers in every response, accepted or rejected:

- `X-RateLimit-Limit`: the limit, `10`.
- `X-RateLimit-Remaining`: how many more requests the client can make now: `10` minus the number of requests in the window. In a `429` response, it is `0`.
- `X-RateLimit-Reset`: when the oldest request in the window leaves it. Use Unix time in seconds, rounded up.

Only in a `429` response, also send:

- `Retry-After`: the number of seconds until the oldest request in the window leaves it, rounded up.

Headers for the requests in the example above. `T` is the Unix time in seconds at time `0`. `X-RateLimit-Limit` is always `10`.

| Time (ms) | Status | `X-RateLimit-Remaining` | `X-RateLimit-Reset` | `Retry-After` |
| --- | --- | --- | --- | --- |
| `0` | `200` (4 times) | `9`, `8`, `7`, `6` | `T + 60` | not sent |
| `30000` | `200` (6 times) | `5`, `4`, `3`, `2`, `1`, `0` | `T + 60` | not sent |
| `30000` | `429` | `0` | `T + 60` | `30` |
| `59999` | `429` | `0` | `T + 60` | `1` (0.001 s, rounded up) |
| `60000` | `200` (4 times) | `3`, `2`, `1`, `0` | `T + 90` | not sent |
| `60000` | `429` | `0` | `T + 90` | `30` |

## Project Specifications

**Read-only paths** (do not change these):

- `test`
- `bin`
- `routes`
- `tasks.json`

**Commands**

- install: `npm install`
- run: `npm start` (http://localhost:8000)
- test: `npm test` or `npm run tests`
