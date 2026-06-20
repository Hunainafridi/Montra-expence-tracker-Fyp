import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import SuccessModal from "../../components/SuccessModal";
import { auth, firestore } from "../../config/firebase";
import { Colors, styles } from "../../constants/theme";
import {
  parseReceiptWithGroq,
  parseTransactionWithGroq,
} from "../../services/aiService";
import { useCurrency } from "../../contexts/currencyContext";
import { scheduleBudgetNotification } from "../../utils/notifications";

const normalizeCategory = (value) => (value || "other").trim().toLowerCase();

const getMonthBounds = (isoDate) => {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { start, end, monthKey };
};

const toDateInput = (value) => {
  if (!value) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
};

const AddTransactionModal = ({ visible, onClose, transaction = null }) => {
  const { convertAmount, convertAmountToPKR, currencySymbol } = useCurrency();
  const isEditMode = !!transaction?.id;

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [dateInput, setDateInput] = useState(toDateInput());
  const [type, setType] = useState("expense");
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [wallets, setWallets] = useState([]);
  const [customCategories, setCustomCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [magicText, setMagicText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const resetForm = () => {
    setTitle("");
    setAmount("");
    setCategory("");
    setNotes("");
    setDateInput(toDateInput());
    setType("expense");
    setSelectedWalletId("");
    setMagicText("");
  };

  useEffect(() => {
    if (!visible) return;
    const user = auth.currentUser;
    if (!user?.uid) return;

    const walletsQuery = query(
      collection(firestore, "wallets"),
      where("uid", "==", user.uid),
    );
    const unsubscribe = onSnapshot(walletsQuery, (snapshot) => {
      const walletData = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));
      setWallets(walletData);
      if (walletData.length > 0 && !selectedWalletId) {
        setSelectedWalletId(walletData[0].id);
      }
    });

    return unsubscribe;
  }, [visible, selectedWalletId]);

  useEffect(() => {
    if (!visible) return;
    const user = auth.currentUser;
    if (!user?.uid) return;

    const customCategoriesQuery = query(
      collection(firestore, "user_categories"),
      where("uid", "==", user.uid),
      orderBy("name", "asc"),
    );

    const unsubscribe = onSnapshot(customCategoriesQuery, (snapshot) => {
      setCustomCategories(
        snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
      );
    });

    return unsubscribe;
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    if (isEditMode) {
      setTitle(transaction.title || "");
      setAmount(transaction.amount != null ? String(convertAmount(transaction.amount)) : "");
      setCategory(transaction.category || "");
      setNotes(transaction.notes || "");
      setDateInput(toDateInput(transaction.createdAt));
      setType(transaction.type || "expense");
      setSelectedWalletId(transaction.walletId || "");
      setMagicText("");
      return;
    }

    resetForm();
  }, [visible, isEditMode, transaction, convertAmount]);

  const pickImage = async (useCamera = false) => {
    try {
      let result;
      const options = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.5,
        base64: true,
      };

      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== "granted") {
          Alert.alert(
            "Permission denied",
            "Camera access is needed to scan receipts.",
          );
          return;
        }
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== "granted") {
          Alert.alert(
            "Permission denied",
            "Photo library access is needed to upload receipt images.",
          );
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync(options);
      }

      if (!result.canceled && result.assets[0].base64) {
        setScanning(true);
        const parsed = await parseReceiptWithGroq(result.assets[0].base64);
        setScanning(false);
        if (parsed) {
          if (parsed.title) setTitle(parsed.title);
          if (parsed.amount) setAmount(String(parsed.amount));
          setType("expense");
        } else {
          Alert.alert("Error", "Could not read receipt. Please try again.");
        }
      }
    } catch (error) {
      console.error("Image Picker Error:", error);
      Alert.alert("Error", "Failed to pick image");
      setScanning(false);
    }
  };

  const handleMagicFill = async () => {
    if (!magicText.trim()) return;
    setAiLoading(true);
    const result = await parseTransactionWithGroq(magicText);
    setAiLoading(false);

    if (result) {
      if (result.title) setTitle(result.title);
      if (result.amount) setAmount(String(result.amount));
      if (result.type)
        setType(result.type.toLowerCase() === "income" ? "income" : "expense");
    } else {
      Alert.alert("Error", "Could not understand the text. Please try again.");
    }
  };

  const checkBudgetStatus = async (user, payload) => {
    if (payload.type !== "expense") return null;

    try {
      const normalizedCategory = normalizeCategory(payload.category);
      const {
        getDocs,
        query: createQuery,
        collection: getCollection,
        where: whereField,
      } = await import("firebase/firestore");

      const limitsQuery = createQuery(
        getCollection(firestore, "budget_limits"),
        whereField("uid", "==", user.uid),
      );
      const limitsSnap = await getDocs(limitsQuery);
      const matchedLimitDoc = limitsSnap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .find(
          (item) =>
            normalizeCategory(item.categoryKey || item.category) ===
            normalizedCategory,
        );

      if (
        !matchedLimitDoc?.limitAmount ||
        Number(matchedLimitDoc.limitAmount) <= 0
      ) {
        return null;
      }

      const { start, end, monthKey } = getMonthBounds(payload.createdAt);
      const monthlyTxQuery = createQuery(
        getCollection(firestore, "transactions"),
        whereField("uid", "==", user.uid),
        whereField("type", "==", "expense"),
        whereField("createdAt", ">=", start.toISOString()),
        whereField("createdAt", "<=", end.toISOString()),
      );
      const monthlyTxSnap = await getDocs(monthlyTxQuery);

      const spent = monthlyTxSnap.docs.reduce((sum, item) => {
        const tx = item.data();
        if (normalizeCategory(tx.category) !== normalizedCategory) return sum;
        return sum + Number(tx.amount || 0);
      }, 0);

      const limitAmount = Number(matchedLimitDoc.limitAmount || 0);
      const ratio = limitAmount > 0 ? spent / limitAmount : 0;
      let level = null;

      if (ratio >= 1) level = "overflow";
      else if (ratio >= 0.8) level = "warning";

      if (!level) return null;

      const alertDocId = `${user.uid}_${monthKey}_${normalizedCategory}_${level}`;
      await setDoc(
        doc(firestore, "budget_alerts", alertDocId),
        {
          uid: user.uid,
          monthKey,
          category: payload.category,
          categoryKey: normalizedCategory,
          level,
          spent,
          limitAmount,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        { merge: true },
      );

      return { level, spent, limitAmount, category: payload.category };
    } catch (e) {
      console.warn("checkBudgetStatus failed:", e);
      return null;
    }
  };

  const upsertCustomCategory = async (user, payload) => {
    const cleanCategory = (payload.category || "").trim();
    if (!cleanCategory || cleanCategory.toLowerCase() === "other") return;

    const key = cleanCategory.toLowerCase();
    const docId = `${user.uid}_${key}`;
    await setDoc(
      doc(firestore, "user_categories", docId),
      {
        uid: user.uid,
        name: cleanCategory,
        key,
        type: payload.type || "expense",
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      { merge: true },
    );
  };

  const buildPayload = async (user) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      throw new Error("DATE_FORMAT");
    }
    const parsedDate = new Date(`${dateInput}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error("DATE_INVALID");
    }

    let finalCategory = category.trim() || "Other";
    let isAnomaly = false;
    let anomalyReason = "";

    if (type === "expense") {
      try {
        const { autoCategorizeExpense, detectAnomaly } =
          await import("../../services/aiService");

        if (!category.trim() && title.trim()) {
          try {
            finalCategory = await Promise.race([
              autoCategorizeExpense(
                title.trim(),
                convertAmountToPKR(parseFloat(amount)),
              ),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2500))
            ]);
          } catch (e) {
            console.warn("AI auto categorization timed out or failed:", e);
            finalCategory = "Other";
          }
        }

        try {
          const {
            getDocs,
            query: createQuery,
            collection: getCollection,
            where: whereField,
            limit,
            orderBy,
          } = await import("firebase/firestore");

          const historyQuery = createQuery(
            getCollection(firestore, "transactions"),
            whereField("uid", "==", user.uid),
            whereField("category", "==", finalCategory),
            orderBy("createdAt", "desc"),
            limit(5),
          );
          
          const historySnap = await getDocs(historyQuery);
          const history = historySnap.docs.map((item) => item.data());

          const anomalyRes = await Promise.race([
            detectAnomaly(
              {
                title: title.trim(),
                amount: convertAmountToPKR(parseFloat(amount)),
                category: finalCategory,
              },
              history,
            ),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2500))
          ]);

          if (anomalyRes?.isAnomaly) {
            isAnomaly = true;
            anomalyReason = anomalyRes.reason;
          }
        } catch (e) {
          console.warn("Anomaly detection skipped (missing index or timeout):", e);
        }
      } catch (e) {
        console.warn("AI service import failed:", e);
      }
    }

    return {
      uid: user.uid,
      walletId: selectedWalletId,
      title: title.trim(),
      amount: convertAmountToPKR(parseFloat(amount)),
      type,
      category: finalCategory,
      notes: notes.trim(),
      isAnomaly,
      anomalyReason,
      createdAt: parsedDate.toISOString(),
    };
  };

  const handleSaveTransaction = async () => {
    if (!title.trim() || !amount) {
      Alert.alert("Error", "Please fill all required fields.");
      return;
    }

    if (!selectedWalletId) {
      Alert.alert("Error", "Please select a wallet.");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Error", "Please enter a valid amount.");
      return;
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Error", "Not logged in.");
        return;
      }

      // Build basic payload instantly without blocking the user
      const parsedDate = new Date(`${dateInput}T12:00:00`);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new Error("DATE_INVALID");
      }
      const baseAmount = convertAmountToPKR(parsedAmount);

      const payload = {
        uid: user.uid,
        walletId: selectedWalletId,
        title: title.trim(),
        amount: baseAmount,
        type,
        category: category.trim() || "Other", // temporary fallback until background categorizer runs
        notes: notes.trim(),
        isAnomaly: false,
        anomalyReason: "",
        createdAt: parsedDate.toISOString(),
      };

      let docRef;
      if (isEditMode) {
        docRef = doc(firestore, "transactions", transaction.id);
        await updateDoc(docRef, {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
      } else {
        docRef = await addDoc(collection(firestore, "transactions"), payload);
      }

      // Immediately send local push notification
      const txAmountFormatted = convertAmount(payload.amount).toFixed(2);
      const emoji = payload.type === "income" ? "💰" : "💸";
      const titleText = payload.type === "income" ? "Income Added" : "Expense Added";
      scheduleBudgetNotification(
        `${titleText} ${emoji}`,
        `${payload.title} - ${currencySymbol.trim()}${txAmountFormatted}`
      );

      // Asynchronously process AI categorization and anomaly detection in the background
      if (type === "expense") {
        (async () => {
          try {
            let finalCategory = category.trim();
            const { autoCategorizeExpense, detectAnomaly } = await import("../../services/aiService");

            // Background Category Suggestion
            if (!finalCategory && payload.title) {
              finalCategory = await autoCategorizeExpense(payload.title, payload.amount);
              if (finalCategory) {
                await updateDoc(docRef, { category: finalCategory });
              }
            }

            // Background Anomaly Detection
            const {
              getDocs,
              query: createQuery,
              collection: getCollection,
              where: whereField,
              limit,
              orderBy,
            } = await import("firebase/firestore");

            const historyQuery = createQuery(
              getCollection(firestore, "transactions"),
              whereField("uid", "==", user.uid),
              whereField("category", "==", finalCategory || "Other"),
              orderBy("createdAt", "desc"),
              limit(5),
            );
            
            const historySnap = await getDocs(historyQuery);
            const history = historySnap.docs.map((item) => item.data());

            const anomalyRes = await detectAnomaly(
              {
                title: payload.title,
                amount: payload.amount,
                category: finalCategory || "Other",
              },
              history,
            );

            if (anomalyRes?.isAnomaly) {
              await updateDoc(docRef, {
                isAnomaly: true,
                anomalyReason: anomalyRes.reason,
              });
            }

            // Background Budget audits
            const budgetStatus = await checkBudgetStatus(user, {
              ...payload,
              category: finalCategory || "Other",
            });
            if (budgetStatus?.level === "warning") {
              const warningMsg = `You have used ${Math.round((budgetStatus.spent / budgetStatus.limitAmount) * 100)}% of your ${budgetStatus.category} budget.`;
              scheduleBudgetNotification("Budget Warning", warningMsg);
            }
            if (budgetStatus?.level === "overflow") {
              const diff = convertAmount(budgetStatus.spent - budgetStatus.limitAmount);
              const overflowMsg = `${budgetStatus.category} is over budget by ${currencySymbol.trim()}${diff.toFixed(2)}.`;
              scheduleBudgetNotification("Budget Overflow ⚠️", overflowMsg);
            }
          } catch (bgError) {
            console.warn("Background transaction checks skipped:", bgError);
          }
        })();
      }

      setLoading(false);
      resetForm();
      onClose(isEditMode ? "Payment updated successfully!" : "Payment added successfully!");
    } catch (error) {
      setLoading(false);
      console.error("Save Transaction Error:", error);
      if (error?.message === "DATE_INVALID") {
        Alert.alert("Error", "Please enter a valid date.");
      } else {
        Alert.alert("Error", isEditMode ? "Failed to update transaction" : "Failed to add transaction");
      }
    }
  };

  const handleDeleteTransaction = async () => {
    if (!isEditMode) return;

    Alert.alert(
      "Delete Transaction",
      "Are you sure you want to delete this transaction?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await deleteDoc(doc(firestore, "transactions", transaction.id));
              setLoading(false);
              resetForm();
              onClose("Payment deleted successfully!");
            } catch (error) {
              console.error("Delete Transaction Error:", error);
              Alert.alert("Error", "Failed to delete transaction");
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleSuccessClose = () => {
    setSuccessVisible(false);
    resetForm();
    onClose();
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderTopLeftRadius: 25,
              borderTopRightRadius: 25,
              maxHeight: "90%",
              paddingBottom: 20,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: Colors.surface,
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: Colors.textPrimary,
                }}
              >
                {isEditMode ? "Edit Transaction" : "New Transaction"}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  padding: 5,
                  backgroundColor: Colors.surface,
                  borderRadius: 20,
                }}
              >
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {!isEditMode && (
                <>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: Colors.textSecondary,
                      marginBottom: 10,
                      letterSpacing: 0.5,
                    }}
                  >
                    QUICK ADD
                  </Text>

                  <View
                    style={{ flexDirection: "row", gap: 15, marginBottom: 25 }}
                  >
                    <TouchableOpacity
                      onPress={() => pickImage(true)}
                      style={{
                        flex: 1,
                        backgroundColor: "#4ade80" + "15",
                        padding: 15,
                        borderRadius: 15,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: "#4ade80" + "40",
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: "#4ade80",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons
                          name="camera-outline"
                          size={22}
                          color="#fff"
                        />
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: "#4ade80",
                        }}
                      >
                        Scan Receipt
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => pickImage(false)}
                      style={{
                        flex: 1,
                        backgroundColor: Colors.primary + "15",
                        padding: 15,
                        borderRadius: 15,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: Colors.primary + "40",
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: Colors.primary,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="image-outline" size={22} color="#fff" />
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: Colors.primary,
                        }}
                      >
                        Upload Image
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {scanning && (
                    <View
                      style={{
                        marginBottom: 20,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: Colors.surface,
                        padding: 10,
                        borderRadius: 10,
                      }}
                    >
                      <ActivityIndicator size="small" color="#4ade80" />
                      <Text
                        style={{
                          marginLeft: 8,
                          color: Colors.textSecondary,
                          fontSize: 13,
                        }}
                      >
                        Analyzing receipt...
                      </Text>
                    </View>
                  )}

                  <View style={{ marginBottom: 25 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 8,
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: Colors.textSecondary,
                        }}
                      >
                        AI Magic Fill
                      </Text>
                      {aiLoading && (
                        <ActivityIndicator
                          size="small"
                          color={Colors.primary}
                        />
                      )}
                    </View>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <TextInput
                        placeholder="e.g., 'Lunch $15' or 'Taxi 500'"
                        value={magicText}
                        onChangeText={setMagicText}
                        style={{
                          flex: 1,
                          backgroundColor: Colors.surface,
                          padding: 12,
                          borderRadius: 12,
                          fontSize: 15,
                          borderWidth: 1,
                          borderColor: Colors.progressTrack,
                        }}
                      />
                      <TouchableOpacity
                        onPress={handleMagicFill}
                        disabled={aiLoading || !magicText.trim()}
                        style={{
                          backgroundColor: Colors.primary,
                          width: 44,
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="arrow-forward" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View
                    style={{
                      height: 1,
                      backgroundColor: Colors.progressTrack,
                      marginBottom: 25,
                    }}
                  />
                </>
              )}

              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: Colors.textSecondary,
                  marginBottom: 15,
                  letterSpacing: 0.5,
                }}
              >
                DETAILS
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingBottom: 15 }}
              >
                {wallets.length === 0 ? (
                  <Text
                    style={{
                      color: Colors.textSecondary,
                      fontStyle: "italic",
                      fontSize: 13,
                    }}
                  >
                    No wallets found.
                  </Text>
                ) : (
                  wallets.map((wallet) => (
                    <TouchableOpacity
                      key={wallet.id}
                      onPress={() => setSelectedWalletId(wallet.id)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 20,
                        backgroundColor:
                          selectedWalletId === wallet.id
                            ? Colors.primary
                            : "transparent",
                        borderWidth: 1,
                        borderColor:
                          selectedWalletId === wallet.id
                            ? Colors.primary
                            : Colors.progressTrack,
                      }}
                    >
                      <Text
                        style={{
                          color:
                            selectedWalletId === wallet.id
                              ? "#fff"
                              : Colors.textSecondary,
                          fontWeight: "600",
                          fontSize: 13,
                        }}
                      >
                        {wallet.walletName}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>

              <View style={{ marginBottom: 15 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: Colors.textSecondary,
                    marginBottom: 5,
                  }}
                >
                  Amount ({currencySymbol.trim()})
                </Text>
                <TextInput
                  placeholder="0.00"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  style={{
                    fontSize: 24,
                    fontWeight: "700",
                    color: Colors.textPrimary,
                    padding: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: Colors.progressTrack,
                  }}
                />

                {customCategories.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingTop: 10 }}
                  >
                    {customCategories
                      .filter((item) => !item.type || item.type === type)
                      .map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => setCategory(item.name)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 14,
                            backgroundColor:
                              normalizeCategory(category) ===
                              normalizeCategory(item.name)
                                ? Colors.primary
                                : Colors.surface,
                            borderWidth: 1,
                            borderColor: Colors.progressTrack,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "600",
                              color:
                                normalizeCategory(category) ===
                                normalizeCategory(item.name)
                                  ? "white"
                                  : Colors.textSecondary,
                            }}
                          >
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                )}
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: Colors.textSecondary,
                    marginBottom: 5,
                  }}
                >
                  Title
                </Text>
                <TextInput
                  placeholder="What is this for?"
                  value={title}
                  onChangeText={setTitle}
                  style={{
                    fontSize: 16,
                    color: Colors.textPrimary,
                    padding: 10,
                    backgroundColor: Colors.surface,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: Colors.progressTrack,
                  }}
                />
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: Colors.textSecondary,
                    marginBottom: 5,
                  }}
                >
                  Category
                </Text>
                <TextInput
                  placeholder="Food, Transport, Bills..."
                  value={category}
                  onChangeText={setCategory}
                  style={{
                    fontSize: 16,
                    color: Colors.textPrimary,
                    padding: 10,
                    backgroundColor: Colors.surface,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: Colors.progressTrack,
                  }}
                />
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: Colors.textSecondary,
                    marginBottom: 5,
                  }}
                >
                  Date (YYYY-MM-DD)
                </Text>
                <TextInput
                  placeholder="2026-05-08"
                  value={dateInput}
                  onChangeText={setDateInput}
                  style={{
                    fontSize: 16,
                    color: Colors.textPrimary,
                    padding: 10,
                    backgroundColor: Colors.surface,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: Colors.progressTrack,
                  }}
                />
              </View>

              <View style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: Colors.textSecondary,
                    marginBottom: 5,
                  }}
                >
                  Notes
                </Text>
                <TextInput
                  placeholder="Optional notes"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  style={{
                    fontSize: 15,
                    color: Colors.textPrimary,
                    padding: 10,
                    backgroundColor: Colors.surface,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: Colors.progressTrack,
                    minHeight: 85,
                  }}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: Colors.surface,
                  padding: 4,
                  borderRadius: 12,
                  marginBottom: 25,
                }}
              >
                <TouchableOpacity
                  onPress={() => setType("expense")}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    backgroundColor:
                      type === "expense" ? "#fff" : "transparent",
                    borderRadius: 10,
                    elevation: type === "expense" ? 2 : 0,
                  }}
                >
                  <Text
                    style={{
                      textAlign: "center",
                      fontWeight: "600",
                      color:
                        type === "expense"
                          ? Colors.cardExpense
                          : Colors.textSecondary,
                    }}
                  >
                    Expense
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setType("income")}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    backgroundColor: type === "income" ? "#fff" : "transparent",
                    borderRadius: 10,
                    elevation: type === "income" ? 2 : 0,
                  }}
                >
                  <Text
                    style={{
                      textAlign: "center",
                      fontWeight: "600",
                      color:
                        type === "income"
                          ? Colors.cardSalary
                          : Colors.textSecondary,
                    }}
                  >
                    Income
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleSaveTransaction}
                disabled={loading || !selectedWalletId}
                style={{
                  backgroundColor:
                    loading || !selectedWalletId
                      ? Colors.progressTrack
                      : Colors.primary,
                  paddingVertical: 16,
                  borderRadius: 15,
                  alignItems: "center",
                  ...styles.shadow,
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}
                >
                  {loading
                    ? isEditMode
                      ? "Saving..."
                      : "Adding..."
                    : isEditMode
                      ? "Update Transaction"
                      : "Save Transaction"}
                </Text>
              </TouchableOpacity>

              {isEditMode && (
                <TouchableOpacity
                  onPress={handleDeleteTransaction}
                  disabled={loading}
                  style={{
                    marginTop: 12,
                    backgroundColor: "#ef4444",
                    paddingVertical: 14,
                    borderRadius: 15,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}
                  >
                    Delete Transaction
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default AddTransactionModal;
