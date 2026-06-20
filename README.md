# Montra ExpenseTracker

Montra is a React Native app (Expo Router) for personal finance tracking with AI-assisted insights, savings goals, product discovery, and stock watchlist features.

## What this app includes

- Email/password authentication with Firebase Auth
- Wallet management (create, edit, delete with image upload)
- Income and expense transactions
- Dashboard with balance, budget progress, and recent activity
- Statistics screen with pie, bar, and trend charts
- Savings goals (sinking funds) with allocation flow
- AI assistant for budgeting help and voice/text chat
- Market discovery screen with affordability filtering and price history
- Investment watchlist and trade logging with live quote data

## Tech stack

- Expo SDK 54 + React Native 0.81
- Expo Router (file-based navigation)
- Firebase (Auth, Firestore, Storage)
- Groq API (chat, receipt parsing, voice transcription)
- Alpha Vantage API (stock quotes and daily series)
- react-native-gifted-charts (statistics + investment charts)

## Project structure (high level)

- app/(auth): login/register/welcome screens
- app/(tabs): core app tabs (home, wallet, market, invest, assistant, goals, statistics, profile)
- app/(modals): reusable modal flows (add transaction/wallet, settings, history, etc.)
- services: AI and stock API integrations
- config: Firebase and AI client configuration
- components: shared UI components
- hooks: custom hooks for product discovery, debouncing, price history, and theming
- scripts: market scraping and goal checker scripts used by automation

## Prerequisites

- Node.js 18+
- npm
- Expo CLI (via npx is fine)
- Firebase project with Auth + Firestore enabled

## Environment variables

Copy .env.example to .env and fill in real values:

EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_APP_ID
EXPO_PUBLIC_GROQ_API_KEY
EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY

Notes:

- EXPO*PUBLIC*\* values are bundled for client use. Do not store admin secrets in this app.
- Keep .env untracked.

## Setup and run

1. Install dependencies

   npm install

2. Start Expo

   npm run start

3. Run on a target platform

   npm run android
   npm run ios
   npm run web

## Available scripts

- npm run start: start Expo dev server
- npm run android: start Expo for Android
- npm run ios: start Expo for iOS
- npm run web: start Expo for web
- npm run lint: run Expo lint

## Optional automation (Docker + n8n)

This repo also includes Docker setup for an n8n-based automation service that can run scripts in scripts/ such as:

- scrape_market.js
- goal_checker.js

To run it:

1. Ensure the Firebase Admin service account JSON file exists at the path referenced in docker-compose.yml.
2. Start containers:

   docker compose up --build

3. Open n8n at http://localhost:5678 and configure workflows.

## Firebase collections used

Common collections used by the app include:

- users
- wallets
- transactions
- savings_goals
- market_products
- product_price_history
- stock_watchlist
- stock_trades

## Notes for contributors

- Routing is file-based via Expo Router under app/.
- Most screens assume authenticated user context from contexts/authContext.jsx.
- If data is not loading, check Firestore security rules and required indexes.
