import { Ionicons } from "@expo/vector-icons";
import {
    addDoc,
    collection,
    doc,
    onSnapshot,
    query,
    updateDoc,
    where,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { SafeAreaView } from "react-native-safe-area-context";
import { firestore } from "../../config/firebase";
import { Colors, typography } from "../../constants/theme";
import { useAuth } from "../../contexts/authContext";
import {
    getStockDailySeries,
    getStockQuote,
} from "../../services/stockService";

const { width } = Dimensions.get("window");

const POPULAR_STOCKS = [
    { symbol: "AAPL", name: "Apple Inc." },
    { symbol: "MSFT", name: "Microsoft" },
    { symbol: "TSLA", name: "Tesla" },
    { symbol: "NVDA", name: "NVIDIA" },
    { symbol: "AMZN", name: "Amazon" },
    { symbol: "GOOGL", name: "Alphabet" },
    { symbol: "META", name: "Meta" },
    { symbol: "NFLX", name: "Netflix" },
];

const emptyQuote = {
    symbol: "",
    price: 0,
    change: 0,
    changePercent: "0%",
};

// Animated ticker item for the scrolling bar
function TickerItem({ symbol, price, change, changePercent }) {
    const isUp = change >= 0;
    return (
        <View style={tickerStyles.item}>
            <Text style={tickerStyles.symbol}>{symbol}</Text>
            <Text style={[tickerStyles.price, { color: isUp ? "#12B76A" : Colors.danger }]}>
                ${Number(price).toFixed(2)}
            </Text>
            <Text style={[tickerStyles.change, { color: isUp ? "#12B76A" : Colors.danger }]}>
                {isUp ? "▲" : "▼"} {Math.abs(Number(changePercent)).toFixed(2)}%
            </Text>
        </View>
    );
}

const tickerStyles = StyleSheet.create({
    item: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderRadius: 10,
        marginRight: 10,
    },
    symbol: { color: "white", fontWeight: "800", fontSize: 13 },
    price: { fontSize: 13, fontWeight: "600" },
    change: { fontSize: 11, fontWeight: "700" },
});

