const BASE_URL = "https://www.alphavantage.co/query";
const API_KEY = process.env.EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY;

type Quote = {
  symbol: string;
  price: number;
  change: number;
  changePercent: string;
};

type DailyPoint = {
  date: string;
  close: number;
};

const ensureApiKey = () => {
  if (!API_KEY) {
    throw new Error(
      "Missing EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY in environment.",
    );
  }
};

const readAsNumber = (value: string | undefined) => {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const getStockQuote = async (symbol: string): Promise<Quote> => {
  ensureApiKey();
  const clean = symbol.trim().toUpperCase();

  const response = await fetch(
    `${BASE_URL}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(clean)}&apikey=${API_KEY}`,
  );
  const data = await response.json();
  const quote = data?.["Global Quote"];

  if (!quote || !quote["01. symbol"]) {
    const providerMessage =
      data?.Note ||
      data?.Information ||
      data?.["Error Message"] ||
      "No quote returned for symbol.";
    throw new Error(providerMessage);
  }

  return {
    symbol: quote["01. symbol"],
    price: readAsNumber(quote["05. price"]),
    change: readAsNumber(quote["09. change"]),
    changePercent: quote["10. change percent"] || "0%",
  };
};

export const getStockDailySeries = async (
  symbol: string,
  days: number = 14,
): Promise<DailyPoint[]> => {
  ensureApiKey();
  const clean = symbol.trim().toUpperCase();

  const response = await fetch(
    `${BASE_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(clean)}&outputsize=compact&apikey=${API_KEY}`,
  );
  const data = await response.json();
  const series = data?.["Time Series (Daily)"];

  if (!series) {
    const providerMessage =
      data?.Note ||
      data?.Information ||
      data?.["Error Message"] ||
      "No daily series returned for symbol.";
    throw new Error(providerMessage);
  }

  return Object.entries(series)
    .slice(0, days)
    .map(([date, point]: [string, any]) => ({
      date,
      close: readAsNumber(point?.["4. close"]),
    }))
    .reverse();
};
