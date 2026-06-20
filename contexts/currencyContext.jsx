import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, updateDoc } from "firebase/firestore";
import { firestore } from "../config/firebase";
import { useAuth } from "./authContext";

export const CURRENCIES = {
  PKR: { symbol: "Rs. ", rate: 1.0, name: "Pakistani Rupee" },
  USD: { symbol: "$", rate: 280.0, name: "US Dollar" },
  EUR: { symbol: "€", rate: 300.0, name: "Euro" },
  GBP: { symbol: "£", rate: 355.0, name: "British Pound" },
  INR: { symbol: "₹", rate: 3.35, name: "Indian Rupee" },
  AED: { symbol: "AED ", rate: 76.2, name: "UAE Dirham" },
  SAR: { symbol: "SAR ", rate: 74.6, name: "Saudi Riyal" },
  CAD: { symbol: "CA$", rate: 204.0, name: "Canadian Dollar" },
  AUD: { symbol: "A$", rate: 186.0, name: "Australian Dollar" },
  CNY: { symbol: "¥", rate: 38.5, name: "Chinese Yuan" },
  JPY: { symbol: "¥", rate: 1.85, name: "Japanese Yen" },
  CHF: { symbol: "CHF ", rate: 320.0, name: "Swiss Franc" },
  SGD: { symbol: "S$", rate: 207.0, name: "Singapore Dollar" },
  NZD: { symbol: "NZ$", rate: 170.0, name: "New Zealand Dollar" },
  HKD: { symbol: "HK$", rate: 35.8, name: "Hong Kong Dollar" },
  KRW: { symbol: "₩", rate: 0.21, name: "South Korean Won" },
  SEK: { symbol: "kr ", rate: 26.5, name: "Swedish Krona" },
  NOK: { symbol: "kr ", rate: 26.0, name: "Norwegian Krone" },
  DKK: { symbol: "kr ", rate: 40.2, name: "Danish Krone" },
  RUB: { symbol: "₽", rate: 3.1, name: "Russian Ruble" },
  ZAR: { symbol: "R ", rate: 14.8, name: "South African Rand" },
  TRY: { symbol: "₺", rate: 8.7, name: "Turkish Lira" },
  BRL: { symbol: "R$", rate: 56.0, name: "Brazilian Real" },
  MXN: { symbol: "$", rate: 16.5, name: "Mexican Peso" },
  IDR: { symbol: "Rp ", rate: 0.018, name: "Indonesian Rupiah" },
  MYR: { symbol: "RM ", rate: 59.0, name: "Malaysian Ringgit" },
  PHP: { symbol: "₱", rate: 5.0, name: "Philippine Peso" },
  THB: { symbol: "฿", rate: 7.7, name: "Thai Baht" },
  VND: { symbol: "₫", rate: 0.011, name: "Vietnamese Dong" },
  EGP: { symbol: "E£", rate: 5.9, name: "Egyptian Pound" },
  NGN: { symbol: "₦", rate: 0.18, name: "Nigerian Naira" },
  KWD: { symbol: "KD ", rate: 910.0, name: "Kuwaiti Dinar" },
  BHD: { symbol: "BD ", rate: 742.0, name: "Bahraini Dinar" },
  OMR: { symbol: "OMR ", rate: 727.0, name: "Omani Rial" },
  QAR: { symbol: "QR ", rate: 76.8, name: "Qatari Riyal" },
  JOD: { symbol: "JD ", rate: 395.0, name: "Jordanian Dinar" },
  ILS: { symbol: "₪", rate: 75.0, name: "Israeli New Shekel" },
  PLN: { symbol: "zł ", rate: 70.0, name: "Polish Zloty" },
  HUF: { symbol: "Ft ", rate: 0.77, name: "Hungarian Forint" },
  CZK: { symbol: "Kč ", rate: 11.9, name: "Czech Koruna" }
};

const CurrencyContext = createContext();

export const CurrencyProvider = ({ children }) => {
  const { user } = useAuth();
  const [selectedCurrency, setSelectedCurrency] = useState("PKR");

  // Load currency preference
  useEffect(() => {
    const loadCurrency = async () => {
      try {
        // First try local storage for fast render
        const cached = await AsyncStorage.getItem("user_currency");
        if (cached && CURRENCIES[cached]) {
          setSelectedCurrency(cached);
        }
        
        // If logged in, check user profile settings
        if (user?.currency && CURRENCIES[user.currency]) {
          setSelectedCurrency(user.currency);
          await AsyncStorage.setItem("user_currency", user.currency);
        }
      } catch (error) {
        console.error("Error loading currency:", error);
      }
    };
    loadCurrency();
  }, [user?.currency, user?.uid]);

  const changeCurrency = async (currencyCode) => {
    if (!CURRENCIES[currencyCode]) return;
    try {
      setSelectedCurrency(currencyCode);
      await AsyncStorage.setItem("user_currency", currencyCode);
      
      if (user?.uid) {
        const userRef = doc(firestore, "users", user.uid);
        await updateDoc(userRef, { currency: currencyCode });
      }
    } catch (error) {
      console.error("Error saving currency setting:", error);
    }
  };

  const getCurrencySymbol = () => {
    return CURRENCIES[selectedCurrency]?.symbol || "Rs. ";
  };

  // Converts PKR (base) to selected currency
  const convertAmount = (amountInPKR, toCurrency = selectedCurrency) => {
    const num = Number(amountInPKR);
    if (isNaN(num)) return 0;
    const rate = CURRENCIES[toCurrency]?.rate || 1.0;
    return num / rate;
  };

  // Converts selected currency to PKR (base)
  const convertAmountToPKR = (amountInTarget, fromCurrency = selectedCurrency) => {
    const num = Number(amountInTarget);
    if (isNaN(num)) return 0;
    const rate = CURRENCIES[fromCurrency]?.rate || 1.0;
    return num * rate;
  };

  // Converts and formats a PKR amount to target currency with symbol
  const formatAmount = (amountInPKR, fractionDigits = 2) => {
    const converted = convertAmount(amountInPKR);
    const symbol = getCurrencySymbol();
    return `${symbol}${converted.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })}`;
  };

  return (
    <CurrencyContext.Provider
      value={{
        selectedCurrency,
        currencySymbol: getCurrencySymbol(),
        changeCurrency,
        convertAmount,
        convertAmountToPKR,
        formatAmount,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => useContext(CurrencyContext);