export default function Invest() {
    const { user } = useAuth();
    const [watchlist, setWatchlist] = useState([]);
    const [trades, setTrades] = useState([]);
    const [symbolInput, setSymbolInput] = useState("");
    const [selectedSymbol, setSelectedSymbol] = useState("AAPL");
    const [quote, setQuote] = useState(emptyQuote);
    const [history, setHistory] = useState([]);
    const [loadingQuote, setLoadingQuote] = useState(false);
    const [seedLoading, setSeedLoading] = useState(false);
    const [tradeQty, setTradeQty] = useState("1");
    const [liveMarket, setLiveMarket] = useState([]);
    const [marketLoading, setMarketLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("market"); // 'market' | 'portfolio'
    const tickerX = useRef(new Animated.Value(0)).current;

    // --- Firestore Subscriptions ---
    useEffect(() => {
        if (!user?.uid) return;
        const watchlistQuery = query(
            collection(firestore, "stock_watchlist"),
            where("uid", "==", user.uid),
        );
        const unsubWatchlist = onSnapshot(watchlistQuery, (snapshot) => {
            const docs = snapshot.docs.map((item) => ({
                id: item.id,
                ...item.data(),
            }));
            setWatchlist(docs);
            if (docs.length > 0 && !docs.some((i) => i.symbol === selectedSymbol)) {
                setSelectedSymbol(docs[0].symbol);
            }
        });

        const tradeQuery = query(
            collection(firestore, "stock_trades"),
            where("uid", "==", user.uid),
        );
        const unsubTrades = onSnapshot(tradeQuery, (snapshot) => {
            setTrades(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        });

        return () => {
            unsubWatchlist();
            unsubTrades();
        };
    }, [user?.uid]);

    // --- Load live market overview for popular stocks ---
    useEffect(() => {
        let cancelled = false;
        const loadMarket = async () => {
            setMarketLoading(true);
            try {
                // Load first 4 popular stocks for market overview
                const results = [];
                for (const stock of POPULAR_STOCKS.slice(0, 4)) {
                    try {
                        const q = await getStockQuote(stock.symbol);
                        results.push({ ...stock, ...q });
                    } catch (_) {
                        results.push({ ...stock, price: 0, change: 0, changePercent: "0%" });
                    }
                }
                if (!cancelled) setLiveMarket(results);
            } catch (_) {
                // silently fail
            } finally {
                if (!cancelled) setMarketLoading(false);
            }
        };
        loadMarket();
        // Refresh every 5 minutes
        const interval = setInterval(loadMarket, 5 * 60 * 1000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    // --- Auto-refresh ticker animation ---
    useEffect(() => {
        if (liveMarket.length === 0) return;
        Animated.loop(
            Animated.timing(tickerX, {
                toValue: -400,
                duration: 12000,
                useNativeDriver: true,
            }),
        ).start();
    }, [liveMarket]);

    const refreshSymbol = useCallback(
        async (symbol = selectedSymbol) => {
            if (!symbol) return;
            setLoadingQuote(true);
            try {
                const [q, daily] = await Promise.all([
                    getStockQuote(symbol),
                    getStockDailySeries(symbol, 30),
                ]);
                setQuote(q);
                setHistory(daily);
                const watchItem = watchlist.find((item) => item.symbol === q.symbol);
                if (watchItem?.id) {
                    await updateDoc(doc(firestore, "stock_watchlist", watchItem.id), {
                        lastPrice: q.price,
                        updatedAt: new Date().toISOString(),
                    });
                }
            } catch (error) {
                Alert.alert("Stock Data", error?.message || "Could not fetch data. Try again.");
            } finally {
                setLoadingQuote(false);
            }
        },
        [selectedSymbol, watchlist],
    );

    useEffect(() => {
        refreshSymbol(selectedSymbol);
    }, [selectedSymbol]);

    const addSymbol = async (symbol) => {
        const clean = symbol.trim().toUpperCase();
        if (!clean || !user?.uid) return;
        if (watchlist.some((item) => item.symbol === clean)) {
            Alert.alert("Already Added", `${clean} is already in your watchlist.`);
            return;
        }
        try {
            const q = await getStockQuote(clean);
            await addDoc(collection(firestore, "stock_watchlist"), {
                uid: user.uid,
                symbol: q.symbol,
                name: q.symbol,
                lastPrice: q.price,
                createdAt: new Date().toISOString(),
            });
            setSelectedSymbol(q.symbol);
            setSymbolInput("");
        } catch (error) {
            Alert.alert("Invalid Symbol", error?.message || "Could not add symbol");
        }
    };

    const seedPopular = async () => {
        if (!user?.uid) return;
        setSeedLoading(true);
        try {
            for (const stock of POPULAR_STOCKS.slice(0, 5)) {
                if (!watchlist.some((item) => item.symbol === stock.symbol)) {
                    await addDoc(collection(firestore, "stock_watchlist"), {
                        uid: user.uid,
                        symbol: stock.symbol,
                        name: stock.name,
                        lastPrice: 0,
                        createdAt: new Date().toISOString(),
                    });
                }
            }
        } catch (_) {
            Alert.alert("Error", "Failed to seed popular symbols");
        } finally {
            setSeedLoading(false);
        }
    };

    const holdingsBySymbol = useMemo(() => {
        const map = {};
        trades.forEach((trade) => {
            const current = map[trade.symbol] || { qty: 0, invested: 0 };
            if (trade.type === "buy") {
                current.qty += Number(trade.quantity || 0);
                current.invested += Number(trade.total || 0);
            } else {
                current.qty -= Number(trade.quantity || 0);
                current.invested -= Number(trade.total || 0);
            }
            map[trade.symbol] = current;
        });
        return map;
    }, [trades]);

    const watchlistPrices = useMemo(() => {
        const priceMap = {};
        watchlist.forEach((item) => {
            priceMap[item.symbol] = Number(item.lastPrice || 0);
        });
        return priceMap;
    }, [watchlist]);

    const portfolioValue = useMemo(() => {
        return Object.entries(holdingsBySymbol).reduce((sum, [symbol, holding]) => {
            const qty = Number(holding.qty || 0);
            if (qty <= 0) return sum;
            return sum + qty * Number(watchlistPrices[symbol] || 0);
        }, 0);
    }, [holdingsBySymbol, watchlistPrices]);

    const totalInvested = useMemo(() => {
        return Object.values(holdingsBySymbol).reduce((sum, h) => {
            return sum + Math.max(0, Number(h.invested || 0));
        }, 0);
    }, [holdingsBySymbol]);

    const pnl = portfolioValue - totalInvested;
    const pnlPercent = totalInvested > 0 ? ((pnl / totalInvested) * 100) : 0;

    const placeTrade = async (type) => {
        if (!user?.uid || !selectedSymbol || !quote.price) return;
        const quantity = Number(tradeQty);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            Alert.alert("Invalid Quantity", "Enter a valid quantity greater than zero.");
            return;
        }
        const holding = holdingsBySymbol[selectedSymbol]?.qty || 0;
        if (type === "sell" && quantity > holding) {
            Alert.alert("Insufficient Holding", `You only hold ${holding} shares of ${selectedSymbol}.`);
            return;
        }
        try {
            const total = Number((quantity * quote.price).toFixed(2));
            await addDoc(collection(firestore, "stock_trades"), {
                uid: user.uid,
                symbol: selectedSymbol,
                type,
                quantity,
                price: quote.price,
                total,
                createdAt: new Date().toISOString(),
            });
            Alert.alert(
                type === "buy" ? "🟢 Buy Order" : "🔴 Sell Order",
                `${quantity} × ${selectedSymbol} @ $${quote.price.toFixed(2)}\nTotal: $${total.toFixed(2)}`,
            );
        } catch (_) {
            Alert.alert("Trade Error", "Could not save trade.");
        }
    };

    const chartData = useMemo(
        () =>
            history.map((point, index) => ({
                value: point.close,
                label: index % 7 === 0 ? point.date.slice(5) : "",
                dataPointText: "",
            })),
        [history],
    );

    const selectedHolding = holdingsBySymbol[selectedSymbol]?.qty || 0;
    const isUp = quote.change >= 0;

    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {/* ── Header ─────────────────────────── */}
                <View style={styles.headerSection}>
                    <View style={styles.headerRow}>
                        <View>
                            <Text style={styles.headerTitle}>Markets</Text>
                            <Text style={styles.headerSub}>Live Stocks & Portfolio</Text>
                        </View>
                        <TouchableOpacity style={styles.refreshBtn} onPress={() => refreshSymbol()}>
                            {loadingQuote
                                ? <ActivityIndicator size="small" color={Colors.primary} />
                                : <Ionicons name="refresh" size={20} color={Colors.primary} />
                            }
                        </TouchableOpacity>
                    </View>

                    {/* ── Live Ticker Bar ─────────────── */}
                    {liveMarket.length > 0 && (
                        <View style={styles.tickerBar}>
                            <Animated.View style={[styles.tickerInner, { transform: [{ translateX: tickerX }] }]}>
                                {[...liveMarket, ...liveMarket].map((m, i) => (
                                    <TickerItem
                                        key={`${m.symbol}-${i}`}
                                        symbol={m.symbol}
                                        price={m.price}
                                        change={m.change}
                                        changePercent={typeof m.changePercent === "string"
                                            ? m.changePercent.replace("%", "")
                                            : m.changePercent}
                                    />
                                ))}
                            </Animated.View>
                        </View>
                    )}
                </View>

                {/* ── Tab Bar ───────────────────────── */}
                <View style={styles.tabRow}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === "market" && styles.tabActive]}
                        onPress={() => setActiveTab("market")}
                    >
                        <Ionicons name="bar-chart-outline" size={16} color={activeTab === "market" ? "white" : Colors.textSecondary} />
                        <Text style={[styles.tabText, activeTab === "market" && styles.tabTextActive]}>Market</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === "portfolio" && styles.tabActive]}
                        onPress={() => setActiveTab("portfolio")}
                    >
                        <Ionicons name="briefcase-outline" size={16} color={activeTab === "portfolio" ? "white" : Colors.textSecondary} />
                        <Text style={[styles.tabText, activeTab === "portfolio" && styles.tabTextActive]}>Portfolio</Text>
                    </TouchableOpacity>
                </View>

                {activeTab === "market" ? (
                    <>
                        {/* ── Market Overview Grid ─────── */}
                        <View style={styles.sectionLabel}>
                            <Ionicons name="pulse-outline" size={16} color={Colors.primary} />
                            <Text style={styles.sectionLabelText}>Market Overview</Text>
                            {marketLoading && <ActivityIndicator size="small" color={Colors.primary} style={{ marginLeft: 8 }} />}
                        </View>
                        <View style={styles.marketGrid}>
                            {(liveMarket.length > 0 ? liveMarket : POPULAR_STOCKS.slice(0, 4)).map((m) => {
                                const up = Number(m.change || 0) >= 0;
                                return (
                                    <TouchableOpacity
                                        key={m.symbol}
                                        style={[styles.marketCard, selectedSymbol === m.symbol && styles.marketCardActive]}
                                        onPress={() => { setSelectedSymbol(m.symbol); }}
                                    >
                                        <View style={styles.marketCardTop}>
                                            <Text style={styles.marketSymbol}>{m.symbol}</Text>
                                            <View style={[styles.badge, { backgroundColor: up ? "#12B76A20" : Colors.danger + "20" }]}>
                                                <Text style={[styles.badgeText, { color: up ? "#12B76A" : Colors.danger }]}>
                                                    {up ? "▲" : "▼"} {Math.abs(Number(typeof m.changePercent === "string" ? m.changePercent.replace("%", "") : m.changePercent || 0)).toFixed(2)}%
                                                </Text>
                                            </View>
                                        </View>
                                        <Text style={styles.marketName}>{m.name || m.symbol}</Text>
                                        <Text style={styles.marketPrice}>
                                            {m.price ? `$${Number(m.price).toFixed(2)}` : "--"}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* ── Quote Detail Card ─────────── */}
                        <View style={styles.quoteCard}>
                            <View style={styles.quoteTopRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.quoteSymbolLabel}>{selectedSymbol}</Text>
                                    <Text style={styles.quotePrice}>
                                        {quote.price ? `$${quote.price.toFixed(2)}` : "Loading..."}
                                    </Text>
                                    <Text style={[styles.quoteDelta, { color: isUp ? "#12B76A" : Colors.danger }]}>
                                        {isUp ? "▲ +" : "▼ "}
                                        {quote.change.toFixed(2)} ({quote.changePercent})
                                    </Text>
                                </View>
                                <View style={styles.quoteActions}>
                                    <View style={[styles.quoteBadge, { backgroundColor: isUp ? "#12B76A" : Colors.danger }]}>
                                        <Ionicons name={isUp ? "trending-up" : "trending-down"} size={20} color="white" />
                                    </View>
                                </View>
                            </View>

                            {/* Chart */}
                            {loadingQuote ? (
                                <View style={styles.chartLoader}>
                                    <ActivityIndicator size="large" color={Colors.primary} />
                                    <Text style={{ color: Colors.textSecondary, marginTop: 8 }}>Loading chart...</Text>
                                </View>
                            ) : chartData.length > 1 ? (
                                <View style={styles.chartWrap}>
                                    <LineChart
                                        data={chartData}
                                        height={160}
                                        width={width - 80}
                                        noOfSections={4}
                                        color={isUp ? "#12B76A" : Colors.danger}
                                        thickness={2.5}
                                        hideDataPoints
                                        yAxisColor="transparent"
                                        xAxisColor={Colors.progressTrack}
                                        yAxisTextStyle={{ color: Colors.textSecondary, fontSize: 9 }}
                                        xAxisLabelTextStyle={{ color: Colors.textSecondary, fontSize: 9 }}
                                        startFillColor={isUp ? "#12B76A" : Colors.danger}
                                        endFillColor={isUp ? "#12B76A" : Colors.danger}
                                        startOpacity={0.3}
                                        endOpacity={0.02}
                                        areaChart
                                        curved
                                    />
                                </View>
                            ) : (
                                <View style={styles.chartLoader}>
                                    <Text style={{ color: Colors.textSecondary }}>No chart data available</Text>
                                </View>
                            )}

                            {/* Trade Row */}
                            <View style={styles.tradeDivider} />
                            <Text style={styles.tradeLabel}>Paper Trade</Text>
                            <View style={styles.tradeRow}>
                                <TextInput
                                    style={styles.qtyInput}
                                    value={tradeQty}
                                    onChangeText={setTradeQty}
                                    keyboardType="numeric"
                                    placeholder="Qty"
                                    placeholderTextColor={Colors.textSecondary}
                                />
                                <Text style={styles.tradeCost}>
                                    {quote.price ? `≈ $${(Number(tradeQty || 0) * quote.price).toFixed(2)}` : ""}
                                </Text>
                                <TouchableOpacity style={styles.buyBtn} onPress={() => placeTrade("buy")}>
                                    <Ionicons name="arrow-up" size={16} color="white" />
                                    <Text style={styles.tradeBtnText}>Buy</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.sellBtn} onPress={() => placeTrade("sell")}>
                                    <Ionicons name="arrow-down" size={16} color="white" />
                                    <Text style={styles.tradeBtnText}>Sell</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* ── Watchlist + Add ────────────── */}
                        <View style={styles.sectionLabel}>
                            <Ionicons name="eye-outline" size={16} color={Colors.primary} />
                            <Text style={styles.sectionLabelText}>My Watchlist</Text>
                        </View>
                        <View style={styles.addRow}>
                            <TextInput
                                style={styles.input}
                                value={symbolInput}
                                autoCapitalize="characters"
                                onChangeText={setSymbolInput}
                                placeholder="Add symbol (e.g. AAPL)"
                                placeholderTextColor={Colors.textSecondary}
                            />
                            <TouchableOpacity style={styles.addButton} onPress={() => addSymbol(symbolInput)}>
                                <Ionicons name="add" size={20} color="white" />
                            </TouchableOpacity>
                        </View>

                        {watchlist.length === 0 ? (
                            <TouchableOpacity style={styles.seedBtn} onPress={seedPopular} disabled={seedLoading}>
                                {seedLoading
                                    ? <ActivityIndicator color="white" />
                                    : <>
                                        <Ionicons name="star-outline" size={18} color="white" />
                                        <Text style={styles.seedText}>  Load Popular Stocks</Text>
                                    </>
                                }
                            </TouchableOpacity>
                        ) : (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: 10 }}
                            >
                                {watchlist.map((item) => (
                                    <TouchableOpacity
                                        key={item.id}
                                        style={[
                                            styles.symbolChip,
                                            selectedSymbol === item.symbol && styles.symbolChipActive,
                                        ]}
                                        onPress={() => setSelectedSymbol(item.symbol)}
                                    >
                                        <Text style={[styles.symbolChipText, selectedSymbol === item.symbol && styles.symbolChipTextActive]}>
                                            {item.symbol}
                                        </Text>
                                        {item.lastPrice ? (
                                            <Text style={[styles.symbolPrice, selectedSymbol === item.symbol && { color: "rgba(255,255,255,0.8)" }]}>
                                                ${Number(item.lastPrice).toFixed(2)}
                                            </Text>
                                        ) : null}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}
                    </>
                ) : (
                    /* ── Portfolio Tab ──────────────── */
                    <>
                        <View style={styles.portfolioSummary}>
                            <View style={styles.portfolioRow}>
                                <View style={styles.portfolioStat}>
                                    <Text style={styles.portfolioStatLabel}>Portfolio Value</Text>
                                    <Text style={styles.portfolioStatValue}>${portfolioValue.toFixed(2)}</Text>
                                </View>
                                <View style={styles.portfolioStat}>
                                    <Text style={styles.portfolioStatLabel}>Total Invested</Text>
                                    <Text style={styles.portfolioStatValue}>${totalInvested.toFixed(2)}</Text>
                                </View>
                            </View>
                            <View style={[styles.pnlBanner, { backgroundColor: pnl >= 0 ? "#12B76A20" : Colors.danger + "20" }]}>
                                <Text style={[styles.pnlLabel, { color: pnl >= 0 ? "#12B76A" : Colors.danger }]}>
                                    P&L: {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} ({pnlPercent.toFixed(2)}%)
                                </Text>
                            </View>
                        </View>

                        {/* Holdings list */}
                        <View style={styles.sectionLabel}>
                            <Ionicons name="briefcase-outline" size={16} color={Colors.primary} />
                            <Text style={styles.sectionLabelText}>Holdings</Text>
                        </View>

                        {Object.entries(holdingsBySymbol).filter(([, h]) => h.qty > 0).length === 0 ? (
                            <View style={styles.emptyState}>
                                <Ionicons name="trending-up-outline" size={56} color={Colors.textSecondary} />
                                <Text style={styles.emptyTitle}>No holdings yet</Text>
                                <Text style={styles.mutedText}>Switch to Market tab to paper trade.</Text>
                            </View>
                        ) : (
                            Object.entries(holdingsBySymbol)
                                .filter(([, h]) => h.qty > 0)
                                .map(([symbol, holding]) => {
                                    const livePrice = watchlistPrices[symbol] || 0;
                                    const value = holding.qty * livePrice;
                                    const gain = value - holding.invested;
                                    const gainPct = holding.invested > 0 ? (gain / holding.invested) * 100 : 0;
                                    return (
                                        <View key={symbol} style={styles.holdingCard}>
                                            <View style={styles.holdingLeft}>
                                                <View style={styles.holdingIconBox}>
                                                    <Text style={styles.holdingIcon}>{symbol.slice(0, 2)}</Text>
                                                </View>
                                                <View>
                                                    <Text style={styles.holdingSymbol}>{symbol}</Text>
                                                    <Text style={styles.holdingQty}>{holding.qty} shares</Text>
                                                </View>
                                            </View>
                                            <View style={styles.holdingRight}>
                                                <Text style={styles.holdingValue}>${value.toFixed(2)}</Text>
                                                <Text style={[styles.holdingGain, { color: gain >= 0 ? "#12B76A" : Colors.danger }]}>
                                                    {gain >= 0 ? "+" : ""}{gainPct.toFixed(2)}%
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                })
                        )}

                        {/* Trade History */}
                        {trades.length > 0 && (
                            <>
                                <View style={styles.sectionLabel}>
                                    <Ionicons name="receipt-outline" size={16} color={Colors.primary} />
                                    <Text style={styles.sectionLabelText}>Trade History</Text>
                                </View>
                                {trades.slice(0, 10).map((trade) => (
                                    <View key={trade.id} style={styles.tradeHistItem}>
                                        <View style={[
                                            styles.tradeHistIcon,
                                            { backgroundColor: trade.type === "buy" ? "#12B76A20" : Colors.danger + "20" }
                                        ]}>
                                            <Ionicons
                                                name={trade.type === "buy" ? "arrow-up" : "arrow-down"}
                                                size={16}
                                                color={trade.type === "buy" ? "#12B76A" : Colors.danger}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.tradeHistSym}>{trade.symbol}</Text>
                                            <Text style={styles.tradeHistMeta}>
                                                {trade.quantity} shares @ ${Number(trade.price || 0).toFixed(2)}
                                            </Text>
                                        </View>
                                        <Text style={[
                                            styles.tradeHistTotal,
                                            { color: trade.type === "buy" ? Colors.textPrimary : "#12B76A" }
                                        ]}>
                                            {trade.type === "buy" ? "-" : "+"}${Number(trade.total || 0).toFixed(2)}
                                        </Text>
                                    </View>
                                ))}
                            </>
                        )}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.surface },

    // Header
    headerSection: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    headerTitle: { ...typography.header, fontSize: 28 },
    headerSub: { ...typography.caption, marginTop: 2 },
    refreshBtn: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: "white", alignItems: "center", justifyContent: "center",
        elevation: 2,
    },

    // Ticker
    tickerBar: {
        backgroundColor: Colors.cardDark,
        borderRadius: 16,
        overflow: "hidden",
        height: 48,
        marginBottom: 16,
        flexDirection: "row",
    },
    tickerInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },

    // Tabs
    tabRow: {
        flexDirection: "row",
        marginHorizontal: 20,
        marginBottom: 20,
        backgroundColor: "white",
        borderRadius: 16,
        padding: 4,
        elevation: 2,
    },
    tab: {
        flex: 1, flexDirection: "row", alignItems: "center",
        justifyContent: "center", gap: 6,
        paddingVertical: 10, borderRadius: 12,
    },
    tabActive: { backgroundColor: Colors.primary, elevation: 3 },
    tabText: { color: Colors.textSecondary, fontWeight: "600", fontSize: 14 },
    tabTextActive: { color: "white", fontWeight: "700" },

    // Section label
    sectionLabel: {
        flexDirection: "row", alignItems: "center", gap: 6,
        paddingHorizontal: 20, marginBottom: 12,
    },
    sectionLabelText: { ...typography.subHeader, fontSize: 16 },

    // Market Grid
    marketGrid: {
        flexDirection: "row", flexWrap: "wrap",
        paddingHorizontal: 20, gap: 12, marginBottom: 20,
    },
    marketCard: {
        width: (width - 52) / 2,
        backgroundColor: "white",
        borderRadius: 18,
        padding: 14,
        elevation: 2,
        borderWidth: 2,
        borderColor: "transparent",
    },
    marketCardActive: { borderColor: Colors.primary },
    marketCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
    marketSymbol: { fontWeight: "800", fontSize: 15, color: Colors.textPrimary },
    marketName: { ...typography.caption, fontSize: 11, marginBottom: 6 },
    marketPrice: { fontSize: 20, fontWeight: "900", color: Colors.textPrimary },
    badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
    badgeText: { fontSize: 11, fontWeight: "700" },

    // Quote Card
    quoteCard: {
        backgroundColor: "white",
        borderRadius: 24,
        marginHorizontal: 20,
        padding: 18,
        marginBottom: 24,
        elevation: 3,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
    },
    quoteTopRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    quoteSymbolLabel: { ...typography.caption, fontWeight: "700", textTransform: "uppercase", marginBottom: 2 },
    quotePrice: { fontSize: 36, fontWeight: "900", color: Colors.textPrimary },
    quoteDelta: { fontWeight: "700", marginTop: 2, fontSize: 14 },
    quoteActions: {},
    quoteBadge: {
        width: 52, height: 52, borderRadius: 16,
        alignItems: "center", justifyContent: "center",
    },
    chartWrap: { marginTop: 10, marginBottom: 4, overflow: "hidden" },
    chartLoader: { height: 140, alignItems: "center", justifyContent: "center", marginVertical: 8 },
    tradeDivider: { height: 1, backgroundColor: Colors.surface, marginVertical: 14 },
    tradeLabel: { ...typography.caption, fontWeight: "700", textTransform: "uppercase", marginBottom: 10 },
    tradeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    qtyInput: {
        width: 68, height: 44, borderRadius: 12,
        paddingHorizontal: 10, color: Colors.textPrimary,
        backgroundColor: Colors.surface, fontWeight: "700",
        textAlign: "center",
    },
    tradeCost: { flex: 1, color: Colors.textSecondary, fontSize: 12, fontWeight: "600" },
    buyBtn: {
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 16, height: 44, borderRadius: 12,
        backgroundColor: "#12B76A", elevation: 2,
    },
    sellBtn: {
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 16, height: 44, borderRadius: 12,
        backgroundColor: Colors.danger, elevation: 2,
    },
    tradeBtnText: { color: "white", fontWeight: "700", fontSize: 14 },

    // Watchlist
    addRow: {
        flexDirection: "row", alignItems: "center", gap: 10,
        paddingHorizontal: 20, marginBottom: 14,
    },
    input: {
        flex: 1, height: 48, backgroundColor: "white",
        borderRadius: 14, paddingHorizontal: 14, color: Colors.textPrimary,
        elevation: 1,
    },
    addButton: {
        width: 48, height: 48, borderRadius: 14,
        backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center",
        elevation: 3,
    },
    seedBtn: {
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        backgroundColor: Colors.cardDark, borderRadius: 14,
        height: 52, marginHorizontal: 20, marginBottom: 16,
    },
    seedText: { color: "white", fontWeight: "700" },
    symbolChip: {
        backgroundColor: "white", paddingVertical: 8, paddingHorizontal: 14,
        borderRadius: 12, marginRight: 8, elevation: 1,
    },
    symbolChipActive: { backgroundColor: Colors.primary },
    symbolChipText: { color: Colors.textPrimary, fontWeight: "700" },
    symbolChipTextActive: { color: "white" },
    symbolPrice: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

    // Portfolio
    portfolioSummary: {
        backgroundColor: Colors.cardDark, borderRadius: 24,
        padding: 20, marginHorizontal: 20, marginBottom: 20,
    },
    portfolioRow: { flexDirection: "row", justifyContent: "space-between" },
    portfolioStat: { alignItems: "flex-start" },
    portfolioStatLabel: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
    portfolioStatValue: { color: "white", fontSize: 24, fontWeight: "900", marginTop: 4 },
    pnlBanner: { borderRadius: 12, padding: 10, marginTop: 14, alignItems: "center" },
    pnlLabel: { fontWeight: "800", fontSize: 16 },

    holdingCard: {
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        backgroundColor: "white", borderRadius: 16, padding: 14,
        marginHorizontal: 20, marginBottom: 10, elevation: 1,
    },
    holdingLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    holdingIconBox: {
        width: 44, height: 44, borderRadius: 14,
        backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center",
    },
    holdingIcon: { fontWeight: "900", color: Colors.primary, fontSize: 14 },
    holdingSymbol: { fontWeight: "800", fontSize: 16, color: Colors.textPrimary },
    holdingQty: { ...typography.caption, fontSize: 12 },
    holdingRight: { alignItems: "flex-end" },
    holdingValue: { fontWeight: "800", fontSize: 16, color: Colors.textPrimary },
    holdingGain: { fontWeight: "700", fontSize: 13, marginTop: 2 },

    tradeHistItem: {
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: "white", borderRadius: 14, padding: 12,
        marginHorizontal: 20, marginBottom: 8, elevation: 1,
    },
    tradeHistIcon: {
        width: 36, height: 36, borderRadius: 10,
        alignItems: "center", justifyContent: "center",
    },
    tradeHistSym: { fontWeight: "700", fontSize: 14, color: Colors.textPrimary },
    tradeHistMeta: { ...typography.caption, fontSize: 12 },
    tradeHistTotal: { fontWeight: "800", fontSize: 14 },

    emptyState: { alignItems: "center", marginTop: 40, paddingHorizontal: 20 },
    emptyTitle: { ...typography.subHeader, marginTop: 10 },
    mutedText: { ...typography.caption, marginTop: 4 },
});
