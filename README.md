# TimeGPT Forecast Studio

A Vercel-ready Next.js app for CSV-based forecasting with Nixtla TimeGPT. Users can upload a CSV, the app profiles the columns automatically, keeps the first column as the time axis, lets the user choose a numeric target variable, and renders a modern forecast chart with prediction intervals.

## Features

- CSV upload with drag-and-drop.
- Automatic schema analysis and column profiling.
- First CSV column treated as the time series index by default.
- Numeric column detection for forecast target selection.
- Time-series validation for invalid dates, duplicates, missing values, and irregular spacing.
- Forecast requests fixed to `timegpt-1-long-horizon`.
- Interactive plot with historical values, forecasted values, and 80% / 95% intervals.
- Vercel-friendly proxy fallback for deployments where the frontend is served over HTTPS and the model endpoint is plain HTTP.

## Environment Variables

Create a local `.env.local` from `.env.example`.

```bash
NEXT_PUBLIC_TIMEGPT_BASE_URL=http://13.126.109.148:32768
TIMEGPT_BASE_URL=http://13.126.109.148:32768
NEXT_PUBLIC_TIMEGPT_API_KEY=
TIMEGPT_API_KEY=
```

### Notes

- `NEXT_PUBLIC_TIMEGPT_BASE_URL` is used by the browser for direct local calls.
- `TIMEGPT_BASE_URL` is used by the server-side `/api/forecast` fallback.
- If your endpoint requires authentication, prefer `TIMEGPT_API_KEY` for Vercel deployments so the key stays server-side.

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment on Vercel

1. Import the project into Vercel.
2. Add `TIMEGPT_BASE_URL=http://13.126.109.148:32768` in the project environment variables.
3. If needed, also add `TIMEGPT_API_KEY`.
4. Deploy.

### Important deployment detail

An HTTPS Vercel app cannot fetch a plain `http://...` endpoint directly from the browser because of mixed-content restrictions. This project includes a server-side `/api/forecast` fallback so deployed builds can still reach your provided endpoint.

## Forecast API shape

This app calls the TimeGPT forecast endpoint using the REST payload shape documented by Nixtla:

```json
{
  "series": {
    "sizes": [120],
    "y": [/* historical values */]
  },
  "h": 24,
  "freq": "D",
  "model": "timegpt-1-long-horizon",
  "level": [80, 95]
}
```
