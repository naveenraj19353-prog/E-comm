# API routes

FastAPI route modules in this folder define the backend HTTP API.

When you **add, rename, or remove** a route:

1. Update the matching entry in `client/src/api/endpoints.ts`.
2. Use `API_ENDPOINTS` in the client feature API module (do not hardcode path strings).
3. Run the sync check from `client/`:

   ```bash
   npm run check:api
   ```

The check script lives at `scripts/check-api-endpoints.cjs` and compares registry paths to the routes defined here.
