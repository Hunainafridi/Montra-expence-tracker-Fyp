import { Ionicons } from "@expo/vector-icons";
import {
    RecordingPresets,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioRecorder,
} from "expo-audio";
import * as Speech from "expo-speech";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, { FadeInUp, Layout } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, firestore } from "../../config/firebase";
import { Colors, typography } from "../../constants/theme";
import {
    getChatResponse,
    getMarketProducts,
    transcribeAudioWithGroq,
} from "../../services/aiService";

const QUICK_ACTIONS = [
  { id: "1", text: "Analyze spending", icon: "pie-chart-outline" },
  { id: "2", text: "Budgeting tips", icon: "bulb-outline" },
  { id: "3", text: "Recent expenses", icon: "receipt-outline" },
];

export default function Assistant() {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      text: "Hello! I'm Montra AI. I can help you analyze your spending or plan your budget. How can I help you today?",
      sender: "ai",
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speakingId, setSpeakingId] = useState(null);
  const [recordingActive, setRecordingActive] = useState(false);
  const [financialData, setFinancialData] = useState({
    balance: 0,
    recentTransactions: [],
    goals: [],
    marketProducts: [],
  });
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const flatListRef = useRef(null);

  useEffect(() => {
    return () => {
      Speech.stop();
      recorder.stop().catch(() => null);
    };
  }, [recorder]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const unsubscribeTx = onSnapshot(
      query(
        collection(firestore, "transactions"),
        where("uid", "==", user.uid),
      ),
      (snapshot) => {
        let totalIncome = 0;
        let totalExpense = 0;
        const allTransactions = snapshot.docs.map((doc) => {
          const data = doc.data();
          if (data.type === "income") totalIncome += Number(data.amount);
          else totalExpense += Number(data.amount);
          return data;
        });

        setFinancialData((prev) => ({
          ...prev,
          balance: totalIncome - totalExpense,
          recentTransactions: allTransactions
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10),
        }));
      },
    );

    const unsubscribeGoals = onSnapshot(
      query(
        collection(firestore, "savings_goals"),
        where("uid", "==", user.uid),
        where("status", "==", "active"),
      ),
      (snapshot) => {
        setFinancialData((prev) => ({
          ...prev,
          goals: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        }));
      },
    );

    // Fetch top market products once
    getMarketProducts(10).then((products) => {
      setFinancialData((prev) => ({ ...prev, marketProducts: products }));
    });

    return () => {
      unsubscribeTx();
      unsubscribeGoals();
    };
  }, []);

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = {
      id: Date.now().toString(),
      text: text.trim(),
      sender: "user",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setLoading(true);
    Keyboard.dismiss();
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    const response = await getChatResponse(
      messages.map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text,
      })),
      financialData,
    );
    const aiMsg = {
      id: Date.now().toString(),
      text: response,
      sender: "ai",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, aiMsg]);
    setLoading(false);
    if (voiceEnabled) {
      speakMessage(aiMsg.id, aiMsg.text);
    }
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const speakMessage = async (id, text) => {
    if (!text?.trim()) return;
    try {
      await Speech.stop();
      setSpeakingId(id);
      Speech.speak(text, {
        pitch: 1,
        rate: 0.95,
        onDone: () => setSpeakingId(null),
        onStopped: () => setSpeakingId(null),
        onError: () => setSpeakingId(null),
      });
    } catch (_error) {
      setSpeakingId(null);
    }
  };

  const stopSpeaking = async () => {
    await Speech.stop();
    setSpeakingId(null);
  };

  const startRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        return Alert.alert(
          "Permission denied",
          "Microphone access is needed for voice input.",
        );
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingActive(true);
    } catch (error) {
      console.error("Recording start error:", error);
      Alert.alert("Error", "Could not start recording.");
    }
  };

  const stopRecording = async () => {
    if (!recordingActive) return;
    try {
      setRecordingActive(false);
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const status = recorder.getStatus();
      const rawUri = status.url ?? recorder.uri;
      const uri =
        rawUri && !rawUri.startsWith("file://") && rawUri.startsWith("/")
          ? `file://${rawUri}`
          : rawUri;

      if (!uri) {
        return Alert.alert("Error", "No recording was captured.");
      }

      setLoading(true);
      const transcript = await transcribeAudioWithGroq(uri);
      setLoading(false);

      if (!transcript) {
        return Alert.alert("Error", "Could not understand your voice input.");
      }

      setInputText(transcript);
      await sendMessage(transcript);
    } catch (error) {
      console.error("Recording stop error:", error);
      setLoading(false);
      Alert.alert("Error", "Could not process recording.");
    }
  };

  const renderMessage = ({ item }) => (
    <Animated.View
      entering={FadeInUp.duration(400)}
      layout={Layout.springify()}
      style={[
        styles.messageBubble,
        item.sender === "user" ? styles.userBubble : styles.aiBubble,
      ]}
    >
      <Text
        style={[
          styles.messageText,
          { color: item.sender === "user" ? "white" : Colors.textPrimary },
        ]}
      >
        {item.text}
      </Text>
      {item.sender === "ai" && (
        <TouchableOpacity
          style={styles.voiceButton}
          onPress={() =>
            speakingId === item.id
              ? stopSpeaking()
              : speakMessage(item.id, item.text)
          }
        >
          <Ionicons
            name={
              speakingId === item.id
                ? "stop-circle-outline"
                : "volume-high-outline"
            }
            size={16}
            color={Colors.primary}
          />
          <Text style={styles.voiceButtonText}>
            {speakingId === item.id ? "Stop" : "Speak"}
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Montra AI</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Active Intelligence</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          {speakingId && (
            <TouchableOpacity style={styles.voiceToggle} onPress={stopSpeaking}>
              <Ionicons
                name="stop-outline"
                size={18}
                color={Colors.cardExpense}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.voiceToggle}
            onPress={() => setVoiceEnabled((prev) => !prev)}
          >
            <Ionicons
              name={
                voiceEnabled ? "volume-high-outline" : "volume-mute-outline"
              }
              size={18}
              color={voiceEnabled ? Colors.primary : Colors.textSecondary}
            />
          </TouchableOpacity>
          <View style={styles.headerIcon}>
            <Ionicons name="sparkles" size={24} color={Colors.primary} />
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.chatList}
          ListHeaderComponent={() =>
            financialData.goals.length > 0 && (
              <View style={styles.goalContainer}>
                <Text style={styles.goalSectionTitle}>
                  Your Saving Goals 🎯
                </Text>
                {financialData.goals.map((goal) => {
                  const progress = Math.min(
                    financialData.balance / (goal.targetAmount || 1),
                    1,
                  );
                  return (
                    <View key={goal.id} style={styles.goalCard}>
                      <Text style={styles.goalName}>{goal.title}</Text>
                      <View style={styles.progressBarBg}>
                        <View
                          style={[
                            styles.progressBarFill,
                            { width: `${progress * 100}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressText}>
                        {Math.round(progress * 100)}% saved
                      </Text>
                    </View>
                  );
                })}
              </View>
            )
          }
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            loading && (
              <View style={styles.aiBubble}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            )
          }
        />

        {messages.length === 1 && (
          <View style={styles.quickActions}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={styles.actionChip}
                onPress={() => sendMessage(action.text)}
              >
                <Ionicons name={action.icon} size={16} color={Colors.primary} />
                <Text style={styles.actionText}>{action.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask me something..."
            placeholderTextColor={Colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.micButton,
              recordingActive && styles.micButtonActive,
            ]}
            onPress={recordingActive ? stopRecording : startRecording}
            disabled={loading}
          >
            <Ionicons
              name={recordingActive ? "stop-circle" : "mic-outline"}
              size={20}
              color="white"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sendButton,
              !inputText.trim() && styles.sendButtonDisabled,
            ]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || loading}
          >
            <Ionicons name="send" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E3F5",
  },
  headerTitle: { ...typography.header, fontSize: 22 },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
    marginRight: 6,
  },
  statusText: { ...typography.caption, fontWeight: "600" },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  voiceToggle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E3F5",
  },
  chatList: { padding: 20 },
  messageBubble: {
    maxWidth: "85%",
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: "white",
    borderBottomLeftRadius: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  messageText: { fontSize: 15, lineHeight: 22 },
  voiceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  voiceButtonText: { color: Colors.primary, fontSize: 12, fontWeight: "700" },
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    marginBottom: 15,
    gap: 10,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 12,
    elevation: 1,
    gap: 8,
  },
  actionText: {
    ...typography.caption,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#E5E3F5",
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  micButton: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  micButtonActive: {
    backgroundColor: Colors.cardExpense,
  },
  sendButtonDisabled: { backgroundColor: Colors.progressTrack },
  goalContainer: {
    marginBottom: 25,
    backgroundColor: "white",
    padding: 20,
    borderRadius: 20,
    elevation: 2,
  },
  goalSectionTitle: {
    ...typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 15,
  },
  goalCard: { marginBottom: 15 },
  goalName: { ...typography.body, fontWeight: "700", marginBottom: 8 },
  progressBarBg: {
    height: 8,
    backgroundColor: Colors.progressTrack,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.progressFill,
    borderRadius: 4,
  },
  progressText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
  },
});
