# inspectos

This project was built with [Lovable](https://lovable.dev).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Deploy to Hostinger Node.js

Use this project as a Node.js application (not static hosting).

1. In Hostinger hPanel, create or open your Node.js app.
2. Set Node.js version to 20+.
3. Upload or pull this repository in the app directory.
4. Install dependencies.
5. Build with Node preset.
6. Start the Nitro server entry.

Recommended commands:

- Install: npm ci
- Build: npm run build:node
- Start: npm run start:node

Required environment variables in Hostinger:

- SUPABASE_URL
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

If you run server-admin paths (staff invite, service-role operations), also set one of:

- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_SECRET_KEY

Notes:

- The Node server entry is .output/server/index.mjs.
- If your app is behind Hostinger proxy, keep X-Forwarded-For headers enabled.
