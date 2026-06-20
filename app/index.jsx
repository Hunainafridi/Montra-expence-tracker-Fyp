import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { Colors } from "../constants/theme";
import { useAuth } from "../contexts/authContext";

const index = () => {
  const { loading } = useAuth();

  return (
    <View style={styles.container}>
      <Image
        source={require("../assets/images/splashImage.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      {loading ? (
        <ActivityIndicator
          size="large"
          color="#ffffff"
          style={styles.loader}
        />
      ) : null}
    </View>
  );
};

export default index;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  logo: {
    width: 200,
    height: 200,
  },
  loader: {
    marginTop: 24,
  },
});
