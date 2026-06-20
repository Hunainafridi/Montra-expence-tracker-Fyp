import { Ionicons } from "@expo/vector-icons";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { PieChart } from "react-native-gifted-charts";
import AddTransactionModal from "../(modals)/AddTransactionModal";
import CurrencyPickerModal from "../(modals)/CurrencyPickerModal";
import { auth, firestore } from "../../config/firebase";
import { Colors, typography } from "../../constants/theme";
import { useCurrency } from "../../contexts/currencyContext";

const { width } = Dimensions.get("window");

const HomeScreen = () => {
  const { formatAmount, convertAmountToPKR, selectedCurrency } = useCurrency();
  const [userName, setUserName] = useState("");
  const [balance, setBalance] = useState(0);
  const [income, setIncome] = useState(0);
  const [expense, setExpense] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [selectedTx, setSelectedTx] = useState(null);
  const [timeFilter, setTimeFilter] = useState("month"); // 'today', 'week', 'month'
  const [loading, setLoading] = useState(true);
  const [forecast, setForecast] = useState(null);
  const [budgetLimits, setBudgetLimits] = useState([]);
  const [budgetAlerts, setBudgetAlerts] = useState([]);
  const [showBudgetManager, setShowBudgetManager] = useState(false);
  const [budgetCategoryInput, setBudgetCategoryInput] = useState("");
  const [budgetAmountInput, setBudgetAmountInput] = useState("");
  const [customCategories, setCustomCategories] = useState([]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [categoryNameInput, setCategoryNameInput] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const showHomeToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg("");
    }, 3500);
  };

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser?.uid) return;

    const userDocRef = doc(firestore, "users", currentUser.uid);
    const unsub = onSnapshot(userDocRef, (snap) => {
      const data = snap.data() || {};
      setUserName(
        data.username || data.displayName || currentUser.displayName || "User",
      );
    });

    return unsub;
  }, []);

  useEffect(() => {
    if (!auth.currentUser?.uid) return;
    const q = query(
      collection(firestore, "wallets"),
      where("uid", "==", auth.currentUser.uid),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setWallets(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!auth.currentUser?.uid) return;
    setLoading(true);

    const now = new Date();
    let startDate = new Date();
    if (timeFilter === "today") startDate.setHours(0, 0, 0, 0);
    else if (timeFilter === "week") startDate.setDate(now.getDate() - 7);
    else if (timeFilter === "month") startDate.setDate(now.getDate() - 30);

    let unsub;
    const startListener = () => {
      const q = query(
        collection(firestore, "transactions"),
        where("uid", "==", auth.currentUser.uid),
        where("createdAt", ">=", startDate.toISOString()),
        orderBy("createdAt", "desc"),
        limit(50),
      );

      unsub = onSnapshot(
        q,
        (snapshot) => {
          const txData = snapshot.docs.map((doc) => {
            const data = doc.data();
            const wallet = wallets.find((w) => w.id === data.walletId);
            return {
              id: doc.id,
              ...data,
              walletName: wallet?.walletName || "Other",
            };
          });
          setTransactions(txData);

          let inc = 0,
            exp = 0;
          txData.forEach((t) => {
            if (t.type === "income") inc += Number(t.amount);
            else exp += Number(t.amount);
          });
          setIncome(inc);
          setExpense(exp);
          setBalance(inc - exp);
          setLoading(false);

          // Update Forecast
          if (txData.length > 5 && timeFilter === "month") {
            const fetchForecast = async () => {
              const { getSpendForecasting } =
                await import("../../services/aiService");
              const res = await getSpendForecasting(txData, exp);
              if (res) setForecast(res);
            };
            fetchForecast();
          }
        },
        (error) => {
          console.warn("Transactions query index missing, falling back to client-side sorting:", error);
          const fallbackQ = query(
            collection(firestore, "transactions"),
            where("uid", "==", auth.currentUser.uid),
            where("createdAt", ">=", startDate.toISOString()),
          );
          unsub = onSnapshot(fallbackQ, (snapshot) => {
            const txData = snapshot.docs.map((doc) => {
              const data = doc.data();
              const wallet = wallets.find((w) => w.id === data.walletId);
              return {
                id: doc.id,
                ...data,
                walletName: wallet?.walletName || "Other",
              };
            });
            
            // Sort client-side
            txData.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
            const slicedData = txData.slice(0, 50);

            setTransactions(slicedData);

            let inc = 0,
              exp = 0;
            slicedData.forEach((t) => {
              if (t.type === "income") inc += Number(t.amount);
              else exp += Number(t.amount);
            });
            setIncome(inc);
            setExpense(exp);
            setBalance(inc - exp);
            setLoading(false);

            // Update Forecast
            if (slicedData.length > 5 && timeFilter === "month") {
              const fetchForecast = async () => {
                const { getSpendForecasting } =
                  await import("../../services/aiService");
                const res = await getSpendForecasting(slicedData, exp);
                if (res) setForecast(res);
              };
              fetchForecast();
            }
          });
        }
      );
    };

    startListener();
    return () => {
      if (unsub) unsub();
    };
  }, [auth.currentUser?.uid, timeFilter, wallets]);

  useEffect(() => {
    if (!auth.currentUser?.uid) return;
    const limitsQuery = query(
      collection(firestore, "budget_limits"),
      where("uid", "==", auth.currentUser.uid),
    );
    const unsubscribe = onSnapshot(limitsQuery, (snapshot) => {
      const data = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));
      setBudgetLimits(data);
    });
    return unsubscribe;
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    if (!auth.currentUser?.uid) return;

    let unsub;
    const startListener = () => {
      const customCategoriesQuery = query(
        collection(firestore, "user_categories"),
        where("uid", "==", auth.currentUser.uid),
        orderBy("name", "asc"),
      );
      unsub = onSnapshot(
        customCategoriesQuery,
        (snapshot) => {
          setCustomCategories(
            snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
          );
        },
        (error) => {
          console.warn("Categories query index missing, falling back to client sorting:", error);
          const fallbackQ = query(
            collection(firestore, "user_categories"),
            where("uid", "==", auth.currentUser.uid),
          );
          unsub = onSnapshot(fallbackQ, (snapshot) => {
            const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            setCustomCategories(data);
          });
        }
      );
    };

    startListener();
    return () => {
      if (unsub) unsub();
    };
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    if (!auth.currentUser?.uid) return;

    let unsub;
    const startListener = () => {
      const alertsQuery = query(
        collection(firestore, "budget_alerts"),
        where("uid", "==", auth.currentUser.uid),
        orderBy("updatedAt", "desc"),
        limit(5),
      );
      unsub = onSnapshot(
        alertsQuery,
        (snapshot) => {
          const data = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));
          setBudgetAlerts(data);
        },
        (error) => {
          console.warn("Budget alerts query index missing, falling back to client sorting:", error);
          const fallbackQ = query(
            collection(firestore, "budget_alerts"),
            where("uid", "==", auth.currentUser.uid),
          );
          unsub = onSnapshot(fallbackQ, (snapshot) => {
            const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            data.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
            setBudgetAlerts(data.slice(0, 5));
          });
        }
      );
    };

    startListener();
    return () => {
      if (unsub) unsub();
    };
  }, [auth.currentUser?.uid]);

  const saveBudgetLimit = async () => {
    const user = auth.currentUser;
    if (!user?.uid) {
      Alert.alert("Error", "Please login first.");
      return;
    }

    const cleanCategory = budgetCategoryInput.trim();
    const cleanAmount = parseFloat(budgetAmountInput);

    if (!cleanCategory) {
      Alert.alert("Error", "Please enter category.");
      return;
    }
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      Alert.alert("Error", "Please enter valid limit amount.");
      return;
    }

    const categoryKey = cleanCategory.toLowerCase();
    const docId = `${user.uid}_${categoryKey}`;
    const baseAmount = convertAmountToPKR(cleanAmount);
    await setDoc(
      doc(firestore, "budget_limits", docId),
      {
        uid: user.uid,
        category: cleanCategory,
        categoryKey,
        limitAmount: baseAmount,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );

    setBudgetCategoryInput("");
    setBudgetAmountInput("");
    setShowBudgetManager(false);
    Alert.alert("Saved", `Budget set for ${cleanCategory}.`);
  };

  const estimateBudgetUsage = (categoryKey) => {
    const now = new Date();
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();
    return transactions.reduce((sum, tx) => {
      if (tx.type !== "expense") return sum;
      if (!tx.createdAt || tx.createdAt < monthStart) return sum;
      if ((tx.category || "").toLowerCase() !== categoryKey) return sum;
      return sum + Number(tx.amount || 0);
    }, 0);
  };

  const saveCustomCategory = async () => {
    const user = auth.currentUser;
    if (!user?.uid) {
      Alert.alert("Error", "Please login first.");
      return;
    }

    const cleanName = categoryNameInput.trim();
    if (!cleanName) {
      Alert.alert("Error", "Category name is required.");
      return;
    }

    const categoryKey = cleanName.toLowerCase();
    const docId = editingCategory?.id || `${user.uid}_${categoryKey}`;

    await setDoc(
      doc(firestore, "user_categories", docId),
      {
        uid: user.uid,
        name: cleanName,
        key: categoryKey,
        type: "expense",
        updatedAt: new Date().toISOString(),
        createdAt: editingCategory?.createdAt || new Date().toISOString(),
      },
      { merge: true },
    );

    setCategoryNameInput("");
    setEditingCategory(null);
    setShowCategoryManager(false);
  };

  const startEditCategory = (item) => {
    setEditingCategory(item);
    setCategoryNameInput(item.name || "");
    setShowCategoryManager(true);
  };

  const removeCategory = async (item) => {
    Alert.alert("Delete Category", `Delete '${item.name}' category?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteDoc(doc(firestore, "user_categories", item.id));
        },
      },
    ]);
  };

  const pieData = useMemo(
    () => [
      { value: income || 1, color: Colors.cardSalary, text: "Income" },
      { value: expense || 1, color: Colors.cardExpense, text: "Expense" },
    ],
    [income, expense],
  );

  const analytics = useMemo(() => {
    const expenseTx = transactions.filter((item) => item.type === "expense");
    const categoryTotals = expenseTx.reduce((acc, tx) => {
      const key = (tx.category || "other").toLowerCase();
      acc[key] = (acc[key] || 0) + Number(tx.amount || 0);
      return acc;
    }, {});

    const topCategoryEntry = Object.entries(categoryTotals).sort(
      (a, b) => b[1] - a[1],
    )[0];

    const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;
    const nearLimitCount = budgetLimits.filter((limitItem) => {
      const spent = estimateBudgetUsage(
        (limitItem.categoryKey || "").toLowerCase(),
      );
      const limitAmount = Number(limitItem.limitAmount || 0);
      return limitAmount > 0 && spent / limitAmount >= 0.8;
    }).length;

    const now = new Date();
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    const dayOfMonth = now.getDate();
    const currentDailyAvg = dayOfMonth > 0 ? expense / dayOfMonth : 0;
    const projectedMonthExpense = currentDailyAvg * daysInMonth;

    return {
      topCategory: topCategoryEntry
        ? {
            name: topCategoryEntry[0],
            amount: Number(topCategoryEntry[1] || 0),
          }
        : null,
      savingsRate,
      nearLimitCount,
      projectedMonthExpense,
    };
  }, [transactions, income, expense, budgetLimits]);

  const renderHeader = () => (
    <View>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello,</Text>
          <Text style={styles.userName}>{userName}</Text>
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={() => setShowCurrencyModal(true)}>
          <Text style={{fontWeight: '700', color: Colors.primary}}>{selectedCurrency}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.balanceCard}>
        <View>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={styles.balanceAmount}>
            {formatAmount(balance)}
          </Text>
        </View>
        <PieChart
          donut
          radius={40}
          innerRadius={30}
          data={pieData}
          centerLabelComponent={() => (
            <Ionicons name="wallet-outline" size={20} color="white" />
          )}
        />
      </View>

      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { backgroundColor: Colors.cardSalary }]}>
          <View style={styles.statIconBox}>
            <Ionicons name="arrow-up" size={20} color="white" />
          </View>
          <View>
            <Text style={styles.statLabel}>Income</Text>
            <Text style={styles.statAmount}>{formatAmount(income, 0)}</Text>
          </View>
        </View>
        <View
          style={[styles.statCard, { backgroundColor: Colors.cardExpense }]}
        >
          <View style={styles.statIconBox}>
            <Ionicons name="arrow-down" size={20} color="white" />
          </View>
          <View>
            <Text style={styles.statLabel}>Expenses</Text>
            <Text style={styles.statAmount}>{formatAmount(expense, 0)}</Text>
          </View>
        </View>
      </View>

      {forecast && timeFilter === "month" && (
        <View style={styles.forecastCard}>
          <View style={styles.forecastHeader}>
            <Ionicons name="trending-up" size={18} color={Colors.primary} />
            <Text style={styles.forecastTitle}>Spend Forecast</Text>
          </View>
          <Text style={styles.forecastAmount}>
            Projected: {formatAmount(forecast.projectedTotal, 0)}
          </Text>
          <Text style={styles.forecastNarrative}>{forecast.narrative}</Text>
        </View>
      )}

      <View style={styles.analyticsCard}>
        <View style={styles.analyticsHeader}>
          <Ionicons name="analytics-outline" size={18} color={Colors.primary} />
          <Text style={styles.analyticsTitle}>Advanced Insights</Text>
        </View>

        <View style={styles.analyticsGrid}>
          <View style={styles.analyticsItem}>
            <Text style={styles.analyticsLabel}>Top Category</Text>
            <Text style={styles.analyticsValue}>
              {analytics.topCategory
                ? `${analytics.topCategory.name} (${formatAmount(analytics.topCategory.amount, 0)})`
                : "N/A"}
            </Text>
          </View>

          <View style={styles.analyticsItem}>
            <Text style={styles.analyticsLabel}>Savings Rate</Text>
            <Text
              style={[
                styles.analyticsValue,
                {
                  color:
                    analytics.savingsRate >= 0
                      ? Colors.cardSalary
                      : Colors.cardExpense,
                },
              ]}
            >
              {analytics.savingsRate.toFixed(1)}%
            </Text>
          </View>

          <View style={styles.analyticsItem}>
            <Text style={styles.analyticsLabel}>Near Limit</Text>
            <Text style={styles.analyticsValue}>
              {analytics.nearLimitCount}
            </Text>
          </View>

          <View style={styles.analyticsItem}>
            <Text style={styles.analyticsLabel}>Projected Expense</Text>
            <Text style={styles.analyticsValue}>
              {formatAmount(analytics.projectedMonthExpense, 0)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.filterContainer}>
        {["today", "week", "month"].map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setTimeFilter(f)}
            style={[
              styles.filterBtn,
              timeFilter === f && styles.filterBtnActive,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                timeFilter === f && styles.filterTextActive,
              ]}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Budget Limits</Text>
        <TouchableOpacity onPress={() => setShowBudgetManager((prev) => !prev)}>
          <Text style={styles.seeAll}>
            {showBudgetManager ? "Close" : "Add Limit"}
          </Text>
        </TouchableOpacity>
      </View>

      {showBudgetManager && (
        <View style={styles.budgetInputCard}>
          <TextInput
            placeholder="Category (e.g. food)"
            value={budgetCategoryInput}
            onChangeText={setBudgetCategoryInput}
            style={styles.budgetInput}
          />
          <TextInput
            placeholder="Limit Amount"
            value={budgetAmountInput}
            onChangeText={setBudgetAmountInput}
            keyboardType="numeric"
            style={styles.budgetInput}
          />
          <TouchableOpacity
            style={styles.budgetSaveBtn}
            onPress={saveBudgetLimit}
          >
            <Text style={styles.budgetSaveText}>Save Budget Limit</Text>
          </TouchableOpacity>
        </View>
      )}

      {budgetLimits.length > 0 && (
        <View style={styles.budgetListCard}>
          {budgetLimits.map((limitItem) => {
            const spent = estimateBudgetUsage(
              (limitItem.categoryKey || "").toLowerCase(),
            );
            const ratio =
              limitItem.limitAmount > 0
                ? Math.min(spent / limitItem.limitAmount, 1)
                : 0;
            return (
              <View key={limitItem.id} style={styles.budgetRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.budgetCategory}>
                    {limitItem.category}
                  </Text>
                  <Text style={styles.budgetMeta}>
                    {formatAmount(spent, 2)} /{" "}
                    {formatAmount(limitItem.limitAmount, 2)}
                  </Text>
                </View>
                <View style={styles.budgetProgressTrack}>
                  <View
                    style={[
                      styles.budgetProgressFill,
                      { width: `${Math.round(ratio * 100)}%` },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {budgetAlerts.length > 0 && (
        <View style={styles.alertCard}>
          <Text style={styles.alertTitle}>Recent Budget Alerts</Text>
          {budgetAlerts.slice(0, 2).map((item) => (
            <Text key={item.id} style={styles.alertText}>
              {item.level === "overflow" ? "Overflow" : "Warning"}:{" "}
              {item.category} ({formatAmount(item.spent || 0, 2)} /{" "}
              {formatAmount(item.limitAmount || 0, 2)})
            </Text>
          ))}
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Custom Categories</Text>
        <TouchableOpacity
          onPress={() => {
            setShowCategoryManager((prev) => !prev);
            if (showCategoryManager) {
              setCategoryNameInput("");
              setEditingCategory(null);
            }
          }}
        >
          <Text style={styles.seeAll}>
            {showCategoryManager ? "Close" : "Add Category"}
          </Text>
        </TouchableOpacity>
      </View>

      {showCategoryManager && (
        <View style={styles.categoryInputCard}>
          <TextInput
            placeholder="Category name"
            value={categoryNameInput}
            onChangeText={setCategoryNameInput}
            style={styles.budgetInput}
          />
          <TouchableOpacity
            style={styles.budgetSaveBtn}
            onPress={saveCustomCategory}
          >
            <Text style={styles.budgetSaveText}>
              {editingCategory ? "Update Category" : "Save Category"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {customCategories.length > 0 && (
        <View style={styles.categoryListCard}>
          {customCategories.map((item) => (
            <View key={item.id} style={styles.categoryRow}>
              <Text style={styles.categoryNameText}>{item.name}</Text>
              <View style={styles.categoryActions}>
                <TouchableOpacity
                  style={styles.categoryActionBtn}
                  onPress={() => startEditCategory(item)}
                >
                  <Ionicons
                    name="create-outline"
                    size={16}
                    color={Colors.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.categoryActionBtn}
                  onPress={() => removeCategory(item)}
                >
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={Colors.cardExpense}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Transactions</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={() =>
          !loading && (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="receipt-outline"
                size={50}
                color={Colors.textSecondary}
              />
              <Text style={styles.emptyText}>
                No transactions for this period
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.txItem}
            onPress={() => {
              setSelectedTx(item);
              setShowAddModal(true);
            }}
          >
            <View style={styles.txIconBox}>
              <Ionicons
                name={
                  item.type === "income"
                    ? "arrow-down-circle"
                    : "arrow-up-circle"
                }
                size={24}
                color={
                  item.type === "income"
                    ? Colors.cardSalary
                    : Colors.cardExpense
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", mb: 2 }}
              >
                <Text style={styles.txTitle}>{item.title}</Text>
                {item.category && item.type === "expense" && (
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryText}>{item.category}</Text>
                  </View>
                )}
                {item.isAnomaly && (
                  <View
                    style={[
                      styles.categoryBadge,
                      { backgroundColor: Colors.cardExpense + "20" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        { color: Colors.cardExpense },
                      ]}
                    >
                      ⚠️ Unusual
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.txWallet}>{item.walletName}</Text>
            </View>
            <Text
              style={[
                styles.txAmount,
                {
                  color:
                    item.type === "income"
                      ? Colors.cardSalary
                      : Colors.cardExpense,
                },
              ]}
            >
              {item.type === "income" ? "+" : "-"}
              {formatAmount(item.amount, 2)}
            </Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      />
      <AddTransactionModal
        visible={showAddModal}
        transaction={selectedTx}
        onClose={(msg) => {
          setShowAddModal(false);
          setSelectedTx(null);
          if (msg) showHomeToast(msg);
        }}
      />
      <CurrencyPickerModal
        visible={showCurrencyModal}
        onClose={() => setShowCurrencyModal(false)}
      />

      {/* Premium Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setSelectedTx(null);
          setShowAddModal(true);
        }}
      >
        <Ionicons name="add" size={30} color="white" />
      </TouchableOpacity>

      {/* Toast Notification */}
      {!!toastMsg && (
        <View style={styles.toastContainer}>
          <Ionicons name="checkmark-circle" size={22} color="white" />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}
    </View>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingTop: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 25,
  },
  greeting: {
    ...typography.caption,
    fontSize: 14,
  },
  userName: {
    ...typography.header,
    fontSize: 22,
  },
  searchBtn: {
    width: 45,
    height: 45,
    borderRadius: 12,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  balanceCard: {
    backgroundColor: Colors.cardDark,
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 25,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  balanceLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
  },
  balanceAmount: {
    color: "white",
    fontSize: 32,
    fontWeight: "700",
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 15,
    marginTop: 20,
    marginBottom: 30,
  },
  statCard: {
    flex: 1,
    borderRadius: 20,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  statLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "500",
  },
  statAmount: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  sectionTitle: {
    ...typography.subHeader,
  },
  seeAll: {
    color: Colors.primary,
    fontWeight: "600",
  },
  txItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    marginHorizontal: 20,
    padding: 15,
    borderRadius: 18,
    marginBottom: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  txIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  txTitle: {
    ...typography.body,
    fontWeight: "600",
  },
  txWallet: {
    ...typography.caption,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 16,
    fontWeight: "700",
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 10,
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: Colors.progressTrack,
  },
  filterBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    ...typography.caption,
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "white",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    ...typography.caption,
    marginTop: 10,
  },
  forecastCard: {
    backgroundColor: "white",
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 20,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: Colors.progressTrack,
  },
  forecastHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  forecastTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: Colors.primary,
  },
  forecastAmount: {
    ...typography.subHeader,
    fontSize: 20,
    marginBottom: 5,
  },
  forecastNarrative: {
    ...typography.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  analyticsCard: {
    backgroundColor: "white",
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.progressTrack,
  },
  analyticsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  analyticsTitle: {
    ...typography.caption,
    fontWeight: "800",
    color: Colors.primary,
    textTransform: "uppercase",
  },
  analyticsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 10,
  },
  analyticsItem: {
    width: "50%",
    paddingRight: 8,
  },
  analyticsLabel: {
    ...typography.caption,
    fontSize: 11,
  },
  analyticsValue: {
    ...typography.body,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  categoryBadge: {
    backgroundColor: Colors.progressTrack,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  categoryText: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  budgetInputCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.progressTrack,
  },
  budgetInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.progressTrack,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: Colors.textPrimary,
  },
  budgetSaveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  budgetSaveText: {
    color: "white",
    fontWeight: "700",
  },
  budgetListCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.progressTrack,
  },
  budgetRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  budgetCategory: {
    ...typography.body,
    fontWeight: "700",
  },
  budgetMeta: {
    ...typography.caption,
  },
  budgetProgressTrack: {
    width: 110,
    height: 8,
    backgroundColor: Colors.progressTrack,
    borderRadius: 8,
    overflow: "hidden",
  },
  budgetProgressFill: {
    height: "100%",
    backgroundColor: Colors.primary,
  },
  alertCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: Colors.cardExpense + "12",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.cardExpense + "40",
  },
  alertTitle: {
    ...typography.caption,
    fontWeight: "800",
    color: Colors.cardExpense,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  alertText: {
    ...typography.caption,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  categoryInputCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.progressTrack,
  },
  categoryListCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.progressTrack,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.progressTrack,
  },
  categoryNameText: {
    ...typography.body,
    fontWeight: "600",
  },
  categoryActions: {
    flexDirection: "row",
    gap: 8,
  },
  categoryActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  fab: {
    position: "absolute",
    bottom: 25,
    right: 25,
    width: 65,
    height: 65,
    borderRadius: 33,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    zIndex: 100,
  },
});
