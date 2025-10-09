#include <SPI.h>
#include <TFT_eSPI.h>
#include <DHT.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <math.h>

// ================== TFT & Touch ==================
TFT_eSPI tft = TFT_eSPI();
// ★ ทัชให้กดง่ายขึ้น
uint16_t calData[5] = { 347, 3523, 271, 3441, 7 }; // Touch calib (rotation 1)

// ================== DHT (ยังคงมี แต่ค่าวัดใช้จาก 6-in-1) ==================
#define DHT_PIN 4
#define DHTTYPE DHT22
DHT dht(DHT_PIN, DHTTYPE);

// ================== RS485 (เลือกขาได้) ==================
#define RS485_RX_PIN 26   // RO -> 26 (ผ่านตัวแบ่งแรงดัน 5V->3.3V)
#define RS485_TX_PIN 27   // DI -> 27
#define RS485_DE_RE  33   // DE/RE (ผูกเข้าด้วยกัน) ★ ย้ายมา 33 ไม่ชนทัช
#define SENSOR_RS485_BAUD 4800
#define SENSOR_ID         0x01

// ================== GPS Module ==================
#define GPS_RX_PIN 22     // GPS TX -> ESP32 RX (D22)
#define GPS_TX_PIN 21     // GPS RX -> ESP32 TX (D21)
#define GPS_BAUD 9600     // GPS module baud rate
#define GPS_SERIAL_NUM 1  // Use Serial1 for GPS (separate from RS485)

// ================== Measure duration ==================
// ★ ตามสเปกใหม่: 10 ครั้ง/วินาที × 3 วินาที = 30 ครั้ง
#define MEASURE_DURATION_MS 3000
#define UI_UPDATE_MS        100   // 100 ms ⇒ 10 Hz

// โหมด “เก็บให้ครบ N ตัวอย่างดี”
#define TARGET_GOOD_SAMPLES 30

// ================== UI Const ==================
#define BTN_W 140
#define BTN_H 70
#define BTN_RADIUS 15
// ★ กดง่ายขึ้น
#define TOUCH_MARGIN 50  // เพิ่มจาก 32 เป็น 50 เพื่อให้กดง่ายขึ้น

// สี
#define COLOR_PRIMARY   0x1B9E
#define COLOR_SECONDARY 0xF81F
#define COLOR_ACCENT    0x07E0
#define COLOR_WARNING   0xFD20
#define COLOR_DANGER    0xF800
#define COLOR_SUCCESS   0x07E0
#define COLOR_DARK      0x2104
#define COLOR_LIGHT     0xDEFB
#define COLOR_CARD_BG   0x2945

// ===== Soil contact detection (ใช้ความชื้น + ฮิสเทอรีซิส) =====
#define MOISTURE_ENTER_FAST 3
#define MOISTURE_EXIT_FAST  2

static bool g_soilContact = false;

// ตัดสินแบบ “สัญญาณใดๆ ก็ได้” เพื่อลด false-negative จากบางรุ่นที่ %RH ต่ำ
static bool fastSoilContact(float humPct, float ph, int n, int p, int k) {
  bool viaMoist = g_soilContact ? (humPct > MOISTURE_EXIT_FAST)
                                : (humPct >= MOISTURE_ENTER_FAST);
  bool viaNPK   = (n > 0 || p > 0 || k > 0);
  bool viaPH    = (!isnan(ph) && ph >= 3.0 && ph <= 10.0 && humPct >= 2.0);
  g_soilContact = (viaMoist || viaNPK || viaPH);
  return g_soilContact;
}

// ================== Wi-Fi ==================
String selectedSSID = "";
String wifiPassword = "";
String wifiStatus = "Not connected";
bool wifiConfigMode = true;  // เริ่มที่หน้า config Wi-Fi

// ฟังก์ชันลบ Wi-Fi credentials
void clearWiFiCredentials() {
  Serial.println("🗑️  Clearing saved Wi-Fi credentials...");
  WiFi.disconnect(true, true);  // ลบ credentials และ disconnect
  WiFi.mode(WIFI_OFF);
  delay(100);
  WiFi.mode(WIFI_STA);
  Serial.println("✅ Wi-Fi credentials cleared");
}

// ฟังก์ชันแสดง Wi-Fi credentials ที่เก็บไว้
void showSavedWiFiCredentials() {
  String savedSSID = WiFi.SSID();
  String savedPassword = WiFi.psk();
  
  Serial.println("📋 Saved Wi-Fi Credentials:");
  if (savedSSID.length() > 0) {
    Serial.println("📡 SSID: " + savedSSID);
    Serial.println("🔑 Password length: " + String(savedPassword.length()) + " characters");
    Serial.println("🔒 Password: " + String(savedPassword.length() > 0 ? "***" : "None"));
  } else {
    Serial.println("❌ No saved credentials");
  }
}

// ================== Firebase RTDB (REST) ==================
const char* FB_HOST = "tripbooking-ajtawan-default-rtdb.asia-southeast1.firebasedatabase.app"; // host only
String      FB_AUTH = ""; // ถ้ามี token ให้เติมเป็น "?auth=XXXX" (ปล่อยว่างได้ในเดโม)

// ================== Device Configuration ==================
// ★ ตั้งค่า device name ตามรูปแบบ esp32-soil-001 ถึง esp32-soil-999
const char* DEVICE_NAME = "esp32-soil-001"; // *** เปลี่ยนตามจริง ***
// ตัวอย่าง: "esp32-soil-001", "esp32-soil-002", "esp32-soil-999"

// ================== PostgreSQL API Configuration ==================
#define API_USE_TLS   1  // 0 = HTTP, 1 = HTTPS
// Dynamic API Host Discovery
String API_HOST = "";  // จะค้นหา IP แบบ dynamic
const char* API_HOST_FALLBACK = "soil-sensor-backend.onrender.com";   // Render URL (ไม่ใส่ :443)
const uint16_t API_PORT = 443;  // HTTPS port (ใช้สำหรับ internal only)
const char* API_PATH_HEALTH = "/health";     // Health check path
const char* API_PATH_MEAS = "/api/measurements";     // endpoint บันทึก measurement
const char* API_PATH_DEVICE_AUTH = "/api/devices/auth";  // endpoint device authentication
String API_BEARER = "";    // JWT token หลังจาก login
const char* DEVICE_API_KEY = "6d5d0986adbf76ceef8ae29b9fa395ba1d80d804debe5b32c7bb529b3b23119e";  // API Key จาก database

// บังคับให้อุปกรณ์ต้องถูก Admin enable ก่อนจึงเริ่มวัดได้
#define FB_ENFORCE_REGISTRATION 0  // ปิดการบังคับ registration เนื่องจากใช้ PostgreSQL

// ================== Fast Connect Configuration ==================
#define DEBUG_NETWORK 0  // 0 = Fast mode, 1 = Debug mode (ปิด network tests)
#define FAST_WIFI_CONNECT 1  // 1 = Fast WiFi connection, 0 = Normal mode
#define WIFI_CONNECT_TIMEOUT 5000  // 5 seconds timeout for WiFi connection
#define HTTP_TIMEOUT_FAST 2000  // 2 seconds for HTTP requests
#define HTTP_CONNECT_TIMEOUT_FAST 1000  // 1 second for HTTP connection

WiFiClientSecure fbClient;

// ค่าอ่านจากหลังบ้าน (ปล่อยว่าง เดี๋ยวฟังก์ชันจะ fallback ให้)
String g_deviceName = "";
String g_userName   = "";
bool   g_deviceEnabled = true;  // ตั้งเป็น true เป็นค่าเริ่มต้น

// ★ พิกัดอุปกรณ์ (เผื่อรับจากภายนอก/จัดเก็บแนบประวัติ)
float g_lat = NAN, g_lon = NAN;

// ================== GPS Variables ==================
float g_alt = 0.0;      // GPS Altitude
int g_satellites = 0;   // Number of satellites
bool g_gpsValid = false; // GPS data valid flag
String g_gpsTime = "";  // GPS time string
extern int wifiScrollIndex;
// ================== GPS Functions ==================
void initGPS() {
  Serial1.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("🛰️ GPS Module initialized on Serial1, pins " + String(GPS_RX_PIN) + " (RX) and " + String(GPS_TX_PIN) + " (TX)");
}

void readGPS() {
  if (Serial1.available()) {
    String gpsData = Serial1.readStringUntil('\n');
    
    // Parse NMEA sentences
    if (gpsData.startsWith("$GPGGA")) {
      parseGPGGA(gpsData);
    } else if (gpsData.startsWith("$GPRMC")) {
      parseGPRMC(gpsData);
    }
  }
}

void parseGPGGA(String data) {
  // Parse GPGGA sentence for position and satellite info
  int commaCount = 0;
  int start = 0;
  int end = 0;
  
  String fields[15];
  int fieldIndex = 0;
  
  for (int i = 0; i < data.length() && fieldIndex < 15; i++) {
    if (data.charAt(i) == ',') {
      fields[fieldIndex] = data.substring(start, i);
      start = i + 1;
      fieldIndex++;
    }
  }
  
  if (fieldIndex >= 14) {
    // Extract latitude
    if (fields[2].length() > 0 && fields[3].length() > 0) {
      float latDeg = fields[2].substring(0, 2).toFloat();
      float latMin = fields[2].substring(2).toFloat();
      g_lat = latDeg + (latMin / 60.0);
      if (fields[3] == "S") g_lat = -g_lat;
    }
    
    // Extract longitude
    if (fields[4].length() > 0 && fields[5].length() > 0) {
      float lonDeg = fields[4].substring(0, 3).toFloat();
      float lonMin = fields[4].substring(3).toFloat();
      g_lon = lonDeg + (lonMin / 60.0);
      if (fields[5] == "W") g_lon = -g_lon;
    }
    
    // Extract altitude
    if (fields[9].length() > 0) {
      g_alt = fields[9].toFloat();
    }
    
    // Extract satellite count
    if (fields[7].length() > 0) {
      g_satellites = fields[7].toInt();
    }
    
    // Check if GPS is valid
    g_gpsValid = (fields[6].toInt() > 0 && g_satellites >= 3);
    
    if (g_gpsValid) {
      Serial.printf("🛰️ GPS: Lat=%.6f, Lon=%.6f, Alt=%.1fm, Sats=%d\n", 
                    g_lat, g_lon, g_alt, g_satellites);
    } else {
      Serial.printf("🛰️ GPS: Searching... Sats=%d, Valid=%s\n", 
                    g_satellites, g_gpsValid ? "YES" : "NO");
    }
  }
}

void parseGPRMC(String data) {
  // Parse GPRMC sentence for time info
  int commaCount = 0;
  int start = 0;
  
  for (int i = 0; i < data.length(); i++) {
    if (data.charAt(i) == ',') {
      commaCount++;
      if (commaCount == 1) { // Time field
        g_gpsTime = data.substring(start, i);
        break;
      }
      start = i + 1;
    }
  }
}

void displayGPSInfo() {
  Serial.println("=== GPS Information ===");
  Serial.println("Valid: " + String(g_gpsValid ? "YES" : "NO"));
  Serial.println("Latitude: " + String(g_lat, 6));
  Serial.println("Longitude: " + String(g_lon, 6));
  Serial.println("Altitude: " + String(g_alt, 1) + "m");
  Serial.println("Satellites: " + String(g_satellites));
  Serial.println("Time: " + g_gpsTime);
  Serial.println("======================");
}

// ================== Wi-Fi Reset Helper (NEW) ==================
static void wifiReset() {
  Serial.println("=== Wi-Fi Reset ===");
  
  // ไม่จำ AP/ไม่เชื่อมเอง
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);

  // ตัดการเชื่อมและลืม AP เดิม
  WiFi.disconnect(true /*wifioff*/, true /*eraseAP*/);
  delay(200);

  // กลับสู่โหมด STA พร้อมสแกนใหม่
  WiFi.mode(WIFI_STA);

  // เคลียร์สถานะ UI/ตัวแปร
  wifiStatus    = "Not connected";
  selectedSSID  = "";
  wifiPassword  = "";
  wifiScrollIndex = 0;
  
  Serial.println("Wi-Fi reset completed");
}

// Wi-Fi diagnostic function
static void wifiDiagnostic() {
  Serial.println("=== Wi-Fi Diagnostic ===");
  Serial.println("WiFi Status: " + String(WiFi.status()));
  Serial.println("SSID: " + WiFi.SSID());
  Serial.println("IP Address: " + WiFi.localIP().toString());
  Serial.println("Gateway: " + WiFi.gatewayIP().toString());
  Serial.println("DNS: " + WiFi.dnsIP().toString());
  Serial.println("MAC Address: " + WiFi.macAddress());
  Serial.println("Signal Strength: " + String(WiFi.RSSI()) + " dBm");
  Serial.println("Channel: " + String(WiFi.channel()));
  Serial.println("BSSID: " + WiFi.BSSIDstr());
  Serial.println("========================");
}

// ================== State ==================
bool needsFullRedraw = true;
bool needsTimeRedraw = false;
bool needsWifiRedraw = false;
unsigned long lastTouchTime = 0;

// หน้าจอเพิ่มเติม
bool onHistoryPage = false;
bool onResultsPage = false;   // หน้าแสดงผลลัพธ์หลังวัด
bool onWiFiScanPage = false;  // หน้าสแกน Wi-Fi
bool onKeyboardPage = false;  // หน้าแป้นพิมพ์

// ================== History ==================
#define MAX_HISTORY 15
#define MAX_WIFI_NETWORKS 20
struct HistoryEntry {
  const char* plot;
  String time;
  float temp;
  float ph;
  int n, p, k;
  int moisture;  // %
  // ★ เก็บพิกัดต่อรายการ (กันเหนียว)
  float lat;
  float lon;
};
HistoryEntry historyData[MAX_HISTORY];
int historyCount = 0;
int currentIndex = 0;

// Wi-Fi Networks
struct WiFiNetwork {
  String ssid;
  int rssi;
  bool encrypted;
};
WiFiNetwork wifiNetworks[MAX_WIFI_NETWORKS];
int wifiNetworkCount = 0;
int wifiScrollIndex = 0;

// Double-tap system for Wi-Fi selection
int selectedWiFiIndex = -1;  // -1 = ไม่มีที่เลือก, 0+ = index ที่เลือก
unsigned long lastWiFiTapTime = 0;
#define DOUBLE_TAP_TIMEOUT 2000  // 2 วินาที

// ================== Latest values (จาก 6-in-1) ==================
float lastTemp = NAN;
float lastPh = NAN;
int   lastN = 0, lastP = 0, lastK = 0, lastMoisture = 0;

// ================== Online flags ==================
bool soilSensor_online = false;
bool apiConnected = false;  // สถานะการเชื่อมต่อ PostgreSQL API

// ================== Clock ==================
unsigned long lastTimeUpdate = 0;
char timeStr[9];

// ================== RS485 Debug ==================
#define DEBUG_RS485 1

// ============ NPK mapping lock (ลดดีเลย์/แกว่ง) ============
static bool    g_npk_locked = false;
static uint8_t g_npk_func   = 0x00;
static uint16_t g_npk_start = 0x0000;

// ================== BUZZER (สำหรับบัซเซอร์ 2 สาย: ดำ=GND, แดง=GPIO) ==================
#define BUZZER_ENABLED 1
#define BUZZER_PIN     14
#define BUZZ_HZ        2500    // โทนหลัก (Active จะดังโทนนี้เสมอ/หรือใกล้เคียง)
#define BUZZ_IS_ACTIVE 1       // 1 = Active buzzer / 0 = Passive

#if BUZZER_ENABLED
static inline void buzzerInit() { pinMode(BUZZER_PIN, OUTPUT); digitalWrite(BUZZER_PIN, LOW); }
static void buzzerTone(unsigned int freq, unsigned long ms) {
  if (ms == 0) return;
  if (BUZZ_IS_ACTIVE) { digitalWrite(BUZZER_PIN, HIGH); delay(ms); digitalWrite(BUZZER_PIN, LOW); return; }
  if (freq == 0) { delay(ms); return; }
  unsigned long half = 1000000UL / (freq * 2UL);
  unsigned long cycles = (ms * 1000UL) / (half * 2UL);
  for (unsigned long i = 0; i < cycles; ++i) { digitalWrite(BUZZER_PIN, HIGH); delayMicroseconds(half); digitalWrite(BUZZER_PIN, LOW); delayMicroseconds(half); }
}
static inline void buzzerOn () { digitalWrite(BUZZER_PIN, HIGH); }
static inline void buzzerOff() { digitalWrite(BUZZER_PIN, LOW);  }
static void buzzerBeep(int onMs=70, int offMs=40, int repeat=1, int freq=BUZZ_HZ) {
  for (int i = 0; i < repeat; i++) { buzzerTone(freq, onMs); if (offMs > 0) delay(offMs); }
}
struct BuzzNote { int freq; int durMs; };
static void buzzerPlay(const BuzzNote* seq, int count, int gapMs=20) {
  for (int i = 0; i < count; ++i) { int f = (BUZZ_IS_ACTIVE ? BUZZ_HZ : (seq[i].freq > 0 ? seq[i].freq : BUZZ_HZ)); int d = max(0, seq[i].durMs); if (d > 0) buzzerTone(f, d); if (gapMs > 0 && i < count-1) delay(gapMs); }
}
static inline void buzzerPattern_ok()    { buzzerBeep(80, 60, 2); }
static inline void buzzerPattern_error() { buzzerBeep(220, 120, 2); }
static inline void buzzerPattern_warn()  { buzzerBeep(70, 50, 3); }
static inline void buzzerPattern_start() { buzzerBeep(90, 0, 1); }
static inline void buzzerPattern_online(){ buzzerBeep(60, 40, 2); }
static inline void buzzerReady()  { }
static inline void buzzerOnline() { buzzerPattern_online(); }
static inline void buzzerDone()   { buzzerPattern_ok(); }
#else
static inline void buzzerInit() {}
static inline void buzzerTone(unsigned int, unsigned long) {}
static inline void buzzerOn() {}
static inline void buzzerOff() {}
static inline void buzzerBeep(int=70,int=40,int=1,int=BUZZ_HZ) {}
static inline void buzzerReady() {}
static inline void buzzerOnline() {}
static inline void buzzerDone() {}
static inline void buzzerPattern_ok() {}
static inline void buzzerPattern_error() {}
static inline void buzzerPattern_warn() {}
static inline void buzzerPattern_start() {}
#endif

// ===== Forward Declarations (กันพังเรื่องลำดับประกาศ) =====
void showHistoryPage();
void drawResultsPage();
void drawHistoryTable();
void drawNavButton(int x,int y,int w,int h,uint16_t color,const char* text);
void drawHomePage();
void updateHomePage();
void showSplashScreen();
void showWiFiScanPage();
void showKeyboardPage(const String& ssid);
void handleTouch(uint16_t x, uint16_t y);
void updateTime();
bool probeSoilSensor(bool updateValues, uint16_t timeoutMs = 600);
void drawRibbonHeader(const char* title, const char* subtitle);
void drawChip(int x, int y, const String& text, uint16_t color);
void drawMetricTile(int x, int y, int w, int h,
                    const char* title, const String& value, const char* unit,
                    uint16_t frameColor, uint16_t glowColor,
                    const char* icon);
void drawLegendBar();
static String fmtLatLon(float lat, float lon);

// ===== PostgreSQL API Functions =====
bool apiLoginAndGetToken();
bool apiPostMeasurement(float temperature, float moisture, float ph, 
                       float phosphorus, float potassium, float nitrogen);
String buildApiUrl(const char* path);

// ===== New Fast API Functions =====
bool apiHealthCheck_min();
bool apiPostHeartbeat();
String makeUrl(const char* path);
String makeHeartbeatUrl(const char* deviceName);

// ===== Missing Functions =====
bool inBox(uint16_t x, uint16_t y, uint16_t x1, uint16_t y1, uint16_t w, uint16_t h);
void buttonPressAnimation(uint16_t x, uint16_t y, uint16_t w, uint16_t h, uint16_t color);

// ===== Simple JSON Functions (ไม่ต้องใช้ ArduinoJson library) =====
String extractJsonValue(const String& json, const String& key);
String createMeasurementJson(float temperature, float moisture, float ph, 
                           float phosphorus, float potassium, float nitrogen);

// ===== Device Management Functions =====
void displayDeviceInfo();
bool validateDeviceName(const char* deviceName);
String getDeviceTypeFromName(const char* deviceName);

void readAndDisplaySensors();  // จะนิยามหลังจาก helper ใหม่เพื่อไม่ต้องใช้ extern
void drawSensorReadingPage(unsigned long startTime, unsigned long duration);
void updateSensorProgressBySamples(int progress);
void updateSensorProgressBySamplesF(float progress);

// ปิดการยิง PATCH ระหว่างกำลังวัดเพื่อความไว (เปิดเป็น 1 ถ้าอยากส่ง)
#define LIVE_PATCH_DURING_MEASURE 0
// ===== Firebase helpers =====
String jsonEscape(const String& s);
bool fbGETDeviceProfile();
bool fbPatchLive(float tempC, float ph, int moist, int n, int p, int k, int progress);
bool fbPostFinal(float tempC, float ph, int moist, int n, int p, int k);

// ★★ โปรโตไทป์ (ให้คอมไพเลอร์รู้จักก่อน) ★★
bool rs485ReadNPK_legacy(int &outN, int &outP, int &outK,
                         uint8_t slaveId = SENSOR_ID,
                         uint16_t timeoutMs = 800);
static bool rs485ReadNPK_fastPreferLocked(int &outN, int &outP, int &outK,
                                          uint8_t slaveId = SENSOR_ID,
                                          uint16_t timeoutMs = 70);
static bool fbGETOnce(const String& path, String& outBody);
static bool fbGETFromPaths(const String paths[], size_t n, String& outBody, String& usedPath);
static void fbRefreshProfileIfDue();
static void fbSendHeartbeatIfDue();

// ------------------ CRC16 (Modbus) ------------------
uint16_t modbusCRC(const uint8_t *buf, uint16_t len) {
  uint16_t crc = 0xFFFF;
  for (uint16_t pos = 0; pos < len; pos++) {
    crc ^= (uint16_t)buf[pos];
    for (int i = 0; i < 8; i++) { if (crc & 0x0001) { crc >>= 1; crc ^= 0xA001; } else { crc >>= 1; } }
  }
  return crc;
}

static void dumpHex(const char* tag, const uint8_t* buf, int len) {
#if DEBUG_RS485
  Serial.print(tag); Serial.print(" ["); Serial.print(len); Serial.print("] ");
  for (int i=0;i<len;i++){ if (buf[i]<16) Serial.print('0'); Serial.print(buf[i],HEX); Serial.print(' ');}
  Serial.println();
#endif
}

// ★★★ จังหวะ TX→RX เร็วแบบที่ทดสอบผ่าน ★★★
static void rs485_txrx(const uint8_t* req, int reqLen, uint8_t* resp, int& respLen, uint32_t /*baud*/, uint16_t timeoutMs) {
  while (Serial2.available()) Serial2.read();   // เคลียร์บัฟเฟอร์รับ
  digitalWrite(RS485_DE_RE, HIGH);              // โหมดส่ง
  delayMicroseconds(2000);
  Serial2.write(req, reqLen);
  Serial2.flush();
  delayMicroseconds(2000);
  digitalWrite(RS485_DE_RE, LOW);               // โหมดรับ
#if DEBUG_RS485
  dumpHex("TX", req, reqLen);
#endif
  unsigned long t0 = millis();
  int idx = 0;
  while (millis() - t0 < timeoutMs) {
    while (Serial2.available()) { if (idx < respLen) resp[idx++] = Serial2.read(); else (void)Serial2.read(); }
    delay(1);
  }
  respLen = idx;
#if DEBUG_RS485
  dumpHex("RX", resp, respLen);
#endif
}

// อ่านครบ 6-in-1: %RH/moisture, °C, (EC), pH, N, P, K
// ★ ตัด EC ออก: ไม่ส่งคืน, ไม่โชว์
bool rs485ReadAll(float& humPct, float& tempC, float& ph,
                  int& n, int& p, int& k,
                  uint8_t slaveId = SENSOR_ID,
                  uint16_t timeoutMs = 500) {
  const uint16_t startReg = 0x0000;
  const uint16_t regCount = 0x0007; // 7 regs => 14 data bytes
  for (uint8_t funcTry = 0; funcTry < 2; funcTry++) {
    uint8_t func = (funcTry==0) ? 0x03 : 0x04;

    uint8_t req[8];
    req[0]=slaveId; req[1]=func;
    req[2]=(startReg>>8)&0xFF; req[3]=startReg&0xFF;
    req[4]=(regCount>>8)&0xFF; req[5]=regCount&0xFF;
    uint16_t crc = modbusCRC(req, 6);
    req[6]=crc & 0xFF; req[7]=(crc>>8)&0xFF;

    uint8_t resp[40]; int rlen = sizeof(resp);
    rs485_txrx(req, 8, resp, rlen, SENSOR_RS485_BAUD, timeoutMs);

    if (rlen < 19) continue;
    if (resp[0] != slaveId) continue;
    if (resp[1] == (func | 0x80)) continue;
    if (resp[2] != 14) continue;

    uint16_t rcrc = ((uint16_t)resp[rlen-1] << 8) | resp[rlen-2];
    uint16_t ccrc = modbusCRC(resp, rlen-2);
    if (rcrc != ccrc) continue;
    if (resp[1] != func) continue;

    auto W = [&](int off){ return (uint16_t)resp[3+off*2] << 8 | resp[4+off*2]; };
    uint16_t H  = W(0);   // *10
    uint16_t T  = W(1);   // *10
    /*uint16_t ECv= W(2);*/  // ไม่ใช้
    uint16_t PHv= W(3);   // *10
    uint16_t NN = W(4);
    uint16_t PP = W(5);
    uint16_t KK = W(6);

    humPct = H / 10.0f;
    tempC  = T / 10.0f;
    ph     = PHv / 10.0f;
    n = NN; p = PP; k = KK;
    return true;
  }
  return false;
}

// อ่าน NPK แบบไว: ถ้าเคยล็อก mapping แล้ว ใช้จุดเดิมทันที (read3 ครั้งเดียว)
static bool rs485ReadNPK_fastPreferLocked(int &outN, int &outP, int &outK,
                                          uint8_t slaveId,
                                          uint16_t timeoutMs) {
  if (g_npk_locked) {
    uint8_t req[8];
    req[0]=slaveId; req[1]=g_npk_func;
    req[2]=(g_npk_start>>8)&0xFF; req[3]=g_npk_start&0xFF;
    req[4]=0x00; req[5]=0x03; // 3 regs
    uint16_t crc = modbusCRC(req, 6); req[6]=crc & 0xFF; req[7]=crc>>8;

    uint8_t resp[32]; int rlen = sizeof(resp);
    rs485_txrx(req, 8, resp, rlen, SENSOR_RS485_BAUD, timeoutMs);
    if (rlen < 11) return false;

    uint16_t rcrc = ((uint16_t)resp[rlen-1] << 8) | resp[rlen-2];
    uint16_t ccrc = modbusCRC(resp, rlen-2);
    if (rcrc!=ccrc || resp[0]!=slaveId) return false;
    if (!(resp[1]==g_npk_func && resp[2] >= 6)) return false;

    outN = ((uint16_t)resp[3] << 8) | resp[4];
    outP = ((uint16_t)resp[5] << 8) | resp[6];
    outK = ((uint16_t)resp[7] << 8) | resp[8];
    return true;
  } else {
    return rs485ReadNPK_legacy(outN, outP, outK, slaveId, timeoutMs);
  }
}

// Legacy: NPK only @0x001E (0x03)
bool rs485ReadNPK_legacy(int &outN, int &outP, int &outK,
                         uint8_t slaveId,
                         uint16_t timeoutMs) {
  const uint16_t startReg = 0x001E;
  const uint16_t regCount = 0x0003;

  uint8_t req[8];
  req[0]=slaveId; req[1]=0x03;
  req[2]=(startReg>>8)&0xFF; req[3]=startReg&0xFF;
  req[4]=(regCount>>8)&0xFF; req[5]=regCount&0xFF;
  uint16_t crc = modbusCRC(req, 6);
  req[6]=crc & 0xFF; req[7]=crc>>8;

  uint8_t resp[32]; int rlen = sizeof(resp);
  rs485_txrx(req, 8, resp, rlen, SENSOR_RS485_BAUD, timeoutMs);

  if (rlen < 11) return false;
  uint16_t rcrc = ((uint16_t)resp[rlen-1] << 8) | resp[rlen-2];
  uint16_t ccrc = modbusCRC(resp, rlen-2);
  if (rcrc != ccrc) return false;
  if (resp[0] != slaveId || resp[1] != 0x03) return false;
  if (resp[2] < 6) return false;

  uint16_t nRaw = ((uint16_t)resp[3] << 8) | resp[4];
  uint16_t pRaw = ((uint16_t)resp[5] << 8) | resp[6];
  uint16_t kRaw = ((uint16_t)resp[7] << 8) | resp[8];
  outN = (int)nRaw; outP = (int)pRaw; outK = (int)kRaw;
  return true;
}

// ลองหลาย mapping + โหมด "เลือกชุดที่ non-zero มากที่สุด" + LOCK
bool rs485ReadNPK_smart(int &outN, int &outP, int &outK,
                        uint8_t slaveId = SENSOR_ID,
                        uint16_t timeoutMs = 800) {
  auto read3 = [&](uint8_t func, uint16_t start,
                   uint16_t &a, uint16_t &b, uint16_t &c)->bool {
    uint8_t req[8];
    req[0]=slaveId; req[1]=func;
    req[2]=start>>8; req[3]=start&0xFF;
    req[4]=0x00;     req[5]=0x03;
    uint16_t crc = modbusCRC(req,6); req[6]=crc&0xFF; req[7]=crc>>8;

    uint8_t resp[32]; int rlen = sizeof(resp);
    rs485_txrx(req, 8, resp, rlen, SENSOR_RS485_BAUD, timeoutMs);
    if (rlen < 11) return false;

    uint16_t rcrc = ((uint16_t)resp[rlen-1] << 8) | resp[rlen-2];
    uint16_t ccrc = modbusCRC(resp, rlen-2);
    if (rcrc!=ccrc || resp[0]!=slaveId) return false;
    if (!(resp[1]==func && resp[2] >= 6)) return false;

    a = ((uint16_t)resp[3] << 8) | resp[4];
    b = ((uint16_t)resp[5] << 8) | resp[6];
    c = ((uint16_t)resp[7] << 8) | resp[8];
#if DEBUG_RS485
    Serial.printf("NPK via start=0x%04X func=0x%02X -> %u,%u,%u\n", start, func, a,b,c);
#endif
    return true;
  };

  auto plausible = [&](uint16_t a, uint16_t b, uint16_t c)->bool {
    return (a<=5000 && b<=5000 && c<=5000);
  };
  auto nonzeroCount = [&](uint16_t a, uint16_t b, uint16_t c)->int {
    return (a>0) + (b>0) + (c>0);
  };

  if (g_npk_locked) {
    uint16_t a=0,b=0,c=0;
    if (read3(g_npk_func, g_npk_start, a,b,c) && plausible(a,b,c)) {
      outN=a; outP=b; outK=c;
      return true;
    }
  }

  bool haveBest = false;
  uint8_t bestFunc = 0;
  uint16_t bestStart = 0, ba=0, bb=0, bc=0;
  int bestScore = -1;

  auto consider = [&](uint8_t func, uint16_t start, uint16_t a, uint16_t b, uint16_t c){
    if (!plausible(a,b,c)) return;
    int score = nonzeroCount(a,b,c);
    if (score > bestScore) { bestScore = score; bestFunc = func; bestStart = start; ba=a; bb=b; bc=c; haveBest = true; }
  };

  // 1) legacy 0x001E / 0x03
  {
    int tn=0,tp=0,tk=0;
    if (rs485ReadNPK_legacy(tn,tp,tk, slaveId, timeoutMs)) {
      consider(0x03, 0x001E, tn,tp,tk);
      if (bestScore == 3) { outN=tn; outP=tp; outK=tk; g_npk_locked=true; g_npk_func=0x03; g_npk_start=0x001E; return true; }
    }
  }
#if DEBUG_RS485
  Serial.println("… 0x001E ยังไม่ครบ ลองจุดอื่นต่อ");
#endif

  // 2) โฟกัสใกล้ 0x0007 ทั้ง 0x04/0x03
  const uint8_t funcs1[] = {0x04, 0x03};
  for (uint8_t fi=0; fi<2; ++fi) {
    for (uint16_t base=0x0006; base<=0x000A; ++base) {
      uint16_t a=0,b=0,c=0;
      if (read3(funcs1[fi], base, a,b,c)) {
        consider(funcs1[fi], base, a,b,c);
        if (bestScore == 3) { outN=ba; outP=bb; outK=bc; g_npk_locked=true; g_npk_func=funcs1[fi]; g_npk_start=base; return true; }
      }
    }
  }

  // 3) จุดอื่น ๆ
  const uint16_t starts2[] = {0x0004, 0x002C, 0x0030, 0x001E};
  for (uint8_t fi=0; fi<2; ++fi) {
    for (uint8_t si=0; si<sizeof(starts2)/sizeof(starts2[0]); ++si) {
      uint16_t a=0,b=0,c=0;
      if (read3(funcs1[fi], starts2[si], a,b,c)) {
        consider(funcs1[fi], starts2[si], a,b,c);
        if (bestScore == 3) { outN=ba; outP=bb; outK=bc; g_npk_locked=true; g_npk_func=funcs1[fi]; g_npk_start=starts2[si]; return true; }
      }
    }
  }

  // 4) brute-scan สั้น ๆ 0x0000..0x0040
  for (uint8_t fi=0; fi<2; ++fi) {
    for (uint16_t base=0x0000; base<=0x0040; ++base) {
      uint16_t a=0,b=0,c=0;
      if (read3(funcs1[fi], base, a,b,c)) {
        consider(funcs1[fi], base, a,b,c);
        if (bestScore == 3) { outN=ba; outP=bb; outK=bc; g_npk_locked=true; g_npk_func=funcs1[fi]; g_npk_start=base; return true; }
      }
    }
  }

  if (haveBest && bestScore >= 1) {
    outN = (int)ba; outP = (int)bb; outK = (int)bc;
    g_npk_locked = true; g_npk_func = bestFunc; g_npk_start = bestStart;
#if DEBUG_RS485
    Serial.printf("✔ Lock NPK @0x%04X func 0x%02X\n", g_npk_start, g_npk_func);
#endif
    return true;
  }

#if DEBUG_RS485
  Serial.println("✗ ยังหาเรจิสเตอร์ NPK ไม่เจอ");
#endif
  return false;
}

// ===== Helper แสดงค่า =====
String fmtNPK(int v) { return (v > 0) ? (String(v) + " mg/kg") : String("—"); }
// แสดง NPK ไลฟ์เสมอ (แม้ค่าเป็น 0 ก็พิมพ์ 0 mg/kg)
String fmtNPK_live(int v) { return String(v) + " mg/kg"; }
String fmtN0 (int v) { return (v > 0) ? String(v) : String("—"); }

// ===== API Server Discovery Function =====
String discoverAPIServer() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi not connected for API discovery");
    return API_HOST_FALLBACK;
  }
  
  Serial.println("🔍 Discovering API Server...");
  Serial.println("  - ESP32 IP: " + WiFi.localIP().toString());
  Serial.println("  - ESP32 Gateway: " + WiFi.gatewayIP().toString());
  Serial.println("  - ESP32 Subnet: " + WiFi.subnetMask().toString());
  String networkType = "Unknown";
  if (WiFi.localIP().toString().startsWith("192.168")) {
    networkType = "Home Network";
  } else if (WiFi.localIP().toString().startsWith("10.")) {
    networkType = "Office/Mobile Network";
  } else if (WiFi.localIP().toString().startsWith("172.")) {
    networkType = "Corporate Network";
  }
  Serial.println("  - Network Type: " + networkType);
  
  // สร้าง IP range จาก ESP32 IP
  IPAddress esp32IP = WiFi.localIP();
  IPAddress gateway = WiFi.gatewayIP();
  
  // ทดสอบ IP ที่เป็นไปได้ (ครอบคลุมทุก network)
  String testIPs[] = {
    "172.16.0.241",   // PC Server IP (Priority)
    "172.16.0.1",     // PC Network Gateway
    "172.16.0.100",   // PC Network
    "172.16.0.200",   // PC Network
    gateway.toString(),  // ESP32 Gateway IP
    WiFi.localIP().toString().substring(0, WiFi.localIP().toString().lastIndexOf('.')) + ".1",  // .1
    WiFi.localIP().toString().substring(0, WiFi.localIP().toString().lastIndexOf('.')) + ".2",  // .2
    WiFi.localIP().toString().substring(0, WiFi.localIP().toString().lastIndexOf('.')) + ".100", // .100
    WiFi.localIP().toString().substring(0, WiFi.localIP().toString().lastIndexOf('.')) + ".101", // .101
    WiFi.localIP().toString().substring(0, WiFi.localIP().toString().lastIndexOf('.')) + ".200", // .200
    WiFi.localIP().toString().substring(0, WiFi.localIP().toString().lastIndexOf('.')) + ".254", // .254
    "192.168.1.1",    // Common home router
    "192.168.1.100",  // Common home network
    "192.168.1.200",  // Common home network
    "192.168.0.1",    // Common home router
    "192.168.0.100",  // Common home network
    "192.168.0.200",  // Common home network
    "10.0.0.1",       // Common office router
    "10.0.0.100",     // Common office network
    "10.0.0.200",     // Common office network
    "10.197.169.7",   // ESP32 Gateway
    "10.197.169.1",   // ESP32 Network
    "10.197.169.100", // ESP32 Network
    "10.197.169.200"  // ESP32 Network
  };
  
  // ทดสอบ IP แบบเร็ว (ลด timeout) - เริ่มจาก IP ที่น่าจะถูก
  Serial.println("  - Testing priority IPs first...");
  
  // ทดสอบ IP ที่น่าจะถูกก่อน (Gateway, .1, .100)
  int priorityIndices[] = {0, 1, 2, 3, 4, 5, 6}; // Gateway, .1, .2, .100, .101, .200, .254
  
  for (int j = 0; j < 7; j++) {
    int i = priorityIndices[j];
    Serial.println("  - Testing: " + testIPs[i] + ":" + String(API_PORT));
    
    HTTPClient http;
    String url = "http://" + testIPs[i] + ":" + String(API_PORT) + "/health";
    http.begin(url);
    http.setTimeout(2000);  // ลด timeout
    http.setConnectTimeout(1000);  // ลด connect timeout
    http.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
    http.addHeader("Connection", "close");
    
    int code = http.GET();
    Serial.println("    Result: " + String(code));
    
    if (code == 200) {
      Serial.println("✅ Found API Server at: " + testIPs[i]);
      Serial.println("💾 Saving API Server IP for future use...");
      http.end();
      return testIPs[i];
    }
    
    http.end();
    delay(50); // ลดหน่วงเวลา
  }
  
  // ทดสอบ IP อื่น ๆ
  Serial.println("  - Testing other IPs...");
  for (int i = 7; i < 25; i++) {
    Serial.println("  - Testing: " + testIPs[i] + ":" + String(API_PORT));
    
    HTTPClient http;
    String url = "http://" + testIPs[i] + ":" + String(API_PORT) + "/health";
    http.begin(url);
    http.setTimeout(2000);  // ลด timeout
    http.setConnectTimeout(1000);  // ลด connect timeout
    http.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
    http.addHeader("Connection", "close");
    
    int code = http.GET();
    Serial.println("    Result: " + String(code));
    
    if (code == 200) {
      Serial.println("✅ Found API Server at: " + testIPs[i]);
      Serial.println("💾 Saving API Server IP for future use...");
      http.end();
      return testIPs[i];
    }
    
    http.end();
    delay(50); // ลดหน่วงเวลา
  }
  
  Serial.println("❌ No API Server found, using fallback: " + String(API_HOST_FALLBACK));
  return API_HOST_FALLBACK;
}

// ===== Health Check Function =====
bool apiHealthCheck() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi not connected for health check");
    return false;
  }
  
  // ค้นหา API Server ถ้ายังไม่ได้ (ชั่วคราวใช้ Fallback โดยตรง)
  if (API_HOST.length() == 0) {
    API_HOST = API_HOST_FALLBACK;   // ใช้ค่า Fallback โดยตรง
    Serial.println("🔧 Using fallback IP: " + API_HOST);
  Serial.println("🌐 Network Configuration:");
  Serial.println("   - ESP32 IP: " + WiFi.localIP().toString());
  Serial.println("   - ESP32 Gateway: " + WiFi.gatewayIP().toString());
  Serial.println("   - ESP32 DNS: " + WiFi.dnsIP().toString());
  Serial.println("   - Target API: " + API_HOST + ":" + String(API_PORT));
  String networkType = "Unknown";
  if (WiFi.localIP().toString().startsWith("192.168")) {
    networkType = "Home";
  } else if (WiFi.localIP().toString().startsWith("10.")) {
    networkType = "Office/Mobile";
  } else if (WiFi.localIP().toString().startsWith("172.")) {
    networkType = "Corporate";
  }
  Serial.println("   - Network Type: " + networkType);
  }
  
  Serial.println("🩺 Testing API Health Check...");
  Serial.println("  - ESP32 IP: " + WiFi.localIP().toString());
  Serial.println("  - ESP32 Gateway: " + WiFi.gatewayIP().toString());
  Serial.println("  - ESP32 DNS: " + WiFi.dnsIP().toString());
  Serial.println("  - ESP32 Subnet: " + WiFi.subnetMask().toString());
  Serial.println("  - API Host: " + API_HOST + ":" + String(API_PORT));
  
  HTTPClient http;
  String url = (API_USE_TLS ? "https://" : "http://") + API_HOST + ":" + String(API_PORT) + String(API_PATH_HEALTH);
  Serial.println("  - API URL: " + url);
  http.begin(url);
  http.setTimeout(3000);  // ลด timeout
  http.setConnectTimeout(2000);  // ลด connect timeout
  http.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  http.addHeader("Connection", "close");
  http.addHeader("Accept", "application/json");
  
  int code = http.GET();
  Serial.println("  - HTTP Code: " + String(code));
  
  if (code > 0) {
    String response = http.getString();
    Serial.println("  - Response: " + response.substring(0, 100) + "...");
  }
  
  if (code == 200) { 
    apiConnected = true;
    Serial.println("✅ API health OK (200)");
  } else { 
    apiConnected = false;
    Serial.println("❌ API health BAD (" + String(code) + ")");
    if (code < 0) {
      Serial.println("  - Error: " + http.errorToString(code));
      Serial.println("  - Check if PC and ESP32 are on same network");
      Serial.println("  - Check if API_HOST IP is correct");
    }
  }
  
  http.end();
  
  // ทดสอบ Internet connectivity
  if (!apiConnected) {
    Serial.println("🌐 Testing Internet connectivity...");
    HTTPClient internetHttp;
    internetHttp.begin("http://httpbin.org/ip");
    internetHttp.setTimeout(5000);
    internetHttp.setConnectTimeout(3000);
    int internetCode = internetHttp.GET();
    Serial.println("  - Internet test: " + String(internetCode));
    if (internetCode == 200) {
      Serial.println("✅ Internet connection: OK");
    } else {
      Serial.println("❌ Internet connection: FAILED");
    }
    internetHttp.end();
  }
  
  return apiConnected;
}

// NEW: สแกนหา slave id เร็ว ๆ (timeout สั้น) ก่อนเริ่มวัด
static uint8_t detectSensorId(uint8_t defId = SENSOR_ID) {
  float h,t,pH; int n,p,k;
  if (rs485ReadAll(h,t,pH,n,p,k, defId, 70)) return defId;
  for (uint8_t id=1; id<=4; ++id) {
    if (id==defId) continue;
    if (rs485ReadAll(h,t,pH,n,p,k, id, 70)) return id;
  }
  return defId;
}

// ===== 🔥 NEW: ตัวช่วยเลือกค่าที่ “ดีกว่า” สำหรับ NPK =====
static inline bool npkPlausible(int n,int p,int k){
  return (n>=0 && n<=5000) && (p>=0 && p<=5000) && (k>=0 && k<=5000);
}
static inline int nzCount(int n,int p,int k){ return (n>0)+(p>0)+(k>0); }
static void pickBetterNPK(int &baseN,int &baseP,int &baseK, int candN,int candP,int candK){
  if (!npkPlausible(candN,candP,candK)) return;
  if (!npkPlausible(baseN,baseP,baseK)) { baseN=candN; baseP=candP; baseK=candK; return; }
  int b = nzCount(baseN,baseP,baseK);
  int c = nzCount(candN,candP,candK);
  if (c > b) { baseN=candN; baseP=candP; baseK=candK; }
  else if (c==b && b==0) { baseN=candN; baseP=candP; baseK=candK; }
}

// ===== Probe ช่วยอัปเดต online flag (บูต/ทุก 10 วิ/ก่อนวัด) =====
bool probeSoilSensor(bool updateValues, uint16_t timeoutMs) {
  float humPct, tempC, ph;
  int nVal=0, pVal=0, kVal=0;
  bool ok = rs485ReadAll(humPct, tempC, ph, nVal, pVal, kVal, SENSOR_ID, timeoutMs);
  bool prev = soilSensor_online;
  soilSensor_online = ok;

  if (ok && updateValues) {
    lastTemp     = tempC;
    lastPh       = ph;
    lastMoisture = (int)round(humPct);

    bool contact = fastSoilContact(humPct, ph, nVal, pVal, kVal);
    lastN = nVal; lastP = pVal; lastK = kVal;
    if (contact) {
      int sn=0, sp=0, sk=0;
      if (rs485ReadNPK_smart(sn,sp,sk, SENSOR_ID, 900)) {
        pickBetterNPK(lastN,lastP,lastK, sn,sp,sk);
      }
    }
  }
  if (prev != soilSensor_online) needsWifiRedraw = true;
  return ok;
}

// ================== Firebase helpers ==================
String jsonEscape(const String& s){
  String o; o.reserve(s.length()+4);
  for (size_t i=0;i<s.length();++i){
    char c=s[i];
    if(c=='"'||c=='\\') o+='\\', o+=c;
    else if(c=='\n') o+="\\n";
    else o+=c;
  }
  return o;
}

// --- Helper: GET once ---
static bool fbGETOnce(const String& path, String& outBody) {
  if (WiFi.status()!=WL_CONNECTED) return false;
  fbClient.setInsecure();
  fbClient.setTimeout(2000); // ลดจาก 5000 เป็น 2000

  String full = path + ".json";
  if (FB_AUTH.length()) full += "?auth=" + FB_AUTH;

  if (!fbClient.connect(FB_HOST, 443)) return false;
  fbClient.printf("GET %s HTTP/1.1\r\n", full.c_str());
  fbClient.printf("Host: %s\r\n", FB_HOST);
  fbClient.println("Connection: close\r\n");

  String line = fbClient.readStringUntil('\n');
  if (line.indexOf("200") < 0) { fbClient.stop(); return false; }
  while (line.length() > 2) line = fbClient.readStringUntil('\n');  // skip headers
  outBody = fbClient.readString();
  fbClient.stop();
  return true;
}

static String extractJsonString(const String& body, const char* key) {
  String k = "\"" + String(key) + "\"";
  int in = body.indexOf(k);
  if (in < 0) return "";
  int c  = body.indexOf(':', in);
  int q1 = body.indexOf('\"', c+1);
  int q2 = body.indexOf('\"', q1+1);
  if (q1 >= 0 && q2 > q1) return body.substring(q1+1, q2);
  return "";
}

// ✅ รองรับ true/1 และ "true"/"1" (รวม True/TRUE)
static bool extractBool(const String& body, const char* key) {
  String kTrue  = "\"" + String(key) + "\":true";
  String kOne   = "\"" + String(key) + "\":1";
  String kStrT  = "\"" + String(key) + "\":\"true\"";
  String kStr1  = "\"" + String(key) + "\":\"1\"";
  String kStrT2 = "\"" + String(key) + "\":\"True\"";
  String kStrT3 = "\"" + String(key) + "\":\"TRUE\"";
  if (body.indexOf(kTrue)  >= 0) return true;
  if (body.indexOf(kOne)   >= 0) return true;
  if (body.indexOf(kStrT)  >= 0) return true;
  if (body.indexOf(kStr1)  >= 0) return true;
  if (body.indexOf(kStrT2) >= 0) return true;
  if (body.indexOf(kStrT3) >= 0) return true;
  return false;
}

// 🔥 NEW: helper ลองหลาย path (devices/Devices และ /meta)
static bool fbGETFromPaths(const String paths[], size_t n, String& outBody, String& usedPath) {
  for (size_t i=0; i<n; ++i) {
    String body;
    if (fbGETOnce(paths[i], body) && body.length() > 1 && body != "null") {
      outBody = body;
      usedPath = paths[i];
      return true;
    }
  }
  return false;
}

// อ่านโปรไฟล์อุปกรณ์จาก /devices/{DEVICE_ID} หรือ /Devices/{DEVICE_ID} และ/หรือ /meta
bool fbGETDeviceProfile() {
  String body, used;
  const String pths[] = {
    "/devices/" + String(DEVICE_NAME),
    "/Devices/" + String(DEVICE_NAME),
    "/devices/" + String(DEVICE_NAME) + "/meta",
    "/Devices/" + String(DEVICE_NAME) + "/meta"
  };

  bool ok = fbGETFromPaths(pths, sizeof(pths)/sizeof(pths[0]), body, used);
  if (!ok) {
    Serial.println("fbGETDeviceProfile: not found in devices/Devices or meta - using defaults");
    g_deviceEnabled = true;  // ตั้งเป็น true เป็นค่าเริ่มต้น
    g_deviceName = String(DEVICE_NAME);
    g_userName   = String("—");
    return true;  // return true เพื่อให้ระบบทำงานต่อได้
  }

  bool enabled = extractBool(body, "enabled");
  String name  = extractJsonString(body, "name");
  if (name.length() == 0) name = extractJsonString(body, "deviceName");

  String user  = extractJsonString(body, "user");
  if (user.length() == 0) user = extractJsonString(body, "userName");

  String latS  = extractJsonString(body, "lat");
  String lonS  = extractJsonString(body, "lon");
  if (latS.length()) g_lat = latS.toFloat();
  if (lonS.length()) g_lon = lonS.toFloat();

  g_deviceEnabled = enabled;
  g_deviceName = name.length() ? name : String(DEVICE_NAME);
  g_userName   = user.length() ? user : String("—");

  Serial.printf("fbGETDeviceProfile OK via %s -> enabled=%d, name=%s, user=%s, lat=%.6f lon=%.6f\n",
                used.c_str(), (int)g_deviceEnabled, g_deviceName.c_str(), g_userName.c_str(),
                g_lat, g_lon);
  return true;
}

// Get device info from PostgreSQL API
bool apiGetDeviceInfo() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi not connected for device info");
    return false;
  }

  // Debug network info
  Serial.println("🌐 Network Debug Info:");
  Serial.println("  - WiFi Status: " + String(WiFi.status()));
  Serial.println("  - Local IP: " + WiFi.localIP().toString());
  Serial.println("  - Gateway: " + WiFi.gatewayIP().toString());
  Serial.println("  - DNS: " + WiFi.dnsIP().toString());
  Serial.println("  - RSSI: " + String(WiFi.RSSI()) + " dBm");
  
  // Test DNS resolution to API host
  Serial.println("🏓 Testing DNS resolution to API host...");
  IPAddress apiIP;
  if (WiFi.hostByName(API_HOST.c_str(), apiIP)) {
    Serial.println("  - API IP resolved: " + apiIP.toString());
  } else {
    Serial.println("  - Failed to resolve API host: " + String(API_HOST));
    Serial.println("  - Trying direct IP connection...");
  }
  
#if DEBUG_NETWORK
  // Test internet connectivity by resolving Google DNS
  Serial.println("🌐 Testing internet connectivity...");
  IPAddress googleDNS;
  if (WiFi.hostByName("8.8.8.8", googleDNS)) {
    Serial.println("  - Internet connectivity: OK");
  } else {
    Serial.println("  - Internet connectivity: FAILED");
  }
#endif
  
#if DEBUG_NETWORK
  // Test UDP connection to DNS server
  Serial.println("📡 Testing UDP connection to DNS server...");
  WiFiUDP udp;
  if (udp.begin(12345)) {
    Serial.println("  - UDP connection: OK");
    udp.stop();
  } else {
    Serial.println("  - UDP connection: FAILED");
  }
#endif
  
  // Test HTTP connection to a simple endpoint
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to simple endpoint...");
  HTTPClient simpleHttp;
  simpleHttp.begin("http://httpbin.org/get");
  simpleHttp.setTimeout(2000); // ลดจาก 5000 เป็น 2000
  simpleHttp.setConnectTimeout(1000); // ลดจาก 3000 เป็น 1000
  int simpleCode = simpleHttp.GET();
  Serial.println("  - Simple HTTP test: " + String(simpleCode));
  simpleHttp.end();
#endif
  
  // Test HTTP connection to Google
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to Google...");
  HTTPClient googleHttp;
  googleHttp.begin("http://www.google.com");
  googleHttp.setTimeout(2000); // ลดจาก 5000 เป็น 2000
  googleHttp.setConnectTimeout(1000); // ลดจาก 3000 เป็น 1000
  int googleCode = googleHttp.GET();
  Serial.println("  - Google HTTP test: " + String(googleCode));
  googleHttp.end();
#endif
  
  // Test HTTP connection to our API server
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to our API server...");
  HTTPClient apiHttp;
  apiHttp.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp.setTimeout(10000); // เพิ่ม timeout เป็น 10 วินาที
  apiHttp.setConnectTimeout(5000); // เพิ่ม connect timeout เป็น 5 วินาที
  apiHttp.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp.addHeader("Connection", "close");
  apiHttp.addHeader("Accept", "application/json");
  int apiCode = apiHttp.GET();
  Serial.println("  - API HTTP test: " + String(apiCode));
  if (apiCode > 0) {
    String response = apiHttp.getString();
    Serial.println("  - API Response: " + response);
  } else {
    Serial.println("  - API Error: " + apiHttp.errorToString(apiCode));
  }
  apiHttp.end();
  
  // Test simple connectivity
  Serial.println("🔍 Testing basic connectivity...");
  HTTPClient testHttp;
  testHttp.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  testHttp.setTimeout(5000);
  testHttp.setConnectTimeout(3000);
  int testCode = testHttp.GET();
  Serial.println("🔍 Basic connectivity test: " + String(testCode));
  if (testCode > 0) {
    String testResponse = testHttp.getString();
    Serial.println("🔍 Basic connectivity response: " + testResponse);
  } else {
    Serial.println("🔍 Basic connectivity error: " + testHttp.errorToString(testCode));
  }
  testHttp.end();
#endif
  
  // Test HTTP connection to our API server with different timeout
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to our API server (longer timeout)...");
  HTTPClient apiHttp2;
  apiHttp2.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp2.setTimeout(3000); // ลดจาก 10000 เป็น 3000
  apiHttp2.setConnectTimeout(3000); // ลดจาก 8000 เป็น 3000
  int apiCode2 = apiHttp2.GET();
  Serial.println("  - API HTTP test (longer timeout): " + String(apiCode2));
  apiHttp2.end();
#endif
  
  // Test HTTP connection to our API server with different approach
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to our API server (different approach)...");
  HTTPClient apiHttp3;
  apiHttp3.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp3.setTimeout(5000); // ลดจาก 15000 เป็น 5000
  apiHttp3.setConnectTimeout(10000);
  apiHttp3.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp3.addHeader("Connection", "close");
  int apiCode3 = apiHttp3.GET();
  Serial.println("  - API HTTP test (different approach): " + String(apiCode3));
  apiHttp3.end();
#endif
  
  // Test HTTP connection to our API server with IP address directly
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to our API server (IP direct)...");
  HTTPClient apiHttp4;
  apiHttp4.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp4.setTimeout(5000); // ลดจาก 15000 เป็น 5000
  apiHttp4.setConnectTimeout(10000);
  apiHttp4.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp4.addHeader("Connection", "close");
  int apiCode4 = apiHttp4.GET();
  Serial.println("  - API HTTP test (IP direct): " + String(apiCode4));
  apiHttp4.end();
#endif
  
  // Test HTTP connection to our API server with different port
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to our API server (port 80)...");
  HTTPClient apiHttp5;
  apiHttp5.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp5.setTimeout(5000); // ลดจาก 15000 เป็น 5000
  apiHttp5.setConnectTimeout(10000);
  apiHttp5.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp5.addHeader("Connection", "close");
  int apiCode5 = apiHttp5.GET();
  Serial.println("  - API HTTP test (port 80): " + String(apiCode5));
  apiHttp5.end();
#endif
  
  // Test HTTP connection to our API server with different port
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to our API server (port 8080)...");
  HTTPClient apiHttp6;
  apiHttp6.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp6.setTimeout(5000); // ลดจาก 15000 เป็น 5000
  apiHttp6.setConnectTimeout(10000);
  apiHttp6.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp6.addHeader("Connection", "close");
  int apiCode6 = apiHttp6.GET();
  Serial.println("  - API HTTP test (port 8080): " + String(apiCode6));
  apiHttp6.end();
#endif
  
  // Test HTTP connection to our API server with different port
  Serial.println("🌐 Testing HTTP connection to our API server (port 5000)...");
  HTTPClient apiHttp7;
  apiHttp7.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp7.setTimeout(5000); // ลดจาก 15000 เป็น 5000
  apiHttp7.setConnectTimeout(10000);
  apiHttp7.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp7.addHeader("Connection", "close");
  int apiCode7 = apiHttp7.GET();
  Serial.println("  - API HTTP test (port 5000): " + String(apiCode7));
  apiHttp7.end();
  
  // Test HTTP connection to our API server with different port
  Serial.println("🌐 Testing HTTP connection to our API server (port 4000)...");
  HTTPClient apiHttp8;
  apiHttp8.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp8.setTimeout(5000); // ลดจาก 15000 เป็น 5000
  apiHttp8.setConnectTimeout(10000);
  apiHttp8.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp8.addHeader("Connection", "close");
  int apiCode8 = apiHttp8.GET();
  Serial.println("  - API HTTP test (port 4000): " + String(apiCode8));
  apiHttp8.end();
  
  // Test HTTP connection to our API server with different port
  Serial.println("🌐 Testing HTTP connection to our API server (port 3000 - final test)...");
  HTTPClient apiHttp9;
  apiHttp9.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp9.setTimeout(5000); // ลดจาก 20000 เป็น 5000
  apiHttp9.setConnectTimeout(15000);
  apiHttp9.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp9.addHeader("Connection", "close");
  apiHttp9.addHeader("Accept", "application/json");
  int apiCode9 = apiHttp9.GET();
  Serial.println("  - API HTTP test (port 3000 - final): " + String(apiCode9));
  if (apiCode9 > 0) {
    String response = apiHttp9.getString();
    Serial.println("  - Response: " + response);
  }
  apiHttp9.end();
  
  // Test HTTP connection to our API server with different port
  Serial.println("🌐 Testing HTTP connection to our API server (port 3000 - alternative)...");
  HTTPClient apiHttp10;
  apiHttp10.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp10.setTimeout(5000); // ลดจาก 30000 เป็น 5000
  apiHttp10.setConnectTimeout(20000);
  apiHttp10.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp10.addHeader("Connection", "keep-alive");
  apiHttp10.addHeader("Accept", "application/json");
  int apiCode10 = apiHttp10.GET();
  Serial.println("  - API HTTP test (port 3000 - alternative): " + String(apiCode10));
  if (apiCode10 > 0) {
    String response = apiHttp10.getString();
    Serial.println("  - Response: " + response);
  }
  apiHttp10.end();
  
  // Test TCP connection to API port
  Serial.println("🔌 Testing TCP connection to API port...");
  WiFiClient tcpClient;
  if (tcpClient.connect(API_HOST.c_str(), API_PORT)) {
    Serial.println("  - TCP connection: SUCCESS");
    tcpClient.stop();
  } else {
    Serial.println("  - TCP connection: FAILED");
  }
  
  // Test basic connectivity first
  Serial.println("🔍 Testing basic connectivity...");
  HTTPClient testHttp;
  testHttp.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  testHttp.setTimeout(3000); // ลดจาก 10000 เป็น 3000 // เพิ่ม timeout
  testHttp.setConnectTimeout(5000); // เพิ่ม connection timeout
  testHttp.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  int testCode = testHttp.GET();
  Serial.println("🔍 Basic connectivity test: " + String(testCode));
  
  if (testCode > 0) {
    String testResponse = testHttp.getString();
    Serial.println("🔍 Test response: " + testResponse);
  } else {
    Serial.println("❌ Basic connectivity failed: " + String(testCode));
    Serial.println("🔍 Error: " + testHttp.errorToString(testCode));
  }
  
  testHttp.end();
  
  if (testCode <= 0) {
    Serial.println("❌ Basic connectivity failed, skipping device info request");
    return false;
  }

  // ค้นหา API Server ถ้ายังไม่ได้ (ชั่วคราวใช้ Fallback โดยตรง)
  if (API_HOST.length() == 0) {
    API_HOST = API_HOST_FALLBACK;   // ใช้ค่า Fallback โดยตรง
    Serial.println("🔧 Using fallback IP: " + API_HOST);
  Serial.println("🌐 Network Configuration:");
  Serial.println("   - ESP32 IP: " + WiFi.localIP().toString());
  Serial.println("   - ESP32 Gateway: " + WiFi.gatewayIP().toString());
  Serial.println("   - ESP32 DNS: " + WiFi.dnsIP().toString());
  Serial.println("   - Target API: " + API_HOST + ":" + String(API_PORT));
  String networkType = "Unknown";
  if (WiFi.localIP().toString().startsWith("192.168")) {
    networkType = "Home";
  } else if (WiFi.localIP().toString().startsWith("10.")) {
    networkType = "Office/Mobile";
  } else if (WiFi.localIP().toString().startsWith("172.")) {
    networkType = "Corporate";
  }
  Serial.println("   - Network Type: " + networkType);
  }
  
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  
  String devicePath = "/api/devices/info/" + String(DEVICE_NAME);
  String url = makeUrl(devicePath.c_str());
  Serial.println("🔍 Getting device info from: " + url);

  // Try with HTTPS client settings
  if (!http.begin(client, url)) {
    Serial.println("❌ http.begin failed");
    return false;
  }
  
  http.setReuse(false);
  http.useHTTP10(true);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.addHeader("Connection", "close");
  http.addHeader("Accept", "application/json");
  http.setTimeout(3000);
  http.setConnectTimeout(2000);

  Serial.println("📡 Sending GET request...");
  int httpResponseCode = http.GET();

  Serial.println("📡 HTTP Response Code: " + String(httpResponseCode));

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("🔍 Device info response: " + String(httpResponseCode));
    Serial.println("📋 Response body: " + response);
    
    if (httpResponseCode == 200) {
      // Parse response to get owner name - ใช้คีย์ที่ตรงกับ DB schema 100%
      String ownerName = "";
      
      // ลองดึง user_name ก่อน (ตาม DB schema)
      if (response.indexOf("\"user_name\":") > 0) {
        ownerName = extractJsonString(response, "user_name");
        Serial.println("✅ Found user_name: " + ownerName);
      } else if (response.indexOf("\"userName\":") > 0) {
        ownerName = extractJsonString(response, "userName");
        Serial.println("✅ Found userName: " + ownerName);
      } else if (response.indexOf("\"user\":") > 0) {
        ownerName = extractJsonString(response, "user");
        Serial.println("✅ Found user: " + ownerName);
      } else if (response.indexOf("\"owner\":") > 0) {
        ownerName = extractJsonString(response, "owner");
        Serial.println("✅ Found owner: " + ownerName);
      } else if (response.indexOf("\"name\":") > 0) {
        ownerName = extractJsonString(response, "name");
        Serial.println("✅ Found name: " + ownerName);
      } else {
        // ลองดึงจาก nested object
        if (response.indexOf("\"device\":") > 0) {
          String deviceObj = extractJsonString(response, "device");
          if (deviceObj.length() > 0) {
            if (deviceObj.indexOf("\"user_name\":") > 0) {
              ownerName = extractJsonString(deviceObj, "user_name");
              Serial.println("✅ Found nested user_name: " + ownerName);
            } else if (deviceObj.indexOf("\"userName\":") > 0) {
              ownerName = extractJsonString(deviceObj, "userName");
              Serial.println("✅ Found nested userName: " + ownerName);
            } else if (deviceObj.indexOf("\"user\":") > 0) {
              ownerName = extractJsonString(deviceObj, "user");
              Serial.println("✅ Found nested user: " + ownerName);
            }
          }
        }
        
        // Fallback to userid if no name found
        if (ownerName.length() == 0) {
          String userId = extractJsonString(response, "userid");
          if (userId.length() == 0) {
            String deviceObj = extractJsonString(response, "device");
            if (deviceObj.length() > 0) {
              userId = extractJsonString(deviceObj, "userid");
            }
          }
          if (userId.length() > 0) {
            ownerName = "User " + userId;
            Serial.println("🔍 Using userid as owner name: " + ownerName);
          }
        }
      }
      
      if (ownerName.length() > 0) {
        g_userName = ownerName;
        Serial.println("✅ Owner name updated: " + g_userName);
        Serial.println("🔍 Owner name length: " + String(g_userName.length()));
      } else {
        Serial.println("⚠️ No owner name found in response");
        Serial.println("🔍 Response keys tried: user_name, userName, user, owner, name");
      }
      
      // ✅ ได้ 200 ก็ถือว่า connected ไปก่อน
      apiConnected = true;
      Serial.println("✅ API connected (200). Owner: " + (g_userName.length() ? g_userName : String("—")));
      Serial.println("🔗 API Connected: " + String(apiConnected ? "YES" : "NO"));
      http.end();
      return true;
    } else {
      Serial.println("❌ HTTP Error: " + String(httpResponseCode));
    }
  } else {
    Serial.println("❌ Device info failed: " + String(httpResponseCode));
    Serial.println("🔍 Error details:");
    Serial.println("  - HTTP Code: " + String(httpResponseCode));
    Serial.println("  - Error: " + http.errorToString(httpResponseCode));
  }

  http.end();
  return false;
}

// Send heartbeat to PostgreSQL API (ใช้ฟังก์ชันใหม่)
bool apiSendHeartbeat(float tempC, float ph, int moist, int n, int p, int k) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi not connected for heartbeat");
    return false;
  }
  
  // ใช้ฟังก์ชันใหม่ที่เร็วและชัวร์
  return apiPostHeartbeat();
}

// Legacy Firebase function (now uses PostgreSQL API)
bool fbPatchLive(float tempC, float ph, int moist, int n, int p, int k, int progress){
  // Use PostgreSQL API instead of Firebase
  return apiSendHeartbeat(tempC, ph, moist, n, p, k);
}

// POST /measurements/{deviceId}.json
bool fbPostFinal(float tempC, float ph, int moist, int n, int p, int k){
  if (WiFi.status()!=WL_CONNECTED) return false;
  fbClient.setTimeout(2000); // ลดจาก 5000 เป็น 2000
  fbClient.setInsecure();

  String path = "/measurements/" + String(DEVICE_NAME) + ".json";
  if (FB_AUTH.length()) path += "?auth="+FB_AUTH;

  time_t now = time(nullptr);
  uint32_t ts_epoch = (now > 100000) ? (uint32_t)now : 0;
  uint32_t ts_uptime = (uint32_t)(millis()/1000);

  String payload = "{";
  payload += "\"deviceId\":\""+String(DEVICE_NAME)+"\"";
  payload += ",\"deviceName\":\""+jsonEscape(g_deviceName)+"\"";
  payload += ",\"user\":\""+jsonEscape(g_userName)+"\"";
  payload += ",\"temperature\":"+String(tempC,1);
  payload += ",\"ph\":"+String(ph,1);
  payload += ",\"moisture\":"+String(moist);
  payload += ",\"nitrogen\":"+String(n);
  payload += ",\"phosphorus\":"+String(p);
  payload += ",\"potassium\":"+String(k);
  payload += ",\"finished\":true";
  payload += ",\"ts_epoch\":"+String(ts_epoch);
  
  // Add GPS coordinates if available
  if (g_gpsValid && !isnan(g_lat) && !isnan(g_lon)) {
    payload += ",\"latitude\":"+String(g_lat, 6);
    payload += ",\"longitude\":"+String(g_lon, 6);
    payload += ",\"altitude\":"+String(g_alt, 1);
    payload += ",\"satellites\":"+String(g_satellites);
  }
  payload += ",\"ts_uptime\":"+String(ts_uptime);
  if (!isnan(g_lat) && !isnan(g_lon)) {
    payload += ",\"lat\":"+String(g_lat,6);
    payload += ",\"lon\":"+String(g_lon,6);
  }
  payload += "}";

  if (!fbClient.connect(FB_HOST, 443)) return false;
  fbClient.printf("POST %s HTTP/1.1\r\n", path.c_str());
  fbClient.printf("Host: %s\r\n", FB_HOST);
  fbClient.println("Content-Type: application/json");
  fbClient.printf("Content-Length: %d\r\n", payload.length());
  fbClient.println("Connection: close\r\n");
  fbClient.print(payload);

  String line = fbClient.readStringUntil('\n');
  fbClient.stop();
  return line.indexOf("200")>0;
}

// ================== PostgreSQL API Functions ==================

// สร้าง URL สำหรับ API calls
String buildApiUrl(const char* path) {
  // ใช้ Fallback URL โดยตรง (ไม่ต้องค้นหา)
  String baseUrl = (API_USE_TLS ? "https://" : "http://") + String(API_HOST_FALLBACK);
  return baseUrl + String(path);
}

// Login เพื่อรับ JWT token (เวอร์ชันเร็ว)
bool apiLoginAndGetToken() {
  // ใช้ Device API Key แทน User Password
  Serial.println("🚀 Device authentication with API Key...");
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi not connected for API login");
    return false;
  }

  HTTPClient http;
  String url = buildApiUrl(API_PATH_DEVICE_AUTH);
  
  Serial.println("🔗 API URL: " + url);
  Serial.println("📱 Device: " + String(DEVICE_NAME));
  Serial.println("🔑 API Key: " + String(DEVICE_API_KEY).substring(0, 16) + "...");
  
  // Network info
  Serial.println("🌐 Network Info: " + WiFi.localIP().toString() + " (RSSI: " + String(WiFi.RSSI()) + " dBm)");
  
  // เริ่ม HTTP client สำหรับ device auth
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  
#if DEBUG_NETWORK
  http.setTimeout(5000);
  http.setConnectTimeout(3000);
#else
  http.setTimeout(10000);  // 10 seconds timeout
  http.setConnectTimeout(5000);  // 5 seconds connect timeout
#endif
  http.setReuse(true);
  http.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  http.addHeader("Connection", "close");
  http.addHeader("Accept", "application/json");
  
  // สร้าง JSON payload สำหรับ device authentication
  String jsonString = "{\"device_name\":\"" + String(DEVICE_NAME) + 
                      "\",\"api_key\":\"" + String(DEVICE_API_KEY) + "\"}";
  
  Serial.println("📤 Attempting device auth to: " + url);
  Serial.println("📦 Auth payload: {\"device_name\":\"" + String(DEVICE_NAME) + "\",\"api_key\":\"***\"}");
  
  int httpResponseCode = http.POST(jsonString);
  
  Serial.println("📡 HTTP Response Code: " + String(httpResponseCode));
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("📥 Response: " + response);
    
    if (httpResponseCode == 200) {
      // Parse JSON response แบบง่ายๆ
      String token = extractJsonValue(response, "token");
      
      if (token.length() > 0) {
        API_BEARER = token;
        apiConnected = true;
        Serial.println("✅ API login successful!");
        Serial.println("🔑 Token: " + token.substring(0, 20) + "...");
        Serial.println("🔗 API Connected: " + String(apiConnected ? "YES" : "NO"));
        http.end();
        return true;
      } else {
        Serial.println("❌ No token in response");
        Serial.println("🔍 Response content: " + response);
      }
    } else {
      Serial.println("❌ Login failed with code: " + String(httpResponseCode));
      Serial.println("🔍 Error response: " + response);
    }
  } else {
    Serial.println("❌ HTTP request failed - no response");
    Serial.println("🔍 Check network connection and API_HOST: " + String(API_HOST));
  Serial.println("🔍 WiFi status: " + String(WiFi.status()));
  Serial.println("🔍 IP address: " + WiFi.localIP().toString());
  Serial.println("🔍 Gateway: " + WiFi.gatewayIP().toString());
  Serial.println("🔍 DNS: " + WiFi.dnsIP().toString());
  Serial.println("🔍 RSSI: " + String(WiFi.RSSI()) + " dBm");
  }
  
  http.end();
  return false;
}

// ส่งข้อมูล measurement ไป PostgreSQL
bool apiPostMeasurement(float temperature, float moisture, float ph, 
                       float phosphorus, float potassium, float nitrogen) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected for API measurement");
    return false;
  }

  // ถ้ายังไม่มี token ให้ login ก่อน
  if (API_BEARER == "") {
    Serial.println("No API token, attempting login...");
    if (!apiLoginAndGetToken()) {
      Serial.println("Failed to get API token");
      return false;
    }
  }

#if DEBUG_NETWORK
  // Test internet connectivity by resolving Google DNS
  Serial.println("🌐 Testing internet connectivity...");
  IPAddress googleDNS;
  if (WiFi.hostByName("8.8.8.8", googleDNS)) {
    Serial.println("  - Internet connectivity: OK");
  } else {
    Serial.println("  - Internet connectivity: FAILED");
  }
#endif
  
#if DEBUG_NETWORK
  // Test UDP connection to DNS server
  Serial.println("📡 Testing UDP connection to DNS server...");
  WiFiUDP udp;
  if (udp.begin(12345)) {
    Serial.println("  - UDP connection: OK");
    udp.stop();
  } else {
    Serial.println("  - UDP connection: FAILED");
  }
#endif
  
  // Test HTTP connection to a simple endpoint
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to simple endpoint...");
  HTTPClient simpleHttp;
  simpleHttp.begin("http://httpbin.org/get");
  simpleHttp.setTimeout(2000); // ลดจาก 5000 เป็น 2000
  simpleHttp.setConnectTimeout(1000); // ลดจาก 3000 เป็น 1000
  int simpleCode = simpleHttp.GET();
  Serial.println("  - Simple HTTP test: " + String(simpleCode));
  simpleHttp.end();
#endif
  
  // Test HTTP connection to Google
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to Google...");
  HTTPClient googleHttp;
  googleHttp.begin("http://www.google.com");
  googleHttp.setTimeout(2000); // ลดจาก 5000 เป็น 2000
  googleHttp.setConnectTimeout(1000); // ลดจาก 3000 เป็น 1000
  int googleCode = googleHttp.GET();
  Serial.println("  - Google HTTP test: " + String(googleCode));
  googleHttp.end();
#endif
  
  // Test HTTP connection to our API server
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to our API server...");
  HTTPClient apiHttp;
  apiHttp.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp.setTimeout(10000); // เพิ่ม timeout เป็น 10 วินาที
  apiHttp.setConnectTimeout(5000); // เพิ่ม connect timeout เป็น 5 วินาที
  apiHttp.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp.addHeader("Connection", "close");
  apiHttp.addHeader("Accept", "application/json");
  int apiCode = apiHttp.GET();
  Serial.println("  - API HTTP test: " + String(apiCode));
  if (apiCode > 0) {
    String response = apiHttp.getString();
    Serial.println("  - API Response: " + response);
  } else {
    Serial.println("  - API Error: " + apiHttp.errorToString(apiCode));
  }
  apiHttp.end();
  
  // Test simple connectivity
  Serial.println("🔍 Testing basic connectivity...");
  HTTPClient testHttp;
  testHttp.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  testHttp.setTimeout(5000);
  testHttp.setConnectTimeout(3000);
  int testCode = testHttp.GET();
  Serial.println("🔍 Basic connectivity test: " + String(testCode));
  if (testCode > 0) {
    String testResponse = testHttp.getString();
    Serial.println("🔍 Basic connectivity response: " + testResponse);
  } else {
    Serial.println("🔍 Basic connectivity error: " + testHttp.errorToString(testCode));
  }
  testHttp.end();
#endif
  
  // Test HTTP connection to our API server with different timeout
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to our API server (longer timeout)...");
  HTTPClient apiHttp2;
  apiHttp2.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp2.setTimeout(3000); // ลดจาก 10000 เป็น 3000
  apiHttp2.setConnectTimeout(3000); // ลดจาก 8000 เป็น 3000
  int apiCode2 = apiHttp2.GET();
  Serial.println("  - API HTTP test (longer timeout): " + String(apiCode2));
  apiHttp2.end();
#endif
  
  // Test HTTP connection to our API server with different approach
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to our API server (different approach)...");
  HTTPClient apiHttp3;
  apiHttp3.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp3.setTimeout(5000); // ลดจาก 15000 เป็น 5000
  apiHttp3.setConnectTimeout(10000);
  apiHttp3.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp3.addHeader("Connection", "close");
  int apiCode3 = apiHttp3.GET();
  Serial.println("  - API HTTP test (different approach): " + String(apiCode3));
  apiHttp3.end();
#endif
  
  // Test HTTP connection to our API server with IP address directly
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to our API server (IP direct)...");
  HTTPClient apiHttp4;
  apiHttp4.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp4.setTimeout(5000); // ลดจาก 15000 เป็น 5000
  apiHttp4.setConnectTimeout(10000);
  apiHttp4.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp4.addHeader("Connection", "close");
  int apiCode4 = apiHttp4.GET();
  Serial.println("  - API HTTP test (IP direct): " + String(apiCode4));
  apiHttp4.end();
#endif
  
  // Test HTTP connection to our API server with different port
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to our API server (port 80)...");
  HTTPClient apiHttp5;
  apiHttp5.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp5.setTimeout(5000); // ลดจาก 15000 เป็น 5000
  apiHttp5.setConnectTimeout(10000);
  apiHttp5.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp5.addHeader("Connection", "close");
  int apiCode5 = apiHttp5.GET();
  Serial.println("  - API HTTP test (port 80): " + String(apiCode5));
  apiHttp5.end();
#endif
  
  // Test HTTP connection to our API server with different port
#if DEBUG_NETWORK
  Serial.println("🌐 Testing HTTP connection to our API server (port 8080)...");
  HTTPClient apiHttp6;
  apiHttp6.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp6.setTimeout(5000); // ลดจาก 15000 เป็น 5000
  apiHttp6.setConnectTimeout(10000);
  apiHttp6.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp6.addHeader("Connection", "close");
  int apiCode6 = apiHttp6.GET();
  Serial.println("  - API HTTP test (port 8080): " + String(apiCode6));
  apiHttp6.end();
#endif
  
  // Test HTTP connection to our API server with different port
  Serial.println("🌐 Testing HTTP connection to our API server (port 5000)...");
  HTTPClient apiHttp7;
  apiHttp7.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp7.setTimeout(5000); // ลดจาก 15000 เป็น 5000
  apiHttp7.setConnectTimeout(10000);
  apiHttp7.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp7.addHeader("Connection", "close");
  int apiCode7 = apiHttp7.GET();
  Serial.println("  - API HTTP test (port 5000): " + String(apiCode7));
  apiHttp7.end();
  
  // Test HTTP connection to our API server with different port
  Serial.println("🌐 Testing HTTP connection to our API server (port 4000)...");
  HTTPClient apiHttp8;
  apiHttp8.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp8.setTimeout(5000); // ลดจาก 15000 เป็น 5000
  apiHttp8.setConnectTimeout(10000);
  apiHttp8.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp8.addHeader("Connection", "close");
  int apiCode8 = apiHttp8.GET();
  Serial.println("  - API HTTP test (port 4000): " + String(apiCode8));
  apiHttp8.end();
  
  // Test HTTP connection to our API server with different port
  Serial.println("🌐 Testing HTTP connection to our API server (port 3000 - final test)...");
  HTTPClient apiHttp9;
  apiHttp9.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp9.setTimeout(5000); // ลดจาก 20000 เป็น 5000
  apiHttp9.setConnectTimeout(15000);
  apiHttp9.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp9.addHeader("Connection", "close");
  apiHttp9.addHeader("Accept", "application/json");
  int apiCode9 = apiHttp9.GET();
  Serial.println("  - API HTTP test (port 3000 - final): " + String(apiCode9));
  if (apiCode9 > 0) {
    String response = apiHttp9.getString();
    Serial.println("  - Response: " + response);
  }
  apiHttp9.end();
  
  // Test HTTP connection to our API server with different port
  Serial.println("🌐 Testing HTTP connection to our API server (port 3000 - alternative)...");
  HTTPClient apiHttp10;
  apiHttp10.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  apiHttp10.setTimeout(5000); // ลดจาก 30000 เป็น 5000
  apiHttp10.setConnectTimeout(20000);
  apiHttp10.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  apiHttp10.addHeader("Connection", "keep-alive");
  apiHttp10.addHeader("Accept", "application/json");
  int apiCode10 = apiHttp10.GET();
  Serial.println("  - API HTTP test (port 3000 - alternative): " + String(apiCode10));
  if (apiCode10 > 0) {
    String response = apiHttp10.getString();
    Serial.println("  - Response: " + response);
  }
  apiHttp10.end();
  
  // Test TCP connection to API port
  Serial.println("🔌 Testing TCP connection to API port...");
  WiFiClient tcpClient;
  if (tcpClient.connect(API_HOST.c_str(), API_PORT)) {
    Serial.println("  - TCP connection: SUCCESS");
    tcpClient.stop();
  } else {
    Serial.println("  - TCP connection: FAILED");
  }

  // Test basic connectivity first
  Serial.println("🔍 Testing basic connectivity for measurement...");
  HTTPClient testHttp;
  testHttp.begin((API_USE_TLS ? "https://" : "http://") + String(API_HOST) + ":" + String(API_PORT) + "/");
  testHttp.setTimeout(3000); // ลดจาก 10000 เป็น 3000 // เพิ่ม timeout
  testHttp.setConnectTimeout(5000); // เพิ่ม connection timeout
  testHttp.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  int testCode = testHttp.GET();
  Serial.println("🔍 Basic connectivity test: " + String(testCode));
  
  if (testCode > 0) {
    String testResponse = testHttp.getString();
    Serial.println("🔍 Test response: " + testResponse);
  } else {
    Serial.println("❌ Basic connectivity failed: " + String(testCode));
    Serial.println("🔍 Error: " + testHttp.errorToString(testCode));
  }
  
  testHttp.end();
  
  if (testCode <= 0) {
    Serial.println("❌ Basic connectivity failed, skipping measurement");
    return false;
  }

  HTTPClient http;
  String url = buildApiUrl(API_PATH_MEAS);
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + API_BEARER);
  http.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  http.setTimeout(3000); // ลด timeout เป็น 3 วินาที
  http.setConnectTimeout(2000); // ลด connection timeout เป็น 2 วินาที
  http.setReuse(true); // เปิดใช้ connection reuse
  http.addHeader("User-Agent", "ESP32-Soil-Sensor/1.0");
  http.addHeader("Connection", "close");
  http.addHeader("Accept", "application/json");
  
  // สร้าง JSON payload ตาม database schema
  String jsonString = createMeasurementJson(temperature, moisture, ph, phosphorus, potassium, nitrogen);
  
  Serial.println("Sending measurement to: " + url);
  Serial.println("Measurement payload: " + jsonString);
  
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Measurement response code: " + String(httpResponseCode));
    Serial.println("Measurement response: " + response);
    
    if (httpResponseCode == 200 || httpResponseCode == 201) {
      Serial.println("✅ Measurement sent to PostgreSQL successfully!");
      apiConnected = true;
      http.end();
      return true;
    } else if (httpResponseCode == 401) {
      // Token expired, try to login again
      Serial.println("Token expired, attempting re-login...");
      API_BEARER = "";  // Clear expired token
      http.end();
      return apiPostMeasurement(temperature, moisture, ph, phosphorus, potassium, nitrogen);
    } else {
      Serial.println("❌ Measurement failed with HTTP code: " + String(httpResponseCode));
    }
  } else {
    Serial.println("❌ Measurement request failed");
  }
  
  http.end();
  apiConnected = false;
  return false;
}

// ================== Simple JSON Functions ==================

// สร้าง JSON string สำหรับ measurement
String createMeasurementJson(float temperature, float moisture, float ph, 
                           float phosphorus, float potassium, float nitrogen) {
  String json = "{";
  json += "\"deviceId\":\"" + String(DEVICE_NAME) + "\",";
  json += "\"temperature\":" + String(temperature, 1) + ",";
  json += "\"moisture\":" + String(moisture, 1) + ",";
  json += "\"ph\":" + String(ph, 1) + ",";
  json += "\"phosphorus\":" + String(phosphorus, 1) + ",";
  json += "\"potassium\":" + String(potassium, 1) + ",";
  json += "\"nitrogen\":" + String(nitrogen, 1) + ",";
  json += "\"lng\":\"" + String(g_lon, 8) + "\",";
  json += "\"lat\":\"" + String(g_lat, 8) + "\"";
  json += "}";
  return json;
}

// แยกค่า JSON แบบง่ายๆ (สำหรับ token)
String extractJsonValue(const String& json, const String& key) {
  String searchKey = "\"" + key + "\":";
  int startIndex = json.indexOf(searchKey);
  if (startIndex == -1) return "";
  
  startIndex += searchKey.length();
  
  // หา quote เริ่มต้น
  int quoteStart = json.indexOf("\"", startIndex);
  if (quoteStart == -1) return "";
  quoteStart++; // ข้าม quote
  
  // หา quote สิ้นสุด
  int quoteEnd = json.indexOf("\"", quoteStart);
  if (quoteEnd == -1) return "";
  
  return json.substring(quoteStart, quoteEnd);
}

// ================== Device Management Functions ==================

// ตรวจสอบว่า device name ถูกต้องตามรูปแบบ esp32-soil-001 ถึง esp32-soil-999
bool validateDeviceName(const char* deviceName) {
  if (!deviceName || strlen(deviceName) == 0) return false;
  
  String name = String(deviceName);
  
  // ตรวจสอบรูปแบบ esp32-soil-XXX
  if (!name.startsWith("esp32-soil-")) return false;
  
  // แยกส่วนหมายเลข
  String numberPart = name.substring(11); // เอา "esp32-soil-" ออก
  
  // ตรวจสอบว่าเป็นตัวเลข 3 หลัก
  if (numberPart.length() != 3) return false;
  
  for (int i = 0; i < 3; i++) {
    if (!isDigit(numberPart[i])) return false;
  }
  
  // ตรวจสอบช่วง 001-999
  int deviceNumber = numberPart.toInt();
  return (deviceNumber >= 1 && deviceNumber <= 999);
}

// กำหนด device type จาก device name (ตามระบบ backend)
String getDeviceTypeFromName(const char* deviceName) {
  if (!deviceName) return "unknown";
  
  String name = String(deviceName);
  name.toLowerCase();
  
  // ตามระบบ backend: ถ้าชื่อมี "test" จะเป็น false, ไม่มีจะเป็น true
  if (name.indexOf("test") >= 0) {
    return "test";
  } else {
    return "production";
  }
}

// แสดงข้อมูล device ใน Serial Monitor
void displayDeviceInfo() {
  Serial.println("=== Device Information ===");
  Serial.println("Device Name: " + String(DEVICE_NAME));
  Serial.println("Device Type: " + getDeviceTypeFromName(DEVICE_NAME));
  Serial.println("Valid Name: " + String(validateDeviceName(DEVICE_NAME) ? "YES" : "NO"));
  Serial.println("API Host: " + String(API_HOST) + ":" + String(API_PORT));
  Serial.println("API Key: " + String(DEVICE_API_KEY).substring(0, 16) + "...");
  Serial.println("Wi-Fi Status: " + wifiStatus);
  Serial.println("Wi-Fi SSID: " + WiFi.SSID());
  Serial.println("Wi-Fi IP: " + WiFi.localIP().toString());
  Serial.println("Wi-Fi RSSI: " + String(WiFi.RSSI()) + " dBm");
  Serial.println("API Connected: " + String(apiConnected ? "YES" : "NO"));
  Serial.println("Sensor Online: " + String(soilSensor_online ? "YES" : "NO"));
  Serial.println("GPS Valid: " + String(g_gpsValid ? "YES" : "NO"));
  Serial.println("GPS Lat: " + String(g_lat, 6));
  Serial.println("GPS Lon: " + String(g_lon, 6));
  Serial.println("GPS Alt: " + String(g_alt, 1) + "m");
  Serial.println("GPS Sats: " + String(g_satellites));
  Serial.println("=========================");
}

// ================== Setup ==================
void setup() {
  Serial.begin(115200);

  pinMode(RS485_DE_RE, OUTPUT);
  digitalWrite(RS485_DE_RE, LOW); // เริ่มที่โหมดรับ

  Serial2.begin(SENSOR_RS485_BAUD, SERIAL_8N1, RS485_RX_PIN, RS485_TX_PIN);

  // Initialize GPS module
  initGPS();

  delay(200); // ลดจาก 500 เป็น 200
  dht.begin();
  tft.init();
  tft.setRotation(1);
  tft.setTouch(calData);
  buzzerInit();

  // ตั้งเวลา NTP (สำหรับ timestamp)
  configTime(7*3600, 0, "pool.ntp.org", "time.nist.gov"); // เวลาไทย +7

  // ตั้งค่า device profile เริ่มต้น
  g_deviceEnabled = true;
  g_deviceName = String(DEVICE_NAME);
  g_userName = ""; // จะดึงจาก DB ผ่าน API

  // ตั้งค่า Wi-Fi auto-connect และจดจำ credentials
  WiFi.mode(WIFI_STA);
  WiFi.persistent(true);  // เก็บ Wi-Fi credentials ใน flash memory
  WiFi.setAutoReconnect(true);
  
  // ตรวจสอบว่ามี Wi-Fi credentials เก็บไว้หรือไม่
  String savedSSID = WiFi.SSID();
  String savedPassword = WiFi.psk();
  
  Serial.println("🔍 Checking saved Wi-Fi credentials...");
  if (savedSSID.length() > 0) {
    Serial.println("📡 Saved SSID: " + savedSSID);
    Serial.println("🔑 Password length: " + String(savedPassword.length()) + " characters");
    
    // ลองเชื่อมต่อด้วย credentials ที่เก็บไว้
    Serial.println("🔄 Attempting to connect with saved credentials...");
    WiFi.begin(savedSSID.c_str(), savedPassword.c_str());
    
    // รอการเชื่อมต่อ (ไม่เกิน 15 วินาที)
    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < 15000) {
      delay(200);
      Serial.print(".");
      
      // แสดง progress indicator
      if ((millis() - startTime) % 1000 == 0) {
        Serial.println("\n⏱️  Attempting connection... " + String((millis() - startTime) / 1000) + "s");
      }
    }
    
  if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\n✅ Wi-Fi connected with saved credentials!");
      Serial.println("📡 SSID: " + WiFi.SSID());
      Serial.println("🌐 IP: " + WiFi.localIP().toString());
      Serial.println("📶 RSSI: " + String(WiFi.RSSI()) + " dBm");
      
      wifiStatus = "Connected";
      wifiConfigMode = false;
      onWiFiScanPage = false;
      
      // แสดงหน้าจอ Connected
      tft.fillScreen(COLOR_DARK);
      tft.setTextColor(COLOR_SUCCESS, COLOR_DARK);
      tft.drawString("✓ Connected!", 240, 120, 4);
      tft.setTextColor(TFT_WHITE, COLOR_DARK);
      tft.drawString("SSID: " + WiFi.SSID(), 240, 150, 2);
      tft.drawString("IP: " + WiFi.localIP().toString(), 240, 170, 2);
      tft.setTextColor(COLOR_ACCENT, COLOR_DARK);
      tft.drawString("Signal: " + String(WiFi.RSSI()) + " dBm", 240, 190, 2);
      tft.setTextColor(COLOR_SUCCESS, COLOR_DARK);
      tft.drawString("Auto-connected!", 240, 210, 2);
      
      // แสดงข้อความให้แตะหน้าจอ
      tft.setTextColor(COLOR_WARNING, COLOR_DARK);
      tft.drawString("Tap screen to continue", 240, 240, 2);
      
      // รอการแตะหน้าจอ
      Serial.println("🖱️  Waiting for touch to continue to main page...");
      while (true) {
        uint16_t x, y;
        if (tft.getTouch(&x, &y)) {
          if (millis() - lastTouchTime > 30) { // ลด debounce time
            lastTouchTime = millis();
            Serial.println("🖱️  Touch detected, proceeding to main page...");
            buzzerBeep(60, 0, 1);
            break;
          }
        }
        delay(20); // ลด delay จาก 50 เป็น 20
      }
      
      // โหลดโปรไฟล์อุปกรณ์
    if (!fbGETDeviceProfile()) {
        Serial.println("WARN: cannot fetch device profile (devices/Devices) - using defaults");
      }
      
      // ลอง login เข้า PostgreSQL API
      Serial.println("Attempting PostgreSQL API login...");
      if (apiLoginAndGetToken()) {
        Serial.println("✅ PostgreSQL API login successful!");
      } else {
        Serial.println("❌ PostgreSQL API login failed - will retry later");
      }
      
      // ดึงข้อมูลอุปกรณ์และ owner
      Serial.println("Getting device info...");
    // Health check ก่อน
    if (apiHealthCheck()) {
      Serial.println("✅ API Health Check: OK");
    } else {
      Serial.println("❌ API Health Check: FAILED");
    }
    
    if (apiGetDeviceInfo()) {
      Serial.println("✅ Device info retrieved successfully!");
    } else {
      Serial.println("❌ Failed to get device info - using defaults");
    }
    } else {
      Serial.println("\n❌ Failed to connect with saved credentials");
      Serial.println("🔍 Possible reasons:");
      Serial.println("   - Wi-Fi password changed");
      Serial.println("   - Wi-Fi network not available");
      Serial.println("   - Signal too weak");
      Serial.println("🔄 Starting Wi-Fi configuration...");
      
      wifiConfigMode = true;
      onWiFiScanPage = true;
      scanWiFiNetworks();
      showWiFiScanPage();
    }
  } else {
    Serial.println("❌ No saved Wi-Fi credentials found");
    Serial.println("🔄 Starting Wi-Fi configuration...");
    
    wifiConfigMode = true;
    onWiFiScanPage = true;
    scanWiFiNetworks();
    showWiFiScanPage();
  }

  // ถ้าไม่ใช่โหมดตั้งค่า Wi-Fi (เช่นใช้ offline) ให้แสดง Splash + Home
  if (!wifiConfigMode) {
    probeSoilSensor(true, 800);
    showSplashScreen();
    drawHomePage();
  }

  // แสดงข้อมูล device
  displayDeviceInfo();

  Serial.println("Enhanced system initialized. Touch detection ready.");
}
// ================== Loop ==================
static unsigned long s_lastProfileCheck = 0;
void loop() {
  // === ถ้าอยู่โหมดตั้งค่า Wi-Fi ===
  if (wifiConfigMode) {
    uint16_t x, y;
    if (tft.getTouch(&x, &y)) {
      if (millis() - lastTouchTime > 30) { // ลด debounce time เป็น 30ms
        lastTouchTime = millis();
        handleTouch(x, y);   // จะพาไปกรอกพาส/ต่อ Wi-Fi/กด Offline
        while (tft.getTouch(&x, &y)) delay(2);
        delay(10); // ลด delay เป็น 10ms
      }
    }
    return;  // ค้างอยู่หน้านี้จนกว่าจะ connect หรือ offline
  }

  // === ถ้าออกจากโหมดตั้งค่าแล้ว ===

  // Read GPS data continuously
  readGPS();

  // Update time & WiFi & sensor ping ทุก 10 วิ
  if (millis() - lastTimeUpdate >= 10000) {
    updateTime();
    String newWifiStatus = WiFi.status() == WL_CONNECTED ? "Connected" : "Not connected";
    if (newWifiStatus != wifiStatus) {
      wifiStatus = newWifiStatus;
      needsWifiRedraw = true;
    }

    probeSoilSensor(false, 300);     // ping sensor
    fbSendHeartbeatIfDue();          // ส่ง heartbeat Firebase
    needsTimeRedraw = true;

    if (!onHistoryPage && !onResultsPage) {
      if (needsFullRedraw) {
        drawHomePage();
        needsFullRedraw = false;
      } else {
        updateHomePage();
      }
    }
    lastTimeUpdate = millis();
  }

  // รีเฟรชโปรไฟล์ Firebase ทุก 15 วิ
  if (WiFi.status() == WL_CONNECTED && millis() - s_lastProfileCheck > 15000) {
    fbRefreshProfileIfDue();
    s_lastProfileCheck = millis();
  }

  // จัดการ Wi-Fi auto-connect
  static unsigned long s_lastWiFiCheck = 0;
  if (WiFi.status() != WL_CONNECTED && millis() - s_lastWiFiCheck > 5000) {
    Serial.println("🔄 Wi-Fi disconnected, attempting auto-reconnect...");
    WiFi.reconnect();
    s_lastWiFiCheck = millis();
  }
  
  // ลองเชื่อมต่อ API ใหม่ทุก 15 วิ (ถ้ายังไม่ได้เชื่อมต่อ) - ลดเวลาเพื่อให้เสถียรขึ้น
  static unsigned long s_lastApiRetry = 0;
  static bool lastApiStatus = false;
  if (WiFi.status() == WL_CONNECTED && !apiConnected && millis() - s_lastApiRetry > 15000) {
    Serial.println("🔄 Retrying API connection...");
    if (apiHealthCheck_min()) {
      Serial.println("✅ API health check passed");
      apiConnected = true;
    } else {
      Serial.println("❌ API health check failed, trying device auth...");
      apiLoginAndGetToken();
    }
    s_lastApiRetry = millis();
    needsWifiRedraw = true; // อัปเดต UI
  }
  
  // อัปเดต UI เมื่อ API status เปลี่ยน
  if (apiConnected != lastApiStatus) {
    Serial.println("🔄 API status changed: " + String(apiConnected ? "Connected" : "Disconnected"));
    lastApiStatus = apiConnected;
    needsWifiRedraw = true; // อัปเดต UI
  }
  
  // อัปเดตข้อมูลอุปกรณ์และ owner ทุก 15 วิ (ลดเวลาเพื่อให้ชื่อไม่หาย)
  static unsigned long s_lastDeviceInfoUpdate = 0;
  if (WiFi.status() == WL_CONNECTED && millis() - s_lastDeviceInfoUpdate > 15000) {
    Serial.println("Updating device info...");
    if (apiGetDeviceInfo()) {
      // Serial.println("✅ Device info updated successfully"); // ลบออกเพื่อลด spam
      // Serial.println("👤 Current owner: " + g_userName);
      needsFullRedraw = true; // อัปเดต UI ทันที
    } else {
      Serial.println("❌ Failed to update device info - will retry");
    }
    s_lastDeviceInfoUpdate = millis();
  }

  // Touch detection - ปรับปรุงให้สมูทขึ้นทุกหน้า
  uint16_t x, y;
  if (tft.getTouch(&x, &y)) {
    if (millis() - lastTouchTime > 30) { // ลด debounce time เป็น 30ms
      lastTouchTime = millis();
      // Serial.printf("🖱️ Touch detected at x=%d y=%d\n", x, y); // ลบออกเพื่อลด spam
      handleTouch(x, y);
      // ลด delay เพื่อให้ตอบสนองเร็วขึ้น
      while (tft.getTouch(&x, &y)) delay(2);
      delay(10); // ลดจาก 20 เป็น 10
    }
  }
}

// ===== Heartbeat =====
static unsigned long s_lastHeartbeatMs = 0;
#define HEARTBEAT_EVERY_MS 12000  // 12 วิ
static void fbSendHeartbeatIfDue() {
  if (WiFi.status() != WL_CONNECTED) return;
  unsigned long now = millis();
  if (now - s_lastHeartbeatMs < HEARTBEAT_EVERY_MS) return;
  s_lastHeartbeatMs = now;
  (void) fbPatchLive(lastTemp, lastPh, lastMoisture, lastN, lastP, lastK, -1);
}

// 🔥 NEW: รีเฟรชโปรไฟล์จาก RTDB (ลอง devices/Devices + /meta)
static void fbRefreshProfileIfDue() {
  bool prevEnabled = g_deviceEnabled;
  if (fbGETDeviceProfile()) {
    if (prevEnabled != g_deviceEnabled) {
      Serial.printf("Device enabled state changed -> %d\n", (int)g_deviceEnabled);
      needsFullRedraw = true;
      drawHomePage();
    }
  }
}

// ================== Wi-Fi UI ==================
void scanWiFiNetworks() {
  tft.fillScreen(COLOR_DARK);
  tft.setTextColor(TFT_WHITE, COLOR_DARK);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Scanning Wi-Fi Networks...", 240, 160, 4);
  
  // แสดง progress indicator
  for (int i = 0; i < 5; i++) {
    tft.fillCircle(200 + i * 20, 200, 3, COLOR_PRIMARY);
    delay(100);
  }
  
  // รีเซ็ตการเลือกและเลื่อน
  selectedWiFiIndex = -1;
  wifiScrollIndex = 0;
  Serial.println("🔄 Reset scroll index to 0");
  
  // Force disconnect และ clear cache
  WiFi.disconnect(true, true);   // ตัดลิงก์และลบ AP ในแฟลช
  WiFi.mode(WIFI_OFF);           // ปิด Wi-Fi ชั่วคราว
  delay(100);
  WiFi.mode(WIFI_STA);           // เปิด Wi-Fi ใหม่
  delay(500);                    // รอให้ชิปนิ่ง
  WiFi.scanDelete();             // เคลียร์ผลรอบก่อน (ถ้ามี)
  delay(500);                    // รอให้ชิปพร้อม
  
  Serial.println("🔍 Starting Wi-Fi scan (show hidden, active scan, all channels)...");
  Serial.println("📡 Scanning 2.4GHz channels 1-13...");
  
  // scanNetworks(async, show_hidden, passive, max_ms_per_chan, channel)
  // async=false (รอให้เสร็จ), show_hidden=true, passive=false (active scan), max_ms=500 (เพิ่มเวลา), channel=0 (ทุก channel)
  int n = WiFi.scanNetworks(false, true, false, 500, 0);
  Serial.println("📡 Found " + String(n) + " networks");
  
  if (n == 0) {
    Serial.println("⚠️ No networks found! Possible reasons:");
    Serial.println("   - Hotspot not turned on");
    Serial.println("   - Hotspot using 5GHz (ESP32 only supports 2.4GHz)");
    Serial.println("   - Too far from hotspot");
    Serial.println("   - Try turning hotspot off and on again");
  }
  
  Serial.println("📊 Before sorting - Networks found: " + String(n));
  
  wifiNetworkCount = 0;
  
  // แสดงรายการ Wi-Fi ทั้งหมดที่สแกนได้
  Serial.println("📋 All scanned networks:");
  for (int i = 0; i < n; i++) {
    String ssid = WiFi.SSID(i);
    int32_t rssi = WiFi.RSSI(i);
    int32_t channel = WiFi.channel(i);
    wifi_auth_mode_t encryption = WiFi.encryptionType(i);
    Serial.println("  " + String(i+1) + ". " + ssid + " (Ch:" + String(channel) + ", " + String(rssi) + " dBm, " + 
                   (encryption == WIFI_AUTH_OPEN ? "Open" : "Encrypted") + ")");
  }
  
  for (int i = 0; i < n && wifiNetworkCount < MAX_WIFI_NETWORKS; i++) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() > 0) {
      wifiNetworks[wifiNetworkCount].ssid = ssid;
      wifiNetworks[wifiNetworkCount].rssi = WiFi.RSSI(i);
      wifiNetworks[wifiNetworkCount].encrypted = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
      wifiNetworkCount++;
    }
  }
  
  // เรียงตาม RSSI (สัญญาณแรงที่สุดก่อน)
  Serial.println("🔄 Sorting " + String(wifiNetworkCount) + " networks by signal strength...");
  for (int i = 0; i < wifiNetworkCount - 1; i++) {
    for (int j = i + 1; j < wifiNetworkCount; j++) {
      if (wifiNetworks[j].rssi > wifiNetworks[i].rssi) {
        WiFiNetwork temp = wifiNetworks[i];
        wifiNetworks[i] = wifiNetworks[j];
        wifiNetworks[j] = temp;
      }
    }
  }
  Serial.println("✅ Sorting completed - Networks: " + String(wifiNetworkCount));
  
  Serial.println("📊 Wi-Fi networks sorted by signal strength:");
  for (int i = 0; i < wifiNetworkCount; i++) {
    Serial.println("  " + String(i+1) + ". " + wifiNetworks[i].ssid + " (" + String(wifiNetworks[i].rssi) + " dBm)");
  }
}

void showWiFiScanPage() {
  onWiFiScanPage = true;
  wifiConfigMode = true;
  
  // ไม่สแกนอัตโนมัติ - ให้ผู้ใช้กดปุ่ม Rescan เอง
  
  tft.fillScreen(COLOR_DARK);
  tft.fillRect(0, 0, 480, 60, COLOR_CARD_BG);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("📡 Wi-Fi Networks", 20, 10, 4);
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.drawString("Tap once to select, tap again to connect", 20, 38, 2);
  
  // แสดงข้อมูลการเลื่อน
  if (wifiNetworkCount > 4) {
    tft.setTextColor(COLOR_ACCENT, COLOR_CARD_BG);
    tft.setTextDatum(TR_DATUM);
    int totalPages = (wifiNetworkCount + 3) / 4; // ปัดขึ้น
    int currentPage = (wifiScrollIndex / 4) + 1;
    Serial.println("📄 Page calculation - ScrollIndex: " + String(wifiScrollIndex) + ", TotalPages: " + String(totalPages) + ", CurrentPage: " + String(currentPage));
    tft.drawString("Page " + String(currentPage) + "/" + String(totalPages), 460, 38, 2);
    
    // แสดงปุ่มเลื่อน
    tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("Use Previous/Next to scroll", 240, 38, 2);
  } else if (wifiNetworkCount > 0) {
    tft.setTextColor(COLOR_ACCENT, COLOR_CARD_BG);
    tft.setTextDatum(TR_DATUM);
    tft.drawString("Found " + String(wifiNetworkCount) + " networks", 460, 38, 2);
  }
  
  // แสดงรายการ Wi-Fi (แสดง 4 รายการ, เรียงตามสัญญาณแรงที่สุดก่อน)
  int y = 70;
  int visibleCount = min(4, wifiNetworkCount);
  Serial.println("📱 Displaying Wi-Fi networks - ScrollIndex: " + String(wifiScrollIndex) + ", VisibleCount: " + String(visibleCount) + ", TotalNetworks: " + String(wifiNetworkCount));
  
  if (wifiNetworkCount == 0) {
    // ไม่พบ Wi-Fi networks หรือยังไม่ได้สแกน
    tft.setTextColor(COLOR_WARNING, COLOR_DARK);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("No Wi-Fi networks found", 240, 160, 3);
    tft.setTextColor(COLOR_LIGHT, COLOR_DARK);
    tft.drawString("Press 'Rescan' button to scan for networks", 240, 190, 2);
  } else {
    // แสดง Wi-Fi networks
    Serial.println("📱 Showing networks from index " + String(wifiScrollIndex) + " to " + String(wifiScrollIndex + visibleCount - 1));
  for (int i = wifiScrollIndex; i < wifiScrollIndex + visibleCount && i < wifiNetworkCount; i++) {
    Serial.println("📱 Displaying network " + String(i) + ": " + wifiNetworks[i].ssid);
    // สีพื้นหลัง (เปลี่ยนสีถ้าเป็นตัวที่เลือก)
    uint16_t bgColor = (i % 2) ? COLOR_DARK : COLOR_CARD_BG;
    if (selectedWiFiIndex == i) {
      bgColor = COLOR_PRIMARY; // สีน้ำเงินเมื่อเลือก
    }
    tft.fillRoundRect(20, y, 440, 45, 8, bgColor);
    
    // Signal strength icon (ปรับปรุงการแสดงผล)
    int bars = map(wifiNetworks[i].rssi, -90, -30, 1, 4);
    bars = constrain(bars, 1, 4);
    uint16_t signalColor = (wifiNetworks[i].rssi > -50) ? COLOR_SUCCESS : 
                           (wifiNetworks[i].rssi > -70) ? COLOR_WARNING : COLOR_DANGER;
    
    for (int b = 0; b < bars; b++) {
      tft.fillRect(30 + b * 6, y + 30 - b * 6, 4, 6 + b * 6, signalColor);
    }
    
    // SSID (แสดงลำดับความแรงของสัญญาณ)
    tft.setTextColor(TFT_WHITE, bgColor);
    tft.setTextDatum(TL_DATUM);
    String displayText = wifiNetworks[i].ssid;
    if (wifiNetworks[i].rssi > -50) {
      displayText = "📶 " + displayText; // สัญญาณแรงมาก
    } else if (wifiNetworks[i].rssi > -70) {
      displayText = "📶 " + displayText; // สัญญาณปานกลาง
    }
    tft.drawString(displayText, 60, y + 8, 2);
    
    // Encryption icon
    if (wifiNetworks[i].encrypted) {
      tft.setTextColor(COLOR_WARNING, bgColor);
      tft.drawString("🔒", 400, y + 8, 2);
    } else {
      tft.setTextColor(COLOR_SUCCESS, bgColor);
      tft.drawString("🔓", 400, y + 8, 2);
    }
    
    // RSSI with color coding
    tft.setTextColor(signalColor, bgColor);
    tft.drawString(String(wifiNetworks[i].rssi) + " dBm", 60, y + 26, 1);
    
    // แสดงสถานะการเลือก
    if (selectedWiFiIndex == i) {
      tft.setTextColor(TFT_WHITE, bgColor);
      tft.drawString("✓ Selected - Tap again to connect", 200, y + 26, 1);
    }
    
    y += 50;
    }
  }
  
  // Navigation Bar (ปุ่มล่าง) - ปรับปรุงให้สวยขึ้น
  tft.fillRect(0, 260, 480, 60, COLOR_CARD_BG);
  tft.drawLine(0, 260, 480, 260, COLOR_LIGHT);
  
  
  // ปุ่ม Rescan (ซ้าย) - เพิ่มเงา
  tft.fillRoundRect(22, 272, 116, 36, 8, COLOR_DARK);
  tft.fillRoundRect(20, 270, 116, 36, 8, COLOR_PRIMARY);
  tft.drawRoundRect(20, 270, 116, 36, 8, TFT_WHITE);
  tft.setTextColor(TFT_WHITE, COLOR_PRIMARY);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("🔄 Rescan", 78, 288, 2);
  
  // ปุ่ม Use Offline (ขวา) - เพิ่มเงา
  tft.fillRoundRect(342, 272, 116, 36, 8, COLOR_DARK);
  tft.fillRoundRect(340, 270, 116, 36, 8, COLOR_WARNING);
  tft.drawRoundRect(340, 270, 116, 36, 8, TFT_WHITE);
  tft.setTextColor(TFT_WHITE, COLOR_WARNING);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Use Offline", 398, 288, 2);
  
  // ปุ่มเลื่อนขึ้น/ลง (กลาง) - ปรับปรุงให้ชัดเจนขึ้น
  bool canScrollUp = (wifiScrollIndex > 0);
  bool canScrollDown = (wifiScrollIndex < wifiNetworkCount - 4);
  
  // ปุ่มเลื่อนขึ้น (Previous)
  uint16_t upColor = canScrollUp ? COLOR_PRIMARY : COLOR_DARK;
  tft.fillRoundRect(182, 272, 80, 36, 8, COLOR_DARK);
  tft.fillRoundRect(180, 270, 80, 36, 8, upColor);
  tft.drawRoundRect(180, 270, 80, 36, 8, TFT_WHITE);
  tft.setTextColor(TFT_WHITE, upColor);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Previous", 220, 288, 2);
  
  // ปุ่มเลื่อนลง (Next)
  uint16_t downColor = canScrollDown ? COLOR_PRIMARY : COLOR_DARK;
  tft.fillRoundRect(252, 272, 80, 36, 8, COLOR_DARK);
  tft.fillRoundRect(250, 270, 80, 36, 8, downColor);
  tft.drawRoundRect(250, 270, 80, 36, 8, TFT_WHITE);
  tft.setTextColor(TFT_WHITE, downColor);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Next", 290, 288, 2);
  
  // แสดงข้อความสถานะการเลื่อน
  if (wifiNetworkCount > 4) {
    tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("Previous | Next", 240, 250, 2);
  }
}

void showWiFiScanPageWithoutScan() {
  onWiFiScanPage = true;
  wifiConfigMode = true;
  
  // แสดงผลหน้าโดยไม่สแกน - ใช้ข้อมูลที่มีอยู่
  
  tft.fillScreen(COLOR_DARK);
  tft.fillRect(0, 0, 480, 60, COLOR_CARD_BG);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("📡 Wi-Fi Networks", 20, 10, 4);
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.drawString("Tap once to select, tap again to connect", 20, 38, 2);
  
  // แสดงข้อมูลการเลื่อน
  if (wifiNetworkCount > 4) {
    tft.setTextColor(COLOR_ACCENT, COLOR_CARD_BG);
    tft.setTextDatum(TR_DATUM);
    int totalPages = (wifiNetworkCount + 3) / 4; // ปัดขึ้น
    int currentPage = (wifiScrollIndex / 4) + 1;
    Serial.println("📄 Page calculation - ScrollIndex: " + String(wifiScrollIndex) + ", TotalPages: " + String(totalPages) + ", CurrentPage: " + String(currentPage));
    tft.drawString("Page " + String(currentPage) + "/" + String(totalPages), 460, 38, 2);
    
    // แสดงปุ่มเลื่อน
    tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("Use Previous/Next to scroll", 240, 38, 2);
  } else if (wifiNetworkCount > 0) {
    tft.setTextColor(COLOR_ACCENT, COLOR_CARD_BG);
    tft.setTextDatum(TR_DATUM);
    tft.drawString("Found " + String(wifiNetworkCount) + " networks", 460, 38, 2);
  }
  
  // แสดงรายการ Wi-Fi (แสดง 4 รายการ, เรียงตามสัญญาณแรงที่สุดก่อน)
  int y = 70;
  int visibleCount = min(4, wifiNetworkCount);
  Serial.println("📱 Displaying Wi-Fi networks - ScrollIndex: " + String(wifiScrollIndex) + ", VisibleCount: " + String(visibleCount) + ", TotalNetworks: " + String(wifiNetworkCount));
  
  if (wifiNetworkCount == 0) {
    // ไม่พบ Wi-Fi networks หรือยังไม่ได้สแกน
    tft.setTextColor(COLOR_WARNING, COLOR_DARK);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("No Wi-Fi networks found", 240, 160, 3);
    tft.setTextColor(COLOR_LIGHT, COLOR_DARK);
    tft.drawString("Press 'Rescan' button to scan for networks", 240, 190, 2);
  } else {
    // แสดง Wi-Fi networks
    Serial.println("📱 Showing networks from index " + String(wifiScrollIndex) + " to " + String(wifiScrollIndex + visibleCount - 1));
    for (int i = wifiScrollIndex; i < wifiScrollIndex + visibleCount && i < wifiNetworkCount; i++) {
    Serial.println("📱 Displaying network " + String(i) + ": " + wifiNetworks[i].ssid);
    // สีพื้นหลัง (เปลี่ยนสีถ้าเป็นตัวที่เลือก)
    uint16_t bgColor = (i % 2) ? COLOR_DARK : COLOR_CARD_BG;
    if (selectedWiFiIndex == i) {
      bgColor = COLOR_PRIMARY; // สีน้ำเงินเมื่อเลือก
    }
    tft.fillRoundRect(20, y, 440, 45, 8, bgColor);
    
    // Signal strength icon (ปรับปรุงการแสดงผล)
    int bars = map(wifiNetworks[i].rssi, -90, -30, 1, 4);
    bars = constrain(bars, 1, 4);
    uint16_t signalColor = (wifiNetworks[i].rssi > -50) ? COLOR_SUCCESS : 
                           (wifiNetworks[i].rssi > -70) ? COLOR_WARNING : COLOR_DANGER;
    
    for (int b = 0; b < bars; b++) {
      tft.fillRect(30 + b * 6, y + 30 - b * 6, 4, 6 + b * 6, signalColor);
    }
    
    // SSID (แสดงลำดับความแรงของสัญญาณ)
    tft.setTextColor(TFT_WHITE, bgColor);
    tft.setTextDatum(TL_DATUM);
    String displayText = wifiNetworks[i].ssid;
    if (wifiNetworks[i].rssi > -50) {
      displayText = "📶 " + displayText; // สัญญาณแรงมาก
    } else if (wifiNetworks[i].rssi > -70) {
      displayText = "📶 " + displayText; // สัญญาณปานกลาง
    }
    tft.drawString(displayText, 60, y + 8, 2);
    
    // Encryption icon
    if (wifiNetworks[i].encrypted) {
      tft.setTextColor(COLOR_WARNING, bgColor);
      tft.drawString("🔒", 400, y + 8, 2);
    } else {
      tft.setTextColor(COLOR_SUCCESS, bgColor);
      tft.drawString("🔓", 400, y + 8, 2);
    }
    
    // RSSI with color coding
    tft.setTextColor(signalColor, bgColor);
    tft.drawString(String(wifiNetworks[i].rssi) + " dBm", 60, y + 26, 1);
    
    // แสดงสถานะการเลือก
    if (selectedWiFiIndex == i) {
      tft.setTextColor(TFT_WHITE, bgColor);
      tft.drawString("✓ Selected - Tap again to connect", 200, y + 26, 1);
    }
    
    y += 50;
    }
  }
  
  // Navigation Bar (ปุ่มล่าง) - ปรับปรุงให้สวยขึ้น
  tft.fillRect(0, 260, 480, 60, COLOR_CARD_BG);
  tft.drawLine(0, 260, 480, 260, COLOR_LIGHT);
  
  
  // ปุ่ม Rescan (ซ้าย) - เพิ่มเงา
  tft.fillRoundRect(22, 272, 116, 36, 8, COLOR_DARK);
  tft.fillRoundRect(20, 270, 116, 36, 8, COLOR_PRIMARY);
  tft.drawRoundRect(20, 270, 116, 36, 8, TFT_WHITE);
  tft.setTextColor(TFT_WHITE, COLOR_PRIMARY);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("🔄 Rescan", 78, 288, 2);
  
  // ปุ่ม Use Offline (ขวา) - เพิ่มเงา
  tft.fillRoundRect(342, 272, 116, 36, 8, COLOR_DARK);
  tft.fillRoundRect(340, 270, 116, 36, 8, COLOR_WARNING);
  tft.drawRoundRect(340, 270, 116, 36, 8, TFT_WHITE);
  tft.setTextColor(TFT_WHITE, COLOR_WARNING);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Use Offline", 398, 288, 2);
  
  // ปุ่มเลื่อนขึ้น/ลง (กลาง) - ปรับปรุงให้ชัดเจนขึ้น
  bool canScrollUp = (wifiScrollIndex > 0);
  bool canScrollDown = (wifiScrollIndex < wifiNetworkCount - 4);
  
  // ปุ่มเลื่อนขึ้น (Previous)
  uint16_t upColor = canScrollUp ? COLOR_PRIMARY : COLOR_DARK;
  tft.fillRoundRect(182, 272, 80, 36, 8, COLOR_DARK);
  tft.fillRoundRect(180, 270, 80, 36, 8, upColor);
  tft.drawRoundRect(180, 270, 80, 36, 8, TFT_WHITE);
  tft.setTextColor(TFT_WHITE, upColor);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Previous", 220, 288, 2);
  
  // ปุ่มเลื่อนลง (Next)
  uint16_t downColor = canScrollDown ? COLOR_PRIMARY : COLOR_DARK;
  tft.fillRoundRect(252, 272, 80, 36, 8, COLOR_DARK);
  tft.fillRoundRect(250, 270, 80, 36, 8, downColor);
  tft.drawRoundRect(250, 270, 80, 36, 8, TFT_WHITE);
  tft.setTextColor(TFT_WHITE, downColor);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Next", 290, 288, 2);
  
  // แสดงข้อความสถานะการเลื่อน
  if (wifiNetworkCount > 4) {
    tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("Previous | Next", 240, 250, 2);
  }
}

void connectToWiFi(const String& ssid, const String& password) {
  tft.fillScreen(COLOR_DARK);
  tft.setTextColor(TFT_WHITE, COLOR_DARK);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Connecting to", 240, 120, 4);
  tft.drawString(ssid, 240, 150, 3);
  
  // Debug information
  Serial.println("=== Wi-Fi Connection Debug ===");
  Serial.println("SSID: " + ssid);
  Serial.println("Password length: " + String(password.length()));
  
#if DEBUG_NETWORK
  Serial.println("Password: " + password); // แสดงรหัสผ่านเพื่อ debug
#endif
  
  // Fast WiFi connection setup
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);       // ไม่เขียนแฟลช ลดดีเลย์
  WiFi.setAutoReconnect(true);  // ให้เชื่อมอัตโนมัติ
  
#if FAST_WIFI_CONNECT
  // Fast connect mode - เชื่อมตรง ๆ
  Serial.println("🚀 Fast WiFi connection mode");
  WiFi.begin(ssid.c_str(), password.c_str());
  
  // รอไม่เกิน 5 วินาที
  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < WIFI_CONNECT_TIMEOUT) {
    delay(100);
    tft.fillCircle(200 + ((millis() - startTime) / 200) % 5 * 20, 200, 5, COLOR_PRIMARY);
  }
#else
  // Normal mode - มีการ debug ครบถ้วน
  // รีเซ็ต Wi-Fi module ให้สะอาด
  WiFi.disconnect(true, true);  // ลบข้อมูล Wi-Fi ที่เก็บไว้
  delay(200);
  WiFi.mode(WIFI_OFF);
  delay(200);
  WiFi.mode(WIFI_STA);
  delay(500);
  
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false); // ปิด auto-reconnect ชั่วคราว
  
  // ตรวจสอบว่า SSID มีอยู่ในรายการสแกนหรือไม่
  Serial.println("🔍 Checking if SSID is available...");
  int n = WiFi.scanNetworks();
  bool ssidFound = false;
  for (int i = 0; i < n; i++) {
    if (WiFi.SSID(i) == ssid) {
      ssidFound = true;
      Serial.println("✅ SSID found in scan: " + WiFi.SSID(i) + " (RSSI: " + String(WiFi.RSSI(i)) + " dBm)");
      break;
    }
  }
  
  if (!ssidFound) {
    Serial.println("❌ SSID not found in scan results!");
    Serial.println("Available networks:");
    for (int i = 0; i < n; i++) {
      Serial.println("  " + String(i+1) + ". " + WiFi.SSID(i) + " (RSSI: " + String(WiFi.RSSI(i)) + " dBm)");
    }
  }
  
  Serial.println("WiFi.begin() called");
  WiFi.begin(ssid.c_str(), password.c_str());
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 15) {
    delay(200);
    tft.fillCircle(200 + (attempts % 5) * 20, 200, 5, COLOR_PRIMARY);
    
    // Debug Wi-Fi status
    wl_status_t status = WiFi.status();
    Serial.println("Attempt " + String(attempts + 1) + "/15 - Status: " + String(status));
    
    switch(status) {
      case WL_NO_SSID_AVAIL:
        Serial.println("  → No SSID available");
        break;
      case WL_CONNECT_FAILED:
        Serial.println("  → Connection failed (wrong password?)");
        break;
      case WL_CONNECTION_LOST:
        Serial.println("  → Connection lost");
        break;
      case WL_DISCONNECTED:
        Serial.println("  → Disconnected");
        break;
      case WL_IDLE_STATUS:
        Serial.println("  → Idle");
        break;
      case WL_SCAN_COMPLETED:
        Serial.println("  → Scan completed");
        break;
      default:
        Serial.println("  → Unknown status");
        break;
    }
    
    attempts++;
  }
#endif
  
  wl_status_t finalStatus = WiFi.status();
  Serial.println("Final Wi-Fi status: " + String(finalStatus));
  
  if (finalStatus == WL_CONNECTED) {
    wifiStatus = "Connected";
    Serial.println("✓ Wi-Fi Connected!");
    Serial.println("📡 Connected to: " + ssid);
    Serial.println("🌐 IP Address: " + WiFi.localIP().toString());
    Serial.println("📶 Signal Strength: " + String(WiFi.RSSI()) + " dBm");
    Serial.println("🔗 Gateway: " + WiFi.gatewayIP().toString());
    Serial.println("🌍 DNS: " + WiFi.dnsIP().toString());
    
    // จดจำ Wi-Fi credentials ใน flash memory
    Serial.println("💾 Saving Wi-Fi credentials to flash memory...");
    WiFi.persistent(true);  // เปิดการเก็บ credentials ใน flash
    WiFi.setAutoReconnect(true);  // เปิดการเชื่อมต่อใหม่อัตโนมัติ
    
    // ตรวจสอบว่า credentials ถูกเก็บแล้วหรือไม่
    String savedSSID = WiFi.SSID();
    String savedPassword = WiFi.psk();
    if (savedSSID == ssid && savedPassword.length() > 0) {
      Serial.println("✅ Wi-Fi credentials saved successfully!");
      Serial.println("📡 Saved SSID: " + savedSSID);
      Serial.println("🔑 Password length: " + String(savedPassword.length()) + " characters");
      Serial.println("🔄 Auto-connect enabled for next boot");
    } else {
      Serial.println("⚠️  Wi-Fi credentials may not be saved properly");
    }
    
    wifiDiagnostic(); // Show detailed connection info
    
    tft.fillScreen(COLOR_DARK);
    tft.setTextColor(COLOR_SUCCESS, COLOR_DARK);
    tft.drawString("✓ Connected!", 240, 120, 4);
    tft.setTextColor(TFT_WHITE, COLOR_DARK);
    tft.drawString("SSID: " + ssid, 240, 150, 2);
    tft.drawString("IP: " + WiFi.localIP().toString(), 240, 170, 2);
    tft.setTextColor(COLOR_ACCENT, COLOR_DARK);
    tft.drawString("Signal: " + String(WiFi.RSSI()) + " dBm", 240, 190, 2);
    tft.setTextColor(COLOR_SUCCESS, COLOR_DARK);
    tft.drawString("Credentials saved!", 240, 210, 2);
    
    // แสดงข้อความให้แตะหน้าจอ
    tft.setTextColor(COLOR_WARNING, COLOR_DARK);
    tft.drawString("Tap screen to continue", 240, 240, 2);
    
    // รอการแตะหน้าจอ
    Serial.println("🖱️  Waiting for touch to continue to main page...");
    while (true) {
      uint16_t x, y;
      if (tft.getTouch(&x, &y)) {
        if (millis() - lastTouchTime > 30) { // ลด debounce time
          lastTouchTime = millis();
          Serial.println("🖱️  Touch detected, proceeding to main page...");
          buzzerBeep(60, 0, 1);
          break;
        }
      }
      delay(20); // ลด delay จาก 50 เป็น 20
    }
    
    // แสดง progress dots เร็วมาก
    for (int i = 0; i < 3; i++) {
      tft.fillCircle(220 + i * 20, 220, 3, COLOR_PRIMARY);
      delay(50); // ลดจาก 100 เป็น 50
    }
    
    // ตั้งเวลา NTP (ไม่รอ)
    configTime(7*3600, 0, "pool.ntp.org", "time.nist.gov");
    
    // โหลดโปรไฟล์ (ไม่รอ)
    fbGETDeviceProfile();
    probeSoilSensor(true, 50); // ลด timeout จาก 100 เป็น 50
    
    // ตั้งค่า device profile เริ่มต้น
    g_deviceEnabled = true;
    g_deviceName = String(DEVICE_NAME);
    g_userName = ""; // จะดึงจาก DB ผ่าน API
    
    // ลอง login เข้า PostgreSQL API (ไม่รอผลลัพธ์)
    Serial.println("Attempting PostgreSQL API login after WiFi connection...");
    apiLoginAndGetToken(); // ไม่รอผลลัพธ์
    
    // ดึงข้อมูลอุปกรณ์และ owner (ไม่รอผลลัพธ์)
    Serial.println("Getting device info after WiFi connection...");
    apiHealthCheck(); // ไม่รอผลลัพธ์
    apiGetDeviceInfo(); // ไม่รอผลลัพธ์
    
    // เปลี่ยนหน้าเร็วมาก
    delay(100); // ลดจาก 200 เป็น 100 (0.1 วินาที)
    wifiConfigMode = false;
    onWiFiScanPage = false;
    needsFullRedraw = true;
    showSplashScreen();
    drawHomePage();
  } else {
    wifiStatus = "Not connected";
    Serial.println("✗ Wi-Fi Connection Failed!");
    Serial.println("Final status code: " + String(finalStatus));
    Serial.println("SSID attempted: " + ssid);
    Serial.println("Password used: " + password);
    
    // ตรวจสอบสัญญาณ Wi-Fi
    int rssi = WiFi.RSSI();
    Serial.println("RSSI: " + String(rssi) + " dBm");
    
    String errorMsg = "Connection Failed";
    String detailMsg = "Check password";
    
    switch(finalStatus) {
      case WL_NO_SSID_AVAIL:
        errorMsg = "SSID Not Found";
        detailMsg = "Network unavailable";
        Serial.println("❌ SSID not found in scan results");
        Serial.println("💡 Try rescanning for networks");
        break;
      case WL_CONNECT_FAILED:
        errorMsg = "Wrong Password";
        detailMsg = "Check credentials";
        Serial.println("❌ Authentication failed - wrong password");
        Serial.println("💡 Double-check the password");
        break;
      case WL_CONNECTION_LOST:
        errorMsg = "Connection Lost";
        detailMsg = "Try again";
        Serial.println("❌ Connection lost during handshake");
        Serial.println("💡 Network may be unstable");
        break;
      case WL_DISCONNECTED:
        errorMsg = "Disconnected";
        detailMsg = "Check network";
        Serial.println("❌ Disconnected from network");
        Serial.println("💡 Check if router is working");
        break;
      case WL_IDLE_STATUS:
        errorMsg = "Connection Timeout";
        detailMsg = "Try again";
        Serial.println("❌ Connection timeout");
        Serial.println("💡 Network may be slow or busy");
        break;
      default:
        errorMsg = "Connection Failed";
        detailMsg = "Status: " + String(finalStatus);
        Serial.println("❌ Unknown error status: " + String(finalStatus));
        Serial.println("💡 Try restarting the device");
        break;
    }
    
    tft.fillScreen(COLOR_DARK);
    tft.setTextColor(COLOR_DANGER, COLOR_DARK);
    tft.drawString("✗ " + errorMsg, 240, 100, 4);
    tft.setTextColor(COLOR_LIGHT, COLOR_DARK);
    tft.drawString(detailMsg, 240, 130, 2);
    tft.drawString("SSID: " + ssid, 240, 150, 2);
    tft.setTextColor(COLOR_WARNING, COLOR_DARK);
    tft.drawString("Tap to retry", 240, 180, 2);
    
    // แสดงข้อมูล debug เพิ่มเติม
    tft.setTextColor(COLOR_ACCENT, COLOR_DARK);
    tft.drawString("Debug Info:", 240, 210, 2);
    tft.setTextColor(COLOR_LIGHT, COLOR_DARK);
    tft.drawString("Status: " + String(finalStatus), 240, 230, 1);
    tft.drawString("RSSI: " + String(rssi) + " dBm", 240, 245, 1);
    
    delay(5000); // เพิ่มเวลาดู error message
    showWiFiScanPage();
  }
}

// ================== Keyboard UI ==================
String keyboardInput = "";
bool keyboardShift = false;

const char* keyboardKeys[4][10] = {
  {"1", "2", "3", "4", "5", "6", "7", "8", "9", "0"},
  {"q", "w", "e", "r", "t", "y", "u", "i", "o", "p"},
  {"a", "s", "d", "f", "g", "h", "j", "k", "l", "⌫"},
  {"⇧", "z", "x", "c", "v", "b", "n", "m", ".", "✓"}
};

void showKeyboardPage(const String& ssid) {
  onKeyboardPage = true;
  selectedSSID = ssid;
  keyboardInput = "";
  keyboardShift = false;

  tft.fillScreen(COLOR_DARK);
  tft.fillRect(0, 0, 480, 50, COLOR_CARD_BG);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("🔑 Enter Password", 20, 8, 3);
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.drawString(ssid, 20, 32, 2);

  // Input field
  tft.fillRoundRect(20, 60, 440, 40, 8, TFT_BLACK);
  tft.drawRoundRect(20, 60, 440, 40, 8, COLOR_PRIMARY);

  // == วาดคีย์บอร์ด ==
  int keyW = 44, keyH = 35, startX = 10, startY = 115, gapX = 3, gapY = 3;
  for (int row = 0; row < 4; row++) {
    for (int col = 0; col < 10; col++) {
      int x = startX + col * (keyW + gapX);
      int y = startY + row * (keyH + gapY);
      uint16_t keyColor = COLOR_CARD_BG;
      if (String(keyboardKeys[row][col]) == "⌫") keyColor = COLOR_DANGER;
      else if (String(keyboardKeys[row][col]) == "✓") keyColor = COLOR_SUCCESS;
      else if (String(keyboardKeys[row][col]) == "⇧") keyColor = keyboardShift ? COLOR_WARNING : COLOR_CARD_BG;

      tft.fillRoundRect(x, y, keyW, keyH, 5, keyColor);
      tft.drawRoundRect(x, y, keyW, keyH, 5, COLOR_LIGHT);

      tft.setTextColor(TFT_WHITE, keyColor);
      tft.setTextDatum(MC_DATUM);
      String keyText = String(keyboardKeys[row][col]);
      if (keyboardShift && row >= 1 && row <= 3 && col >= 0 && col < 9) keyText.toUpperCase();
      tft.drawString(keyText, x + keyW/2, y + keyH/2, 2);
    }
  }

  // ✅ ปุ่มย้อนกลับ (ล่างซ้าย)
  drawNavButton(20, 260, 140, 50, COLOR_PRIMARY, "◀ Back");

  updateKeyboardInput();
}


void updateKeyboardInput() {
  tft.fillRoundRect(22, 62, 436, 36, 6, TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextDatum(TL_DATUM);
  
  String displayText = "";
  for (size_t i = 0; i < keyboardInput.length(); i++) {
    displayText += "*";
  }
  tft.drawString(displayText, 30, 72, 2);
  
  // Cursor
  int cursorX = 30 + tft.textWidth(displayText, 2);
  if (millis() % 1000 < 500) {
    tft.fillRect(cursorX, 72, 2, 20, COLOR_PRIMARY);
  }
}

void handleKeyboardTouch(uint16_t x, uint16_t y) {
  // ก่อนเช็คคีย์ ให้เช็คปุ่ม Back ก่อน
  if (inBox(x, y, 20, 270, 120, 40)) {
    buzzerBeep(60, 0, 1);
    onKeyboardPage = false;
    showWiFiScanPage();         // กลับไปหน้าสแกน Wi-Fi
    return;
  }

  int keyW = 44, keyH = 35, startX = 10, startY = 115, gapX = 3, gapY = 3;
  for (int row = 0; row < 4; row++) {
    for (int col = 0; col < 10; col++) {
      int kx = startX + col * (keyW + gapX);
      int ky = startY + row * (keyH + gapY);
      if (x >= kx && x <= kx + keyW && y >= ky && y <= ky + keyH) {
        String key = String(keyboardKeys[row][col]);
        if (key == "⌫") {
          if (keyboardInput.length() > 0) keyboardInput.remove(keyboardInput.length() - 1);
        } else if (key == "⇧") {
          keyboardShift = !keyboardShift;
          showKeyboardPage(selectedSSID);
          return;
        } else if (key == "✓") {
          if (keyboardInput.length() > 0) {
            wifiPassword = keyboardInput;
            onKeyboardPage = false;
            connectToWiFi(selectedSSID, wifiPassword);
          }
          return;
        } else {
          if (keyboardInput.length() < 32) {
            if (keyboardShift) {
              String up = key;   // ทำสำเนา
              up.toUpperCase();  // แปลงเป็นตัวใหญ่
              keyboardInput += up;
              keyboardShift = false;        // กดครั้งเดียวแล้วปลด shift
              showKeyboardPage(selectedSSID); // วาดคีย์บอร์ดใหม่ให้ปุ่ม ⇧ ปิด
              return;
            } else {
              keyboardInput += key;
            }
          }
        }
        updateKeyboardInput();
        buzzerBeep(50, 0, 1);
        return;
      }
    }
  }
}


// ================== UI Screens ==================
void showSplashScreen() {
  tft.fillScreen(COLOR_DARK);
  for (int r = 0; r < 50; r += 15) { tft.drawCircle(240, 160, r, COLOR_SUCCESS); delay(10); } // เร็วมาก
  // plant icon
  auto drawPlantIcon = [&](int x, int y, int size){
    tft.fillRect(x - 3, y, 6, size/2, TFT_GREEN);
    tft.fillCircle(x - size/3, y - size/4, size/4, COLOR_SUCCESS);
    tft.fillCircle(x + size/3, y - size/4, size/4, COLOR_SUCCESS);
    tft.fillCircle(x, y - size/2, size/3, COLOR_SUCCESS);
    tft.fillRect(x - size/2, y + size/2, size, size/3, 0x7BEF);
  };
  drawPlantIcon(240, 160, 40);
  tft.setTextColor(TFT_WHITE, COLOR_DARK);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("Smart Soil Monitor", 240, 220, 4);
  tft.setTextColor(COLOR_LIGHT, COLOR_DARK);
  tft.drawString("v2.0 Enhanced", 240, 250, 2);
  delay(150); // ลดจาก 300 เป็น 150 (0.15 วินาที)
}
void drawPlantIcon(int x, int y, int size) {
  tft.fillRect(x - 3, y, 6, size/2, TFT_GREEN);
  tft.fillCircle(x - size/3, y - size/4, size/4, COLOR_SUCCESS);
  tft.fillCircle(x + size/3, y - size/4, size/4, COLOR_SUCCESS);
  tft.fillCircle(x, y - size/2, size/3, COLOR_SUCCESS);
  tft.fillRect(x - size/2, y + size/2, size, size/3, 0x7BEF);
}

bool inBox(int tx, int ty, int x, int y, int w, int h) {
  return (tx >= x - TOUCH_MARGIN && tx <= x + w + TOUCH_MARGIN &&
          ty >= y - TOUCH_MARGIN && ty <= y + h + TOUCH_MARGIN);
}

bool inBoxExact(int tx, int ty, int x, int y, int w, int h) {
  return (tx >= x && tx <= x + w && ty >= y && ty <= y + h);
}

void handleTouch(uint16_t x, uint16_t y) {
  // Serial.println("🔍 handleTouch called with x=" + String(x) + ", y=" + String(y));
  
  // หน้าแป้นพิมพ์
  if (onKeyboardPage) {
    Serial.println("📱 Handling keyboard touch");
    handleKeyboardTouch(x, y);
    return;
  }
  
  // หน้าสแกน Wi-Fi
  if (onWiFiScanPage) {
    Serial.println("📶 Handling WiFi scan touch");
    // Debug: แสดงตำแหน่งที่กด (ลบออกเพื่อลด spam)
    // Serial.println("🖱️ Touch detected at: x=" + String(x) + ", y=" + String(y));
    
    // ตรวจสอบปุ่มก่อน (เพื่อไม่ให้ทับกับ Wi-Fi list)
    
    // ปุ่ม Rescan (ซ้าย) - x: 20-136, y: 270-306
    if (inBoxExact(x, y, 20, 270, 116, 36)) {
        buzzerBeep(60, 0, 1);
      Serial.println("🔄 User requested Wi-Fi rescan");
      
      // แสดงสถานะการสแกน
      tft.fillScreen(COLOR_DARK);
      tft.setTextColor(TFT_WHITE, COLOR_DARK);
      tft.setTextDatum(MC_DATUM);
      tft.drawString("Rescanning Wi-Fi...", 240, 160, 4);
      
      // แสดง progress indicator
      for (int i = 0; i < 5; i++) {
        tft.fillCircle(200 + i * 20, 200, 3, COLOR_PRIMARY);
        delay(50); // ลด delay จาก 100 เป็น 50
      }
      
      wifiReset();           // ← ตัดการเชื่อม/ปิด auto-reconnect/เคลียร์ตัวแปร
      selectedWiFiIndex = -1; // รีเซ็ตการเลือก Wi-Fi
      wifiScrollIndex = 0;    // รีเซ็ตการเลื่อนกลับไปหน้าแรก
      scanWiFiNetworks();    // ← สแกน Wi-Fi networks
      showWiFiScanPage();    // ← แสดงผลหน้าใหม่
      
      Serial.println("✅ Wi-Fi rescan completed");
      return;
    }
    
    // ปุ่ม Use Offline (ขวา)
    if (inBoxExact(x, y, 340, 270, 116, 36)) {
      buzzerBeep(60, 0, 1);
      Serial.println("🔌 User selected Offline Mode");
      
      // Reset Wi-Fi และตั้งค่า offline mode
      wifiReset();
      selectedWiFiIndex = -1; // รีเซ็ตการเลือก Wi-Fi
      wifiConfigMode = false;
      onWiFiScanPage = false;
      wifiStatus = "Offline Mode";
      
      // ตั้งค่า device profile สำหรับ offline mode
      g_deviceEnabled = true;
      g_deviceName = String(DEVICE_NAME);
      g_userName = ""; // จะดึงจาก DB เมื่อมีเน็ต
      
      // ตรวจสอบ sensor แบบเร็ว (ลดเวลา)
      probeSoilSensor(false, 10);  // ไม่แสดง splash, timeout 10ms
      
      // ไปที่หน้า main
      needsFullRedraw = true;
      drawHomePage();
      
      Serial.println("✅ Switched to Offline Mode");
      return;
    }
    
    // ปุ่มเลื่อนขึ้น (Previous)
    if (inBoxExact(x, y, 180, 270, 80, 36)) {
      buzzerBeep(60, 0, 1);
      Serial.println("🔍 Previous button pressed - Current index: " + String(wifiScrollIndex) + ", Total networks: " + String(wifiNetworkCount));
      if (wifiScrollIndex > 0) {
        wifiScrollIndex -= 4;  // เลื่อนกลับไป 4 ตัว
        if (wifiScrollIndex < 0) wifiScrollIndex = 0;  // ไม่ให้ติดลบ
        Serial.println("📜 Scrolled up to Wi-Fi index: " + String(wifiScrollIndex));
        showWiFiScanPageWithoutScan();
      } else {
        Serial.println("📜 Already at top");
      }
      return;
    }
    
    // ปุ่มเลื่อนลง (Next)
    if (inBoxExact(x, y, 250, 270, 80, 36)) {
      buzzerBeep(60, 0, 1);
      Serial.println("🔍 Next button pressed - Current index: " + String(wifiScrollIndex) + ", Total networks: " + String(wifiNetworkCount));
      Serial.println("🔍 Condition check: " + String(wifiScrollIndex + 4) + " < " + String(wifiNetworkCount) + " = " + String(wifiScrollIndex + 4 < wifiNetworkCount));
      if (wifiScrollIndex + 4 < wifiNetworkCount) {
        wifiScrollIndex += 4;  // เลื่อนไป 4 ตัว
        Serial.println("📜 Scrolled down to Wi-Fi index: " + String(wifiScrollIndex));
        showWiFiScanPageWithoutScan();
      } else {
        Serial.println("📜 Already at bottom - ScrollIndex: " + String(wifiScrollIndex) + ", Networks: " + String(wifiNetworkCount));
      }
      return;
    }
    
    // ตรวจสอบว่ากดที่ Wi-Fi network ไหน (หลังจากตรวจสอบปุ่มทั้งหมดแล้ว)
    int y_pos = 70;
    int visibleCount = min(4, wifiNetworkCount);
    
    for (int i = wifiScrollIndex; i < wifiScrollIndex + visibleCount && i < wifiNetworkCount; i++) {
      if (y >= y_pos && y <= y_pos + 45) { // พื้นที่ Wi-Fi item (45px สูง)
        buzzerBeep(60, 0, 1);
        
        unsigned long currentTime = millis();
        
        // ตรวจสอบ double-tap
        if (selectedWiFiIndex == i && (currentTime - lastWiFiTapTime) < DOUBLE_TAP_TIMEOUT) {
          // Double-tap: เชื่อมต่อทันที
          Serial.println("🔗 Double-tap detected, connecting to: " + wifiNetworks[i].ssid);
          if (wifiNetworks[i].encrypted) {
            showKeyboardPage(wifiNetworks[i].ssid);
          } else {
            connectToWiFi(wifiNetworks[i].ssid, "");
          }
          selectedWiFiIndex = -1; // รีเซ็ตการเลือก
          return;
        } else {
          // Single-tap: เลือก network
          selectedWiFiIndex = i;
          lastWiFiTapTime = currentTime;
          Serial.println("📡 Selected Wi-Fi: " + wifiNetworks[i].ssid);
          
          // อัปเดต UI
          showWiFiScanPageWithoutScan();
          return;
        }
      }
      y_pos += 50;
    }
    
    return;
  }
  if (onHistoryPage) {
    Serial.println("📊 Handling history page touch");
    if (inBox(x, y, 20, 270, 100, 40)) {
      Serial.println("⬅️ Previous button pressed");
      if (currentIndex >= 4) currentIndex -= 4;
      showHistoryPage();
    }
    else if (inBox(x, y, 360, 270, 100, 40)) {
      Serial.println("➡️ Next button pressed");
      if (currentIndex + 4 < historyCount) currentIndex += 4;
      showHistoryPage();
    }
    else {
      Serial.println("🔙 Back to home");
      onHistoryPage = false;
      needsFullRedraw = true;
      drawHomePage();
    }
  } else if (onResultsPage) {
    Serial.println("📊 Handling results page touch");
    bool hitBack = inBox(x, y, 10, 250, 160, 60) || (x < 160 && y > 240);
    bool hitHist = inBox(x, y, 330, 250, 140, 60) || (x > 320 && y > 240);
    if (hitBack) { 
      Serial.println("🔙 Back button pressed");
      onResultsPage = false; 
      needsFullRedraw = true; 
      drawHomePage(); 
    }
    else if (hitHist) { 
      Serial.println("📊 History button pressed");
      onResultsPage = false; 
      onHistoryPage = true; 
      currentIndex = 0; 
      showHistoryPage(); 
    }
  } else {
    Serial.println("🏠 Handling home page touch");
#if FB_ENFORCE_REGISTRATION
    if (!g_deviceEnabled && WiFi.status()==WL_CONNECTED) {
      showMessage("Please contact admin to enable device", COLOR_WARNING);
      drawHomePage();
      return;
    }
#endif
    // Debug: แสดงตำแหน่งที่กด (ลบออกเพื่อลด spam)
    // Serial.println("🖱️ Touch at: x=" + String(x) + ", y=" + String(y));
    // Serial.println("🔍 START button area: x=70-190, y=208-268");
    // Serial.println("🔍 HISTORY button area: x=270-390, y=208-268");
    
    if (inBox(x, y, 70, 208, BTN_W, BTN_H) || x < 240) {
      Serial.println("✅ START button pressed - starting measurement");
      buttonPressAnimation(70, 208, BTN_W, BTN_H, COLOR_SUCCESS);
      readAndDisplaySensors();
    } else if (inBox(x, y, 270, 208, BTN_W, BTN_H) || x >= 240) {
      Serial.println("✅ HISTORY button pressed - starting measurement + history");
      buttonPressAnimation(270, 208, BTN_W, BTN_H, COLOR_PRIMARY);
      // ทำการวัดค่าก่อนแสดงหน้า History
      readAndDisplaySensors();
      // แสดงหน้า History หลังจากวัดค่าเสร็จ
      if (historyCount > 0) { 
        onHistoryPage = true; 
        currentIndex = historyCount - 1; // แสดงข้อมูลล่าสุด
        showHistoryPage(); 
      }
    } else {
      // Serial.println("❌ Touch outside button areas");
    }
  }
}

void buttonPressAnimation(int x, int y, int w, int h, uint16_t color) {
  tft.fillRoundRect(x + 2, y + 2, w, h, BTN_RADIUS, color); delay(50);
  tft.fillRoundRect(x, y, w, h, BTN_RADIUS, color); delay(50);
}

void updateTime() {
  unsigned long seconds = millis() / 1000;
  int hrs = (seconds / 3600) % 24;
  int mins = (seconds / 60) % 60;
  int secs = seconds % 60;
  sprintf(timeStr, "%02d:%02d:%02d", hrs, mins, secs);
}

void drawGradientBackground() {
  for (int y = 0; y < 320; y++) {
    uint8_t intensity = map(y, 0, 320, 0, 50);
    uint16_t color = tft.color565(intensity/4, intensity/8, intensity/2);
    tft.drawFastHLine(0, y, 480, color);
  }
}

// === Status Card ===
void drawStatusCard() {
  const int X = 30, W = 420, Y = 92, H = 110;
  tft.fillRoundRect(X+3, Y+3, W, H, 16, COLOR_DARK);
  tft.fillRoundRect(X,   Y,   W, H, 16, COLOR_CARD_BG);
  tft.drawRoundRect(X,   Y,   W, H, 16, COLOR_LIGHT);

  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("Device Profile", X + 14, Y + 8, 2);

  uint16_t tagCol = g_deviceEnabled ? COLOR_SUCCESS : COLOR_WARNING;
  String   tagTxt = g_deviceEnabled ? "ENABLED" : "DISABLED";
  int tagW = tft.textWidth(tagTxt, 2) + 14;
  tft.fillRoundRect(X + W - tagW - 10, Y + 8, tagW, 20, 8, tagCol);
  tft.setTextColor(TFT_WHITE, tagCol);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(tagTxt, X + W - tagW/2 - 10, Y + 18, 2);

  tft.drawLine(X + 12, Y + 34, X + W - 12, Y + 34, COLOR_LIGHT);

  int lx = X + 18, ly = Y + 44, lh = 20;
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("Device", lx, ly, 2);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.drawString(g_deviceName.length() ? g_deviceName : String(DEVICE_NAME), lx + 90, ly, 2);

  ly += lh;
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.drawString("Owner", lx, ly, 2);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  String ownerDisplay = g_userName.length() ? g_userName : "—";
  tft.drawString(ownerDisplay, lx + 90, ly, 2);
  
  // Debug: แสดงชื่อ Owner ใน Serial (ลบออกเพื่อลด spam)
  // Serial.println("👤 Owner display: " + ownerDisplay + " (length: " + String(g_userName.length()) + ")");

  int rx = X + W/2 + 10, ry = Y + 44;
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.drawString("Wi-Fi", rx, ry, 2);
  tft.setTextColor((wifiStatus == "Connected")? COLOR_SUCCESS : COLOR_DANGER, COLOR_CARD_BG);
  tft.drawString(wifiStatus, rx + 60, ry, 2);

  ry += lh;
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.drawString("Sensor", rx, ry, 2);
  tft.setTextColor(soilSensor_online ? COLOR_SUCCESS : COLOR_DANGER, COLOR_CARD_BG);
  tft.drawString(soilSensor_online? "Online" : "Offline", rx + 60, ry, 2);

  // แสดงสถานะ API
  ly += lh;
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.drawString("API", lx, ly, 2);
  tft.setTextColor(apiConnected ? COLOR_SUCCESS : COLOR_DANGER, COLOR_CARD_BG);
  tft.drawString(apiConnected ? "Connected" : "Disconnected", lx + 90, ly, 2);

  // แสดง GPS Status
  ry += lh;
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.drawString("GPS", rx, ry, 2);
  String gpsStatus = g_gpsValid ? "Valid" : "Searching";
  uint16_t gpsColor = g_gpsValid ? COLOR_SUCCESS : COLOR_WARNING;
  tft.setTextColor(gpsColor, COLOR_CARD_BG);
  tft.drawString(gpsStatus, rx + 60, ry, 2);
  
  // แสดงจำนวนดาวเทียม
  if (g_gpsValid) {
    ry += lh;
    tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
    tft.drawString("Sats", rx, ry, 2);
    tft.setTextColor(COLOR_SUCCESS, COLOR_CARD_BG);
    tft.drawString(String(g_satellites), rx + 60, ry, 2);
  }
  
}

void drawEnhancedButton(int x, int y, int w, int h, uint16_t color, const char* title, const char* subtitle) {
  tft.fillRoundRect(x + 4, y + 4, w, h, BTN_RADIUS, COLOR_DARK);
  tft.fillRoundRect(x, y, w, h, BTN_RADIUS, color);
  tft.fillRoundRect(x, y, w, h/3, BTN_RADIUS, tft.color565(
    min(255, ((color >> 11) & 0x1F) * 8 + 30),
    min(255, ((color >> 5) & 0x3F) * 4 + 30),
    min(255, (color & 0x1F) * 8 + 30)
  ));
  tft.drawRoundRect(x, y, w, h, BTN_RADIUS, TFT_WHITE);
  tft.setTextColor(TFT_WHITE, color);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(title, x + w/2, y + h/2 - 8, 2);
  tft.setTextColor(COLOR_LIGHT, color);
  tft.drawString(subtitle, x + w/2, y + h/2 + 10, 1);
}

void drawFooter() {
  tft.fillRoundRect(190, 280, 100, 30, 10, COLOR_CARD_BG);
  tft.setTextColor(COLOR_ACCENT, COLOR_CARD_BG);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("⏰ " + String(timeStr), 240, 295, 2);
  tft.setTextColor(COLOR_LIGHT, TFT_BLACK);
  tft.drawString("Enhanced UI v2.0", 240, 315, 1);
}

// === หน้า Home ===
void drawHomePage() {
  drawGradientBackground();
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("Smart Soil Monitor", 96, 28, 4);
  tft.setTextColor(COLOR_LIGHT, TFT_BLACK);
  tft.drawString("Advanced Agriculture Solution", 96, 56, 2);
  drawStatusCard();
  drawEnhancedButton(70,  208, BTN_W, BTN_H, COLOR_SUCCESS, "🚀 START",   "Begin Scan");
  drawEnhancedButton(270, 208, BTN_W, BTN_H, COLOR_PRIMARY, "📊 HISTORY", "View Data");
  drawFooter();
  needsTimeRedraw = false;
  needsWifiRedraw = false;
  Serial.println("Enhanced home page drawn");
}

void updateHomePage() {
  if (needsTimeRedraw) {
    tft.fillRoundRect(190, 280, 100, 30, 10, COLOR_CARD_BG);
    tft.setTextColor(COLOR_ACCENT, COLOR_CARD_BG);
    tft.setTextDatum(MC_DATUM);
    tft.drawString("⏰ " + String(timeStr), 240, 295, 2);
    needsTimeRedraw = false;
  }
  if (needsWifiRedraw) {
    drawStatusCard();
    needsWifiRedraw = false;
  }
}

void showMessage(const char* msg, uint16_t color) {
  tft.fillRect(0, 0, 480, 320, tft.color565(0, 0, 0));
  tft.fillRoundRect(60, 110, 360, 100, 20, COLOR_CARD_BG);
  tft.drawRoundRect(60, 110, 360, 100, 20, color);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(msg, 240, 160, 2);
  delay(150); // ลดจาก 300 เป็น 150 (0.15 วินาที)
  needsFullRedraw = true;
}

// ================== Cards ==================
void drawSensorCard(int x, int y, const char* label, String value, uint16_t color) {
  tft.fillRoundRect(x + 2, y + 2, 190, 50, 10, COLOR_DARK);
  tft.fillRoundRect(x, y, 190, 50, 10, COLOR_CARD_BG);
  tft.drawRoundRect(x, y, 190, 50, 10, color);
  tft.fillCircle(x + 15, y + 25, 5, color);
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.setTextDatum(TL_DATUM);
  tft.drawString(label, x + 30, y + 10, 2);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.drawString(value, x + 30, y + 28, 2);
}

// อัปเดตเฉพาะค่าบนการ์ด (ไม่วาดกรอบใหม่)
void updateCardValueArea(int x, int y, String value) {
  tft.fillRect(x + 30, y + 28, 150, 16, COLOR_CARD_BG);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.setTextDatum(TL_DATUM);
  tft.drawString(value, x + 30, y + 28, 2);
}

uint16_t getTemperatureColor(float temp) {
  if (isnan(temp)) return COLOR_WARNING;
  if (temp > 35) return COLOR_DANGER;
  if (temp > 25) return COLOR_WARNING;
  return COLOR_SUCCESS;
}
uint16_t getPhColor(float ph_val) {
  if (isnan(ph_val)) return COLOR_WARNING;
  if (ph_val < 6.0 || ph_val > 8.0) return COLOR_DANGER;
  return COLOR_SUCCESS;
}
uint16_t getMoistureColor(int moisturePct) {
  if (!soilSensor_online) return COLOR_DANGER;
  if (moisturePct > 60) return COLOR_SUCCESS;
  if (moisturePct > 30) return COLOR_WARNING;
  return COLOR_DANGER;
}

// อัปเดต progress ตามจำนวนตัวอย่าง
void updateSensorProgressBySamplesF(float progress) {
  float p = constrain(progress, 0.0f, 100.0f);
  int pw = (int)(p * 4.0f); // 100% = 400px
  tft.fillRoundRect(40, 76, 400, 20, 10, COLOR_CARD_BG);
  tft.fillRoundRect(40, 76, pw, 20, 10, COLOR_SUCCESS);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(String(p, 1) + "% Complete", 240, 86, 2);

  // ค่าไลฟ์
  updateCardValueArea(40,  100, String(lastTemp, 1) + "°C");
  updateCardValueArea(250, 100, String(lastPh,   1));
  updateCardValueArea(40,  160, String(lastMoisture) + "%");
  updateCardValueArea(250, 160, fmtNPK_live(lastN));
  updateCardValueArea(40,  220, fmtNPK_live(lastP));
  updateCardValueArea(250, 220, fmtNPK_live(lastK));
}
void updateSensorProgressBySamples(int progress) { updateSensorProgressBySamplesF((float)progress); }

// ================== หน้าอ่านค่า ==================
void drawSensorReadingPage(unsigned long startTime, unsigned long duration) {
  tft.fillScreen(COLOR_DARK);
  tft.setTextColor(TFT_WHITE, COLOR_DARK);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("🔍 Analyzing Soil Conditions", 240, 28, 4);

  drawChip(16, 40, g_soilContact ? "Probe: IN SOIL" : "Probe: AIR",
           g_soilContact ? COLOR_SUCCESS : COLOR_WARNING);

  int progress = (int)((millis() - startTime) * 100UL / duration);
  progress = constrain(progress, 0, 100);
  tft.fillRoundRect(40, 76, 400, 20, 10, COLOR_CARD_BG);
  tft.fillRoundRect(40, 76, map(progress, 0, 100, 0, 400), 20, 10, COLOR_SUCCESS);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(String(progress) + "% Complete", 240, 86, 2);

  drawSensorCard(40,  100, "🌡️ Temperature", String(isnan(lastTemp)?0:lastTemp, 1) + "°C", getTemperatureColor(lastTemp));
  drawSensorCard(250, 100, "💧 pH",           String(isnan(lastPh)?0:lastPh, 1),          getPhColor(lastPh));
  drawSensorCard(40,  160, "💦 Moisture",     String(lastMoisture) + "%",                  getMoistureColor(lastMoisture));
  drawSensorCard(250, 160, "🌱 Nitrogen",     fmtNPK_live(lastN),                          COLOR_SUCCESS);
  drawSensorCard(40,  220, "🍃 Phosphorus",   fmtNPK_live(lastP),                          COLOR_SUCCESS);
  drawSensorCard(250, 220, "🌾 Potassium",    fmtNPK_live(lastK),                          COLOR_SUCCESS);
}

// (median 3)
float med3f(float a,float b,float c){
  if (a>b) { float t=a; a=b; b=t; }
  if (b>c) { float t=b; b=c; c=t; }
  if (a>b) { float t=a; a=b; b=t; }
  return b;
}
int med3i(int a,int b,int c){
  if (a>b) { int t=a; a=b; b=t; }
  if (b>c) { int t=b; b=c; c=t; }
  if (a>b) { int t=a; a=b; b=t; }
  return b;
}

// ============ Result Page UI Helpers ============
void drawRibbonHeader(const char* title, const char* subtitle) {
  tft.fillRect(0, 0, 480, 58, COLOR_CARD_BG);
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.drawString(title, 16, 8, 4);
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.drawString(subtitle, 18, 36, 2);
}
void drawChip(int x, int y, const String& text, uint16_t color) {
  int w = tft.textWidth(text, 2) + 14;
  tft.fillRoundRect(x, y, w, 20, 8, color);
  tft.setTextColor(TFT_WHITE, color);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(text, x + w/2, y + 10, 2);
}
void drawMetricTile(int x, int y, int w, int h,
                    const char* title, const String& value, const char* unit,
                    uint16_t frameColor, uint16_t /*glowColor*/,
                    const char* icon) {
  tft.fillRoundRect(x+2, y+2, w, h, 10, COLOR_DARK);
  tft.fillRoundRect(x,   y,   w, h, 10, COLOR_CARD_BG);
  tft.drawRoundRect(x,   y,   w, h, 10, frameColor);

  tft.setTextDatum(TL_DATUM);
  tft.setTextPadding(0);
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.setTextFont(2);
  tft.drawString(icon,  x + 6,  y + 4);
  tft.drawString(title, x + 24, y + 4);

  char vbuf[24];
  snprintf(vbuf, sizeof(vbuf), "%s", value.c_str());
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.setTextFont(2);
  int vx = x + 10;
  int vy = y + h - 20;
  tft.drawString(vbuf, vx, vy);

  if (unit && unit[0]) {
    int valW = tft.textWidth(vbuf);
    tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
    tft.setTextFont(1);
    tft.drawString(unit, vx + valW + 6, vy + 2);
  }
}
void drawLegendBarAt(int baseY) {
  const int H = 24;
  tft.fillRoundRect(20, baseY, 440, H, 8, COLOR_CARD_BG);
  tft.drawRoundRect(20, baseY, 440, H, 8, COLOR_LIGHT);
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.setTextFont(2);
  tft.drawString("Legend:", 28, baseY + 5);
  auto dot = [&](int cx, int cy, uint16_t c, const char* txt){
    tft.fillCircle(cx, cy, 4, c);
    tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
    tft.setTextFont(1);
    tft.drawString(txt, cx + 10, cy - 4);
  };
  int cy = baseY + H/2;
  dot(110, cy, COLOR_SUCCESS, "Good");
  dot(190, cy, COLOR_WARNING, "Warning");
  dot(280, cy, COLOR_DANGER,  "Critical");
}
void drawLegendBar() { drawLegendBarAt(240); }

static String fmtLatLon(float lat, float lon) {
  if (isnan(lat) || isnan(lon)) return "N/A";
  return String(lat, 6) + ", " + String(lon, 6);
}

void showHistoryPage() {
  onHistoryPage = true;

  tft.fillScreen(COLOR_DARK);
  tft.fillRect(0, 0, 480, 72, COLOR_CARD_BG);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("📊 Historical Data Analysis", 20, 12, 4);
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.drawString("Soil monitoring records", 20, 40, 2);

  tft.setTextColor(COLOR_ACCENT, COLOR_CARD_BG);
  tft.setTextDatum(TR_DATUM);
  tft.drawString("📍 " + fmtLatLon(g_lat, g_lon), 460, 40, 2);

  if (historyCount == 0) {
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(COLOR_WARNING, COLOR_DARK);
    tft.drawString("📭 No historical data available", 240, 160, 3);
    tft.setTextColor(COLOR_LIGHT, COLOR_DARK);
    tft.drawString("Start monitoring to collect data", 240, 190, 2);
  } else {
    drawHistoryTable();
  }

  drawNavButton(20, 260, 120, 50, currentIndex > 0 ? COLOR_PRIMARY : COLOR_DARK, "◀ Prev");
  drawNavButton(340, 260, 120, 50, currentIndex + 4 < historyCount ? COLOR_PRIMARY : COLOR_DARK, "Next ▶");

  tft.setTextColor(COLOR_ACCENT, COLOR_DARK);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("👆 Touch anywhere to return home", 240, 295, 2);
}

uint16_t getMoistureColorValueOnly(int moisturePct) {
  if (moisturePct > 60) return COLOR_SUCCESS;
  if (moisturePct > 30) return COLOR_WARNING;
  return COLOR_DANGER;
}

void drawHistoryTable() {
  int y = 84;
  tft.fillRoundRect(20, y, 440, 30, 5, COLOR_PRIMARY);
  tft.setTextColor(TFT_WHITE, COLOR_PRIMARY);
  tft.setTextDatum(TL_DATUM);

  tft.drawString("Plot", 30, y + 8, 2);
  tft.drawString("Time", 80, y + 8, 2);
  tft.drawString("Temp", 140, y + 8, 2);
  tft.drawString("pH", 180, y + 8, 2);
  tft.drawString("NPK", 210, y + 8, 2);
  tft.drawString("Moisture", 330, y + 8, 2);
  tft.drawString("Status", 420, y + 8, 2);

  y += 35;
  int rowsShown = 0;
  for (int i = currentIndex; i < currentIndex + 4 && i < historyCount && rowsShown < 4; i++) {
    uint16_t bgColor = (rowsShown % 2) ? COLOR_DARK : COLOR_CARD_BG;
    tft.fillRoundRect(20, y, 440, 30, 5, bgColor);

    uint16_t statusColor = getMoistureColorValueOnly(historyData[i].moisture);
    tft.fillCircle(35, y + 15, 8, statusColor);

    tft.setTextColor(TFT_WHITE, bgColor);
    tft.drawString(historyData[i].plot, 50, y + 8, 2);
    tft.drawString(historyData[i].time, 80, y + 8, 2);
    tft.drawString(String(historyData[i].temp, 1), 140, y + 8, 2);
    tft.drawString(String(historyData[i].ph, 1), 180, y + 8, 2);

    String npk = fmtN0(historyData[i].n) + "/" + fmtN0(historyData[i].p) + "/" + fmtN0(historyData[i].k);
    tft.drawString(npk, 210, y + 8, 2);
    tft.drawString(String(historyData[i].moisture) + "%", 330, y + 8, 2);

    tft.setTextColor(statusColor, bgColor);
    String status = historyData[i].moisture > 60 ? "Good" : (historyData[i].moisture > 30 ? "Low" : "Critical");
    tft.drawString(status, 420, y + 8, 2);

    y += 35;
    rowsShown++;
  }
}

void drawNavButton(int x, int y, int w, int h, uint16_t color, const char* text) {
  tft.fillRoundRect(x + 2, y + 2, w, h, 8, COLOR_DARK);
  tft.fillRoundRect(x, y, w, h, 8, color);
  tft.drawRoundRect(x, y, w, h, 8, TFT_WHITE);
  tft.setTextColor(TFT_WHITE, color);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(text, x + w/2, y + h/2, 2);
}

// ================== Extra UI Helpers (optional) ==================
void drawFloatingActionButton(int x, int y, const char* icon) {
  tft.fillCircle(x + 3, y + 3, 25, COLOR_DARK);
  tft.fillCircle(x, y, 25, COLOR_ACCENT);
  tft.drawCircle(x, y, 25, TFT_WHITE);
  tft.drawCircle(x, y, 26, COLOR_LIGHT);
  tft.setTextColor(TFT_WHITE, COLOR_ACCENT);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(icon, x, y, 4);
}

void drawWeatherWidget(int x, int y) {
  tft.fillRoundRect(x, y, 150, 60, 10, COLOR_CARD_BG);
  tft.drawRoundRect(x, y, 150, 60, 10, COLOR_LIGHT);
  tft.setTextColor(TFT_WHITE, COLOR_CARD_BG);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("🌤️ Weather", x + 10, y + 10, 2);
  tft.drawString("Temp: " + String(lastTemp, 1) + "°C", x + 10, y + 30, 2);
  tft.drawString("Humidity: 65%", x + 10, y + 45, 1);
}

// ====== ★★ เพิ่มสองฟังก์ชันสำคัญให้หลังตัวแปร lastN/lock แล้ว ★★

// อัปเดตการ์ด NPK ทันทีบนหน้าวัดค่า
static inline void updateNPKCards() {
  updateCardValueArea(250, 160, fmtNPK_live(lastN));  // Nitrogen
  updateCardValueArea(40,  220, fmtNPK_live(lastP));  // Phosphorus
  updateCardValueArea(250, 220, fmtNPK_live(lastK));  // Potassium
}

// รีเฟรช NPK-only แบบไว (ล็อก mapping แล้วจะเร็วมาก)
static bool refreshNPKLive(uint8_t sid, bool allowSmartOnce) {
  int sn=0, sp=0, sk=0;
  bool ok = rs485ReadNPK_fastPreferLocked(sn, sp, sk, sid, 55);
  if (!ok && allowSmartOnce && !g_npk_locked) {
    ok = rs485ReadNPK_smart(sn, sp, sk, sid, 150);  // สแกนสั้น ๆ ช่วงต้น
  }
  if (ok) {
    pickBetterNPK(lastN, lastP, lastK, sn, sp, sk);
    updateNPKCards();
    return true;
  }
  return false;
}

// ================== อ่านค่า + โชว์ผล (30 ตัวอย่าง/3วิ + ค่าเฉลี่ย) ==================
void readAndDisplaySensors() {
  Serial.println("🚀 Starting sensor measurement...");
  Serial.println("Measure 30 samples in 3s (10Hz), smooth progress 3.3% each, then Results");

  const int SAMPLES_NEEDED = 30;
  const unsigned long SAMPLE_PERIOD = 100;               // 100ms = 10Hz
  const unsigned long TOTAL_MS = SAMPLES_NEEDED * 100;   // 3000ms

  // หา sensor id ล่วงหน้าแบบเร็ว (ไม่กระทบ 3 วิ)
  uint8_t sid = detectSensorId(SENSOR_ID);

  // --- NEW: seed ค่าก่อนเริ่มนับเวลา เพื่อให้ NPK โชว์ทันทีที่เข้าหน้าวัด ---
  {
    float humPct=0, tempC=0, ph=0; int nVal=0, pVal=0, kVal=0;
    if (rs485ReadAll(humPct, tempC, ph, nVal, pVal, kVal, sid, 70)) {
      lastTemp     = tempC;
      lastPh       = ph;
      lastMoisture = (int)round(humPct);
      lastN        = nVal;
      lastP        = pVal;
      lastK        = kVal;
      fastSoilContact(humPct, ph, nVal, pVal, kVal);
    }
    int fn=0, fp=0, fk=0;
    if (rs485ReadNPK_fastPreferLocked(fn, fp, fk, sid, 60)) {
      pickBetterNPK(lastN, lastP, lastK, fn, fp, fk);
    }
    // updateNPKCards();  // ★ แสดง NPK ก่อนเริ่มนับ 3 วินาที
  }

  unsigned long t0 = millis();
  onResultsPage = false;
  drawSensorReadingPage(t0, TOTAL_MS);   // วาดหน้าวัดก่อน
  updateSensorProgressBySamplesF(0.0f);
  updateNPKCards();                      // แล้วค่อยอัปเดตค่า NPK บนการ์ด

  // สะสมค่าเพื่อเฉลี่ย
  float sumTemp = 0.0f, sumPh = 0.0f;
  long  sumMoist = 0, sumN = 0, sumP = 0, sumK = 0;
  int   good = 0;
  bool  sawSoil = false;

  for (int i = 0; i < SAMPLES_NEEDED; ++i) {
    unsigned long target = t0 + (unsigned long)((i+1) * SAMPLE_PERIOD);

    float humPct=0, tempC=0, ph=0;
    int nVal=0, pVal=0, kVal=0;
    bool ok = rs485ReadAll(humPct, tempC, ph, nVal, pVal, kVal, sid, 70);

    if (ok) {
      soilSensor_online = true;

      bool contactNow = fastSoilContact(humPct, ph, nVal, pVal, kVal);
      if (contactNow) sawSoil = true;

      // ค่าไลฟ์
      lastTemp     = tempC;
      lastPh       = ph;
      lastMoisture = (int)round(humPct);
      lastN        = nVal;
      lastP        = pVal;
      lastK        = kVal;

      // อัปเดตชิปสถานะ
      tft.fillRect(16, 40, 200, 22, COLOR_DARK);
      drawChip(16, 40, contactNow ? "Probe: IN SOIL" : "Probe: AIR",
               contactNow ? COLOR_SUCCESS : COLOR_WARNING);

      // ★★ ดึง NPK-only แบบไวทุก ๆ 3 ตัวอย่าง หรือเมื่อยังเป็น 0 ขณะอยู่ในดิน ★★
      if (contactNow && ( ((i % 3) == 0) || (lastN==0 && lastP==0 && lastK==0) )) {
        bool allowSmart = (!g_npk_locked && i <= 3);
        (void) refreshNPKLive(sid, allowSmart); // updateNPKCards() จะถูกเรียกภายใน
      }

      // สะสมเพื่อเฉลี่ย
      sumTemp  += tempC;  sumPh += ph;  sumMoist += lastMoisture;
      sumN     += lastN;  sumP  += lastP; sumK += lastK;
      good++;

      Serial.printf("[SAMPLE %02d] H=%.1f T=%.1f pH=%.1f soil=%d N=%d P=%d K=%d\n",
                    i+1, humPct, tempC, ph, (int)contactNow, lastN, lastP, lastK);
    } else {
      soilSensor_online = false;
    }

    // โปรเกรส + refresh ค่าไลฟ์บนการ์ด (รวม NPK)
    float pf = (i+1) * (100.0f / (float)SAMPLES_NEEDED);
    updateSensorProgressBySamplesF(pf);

    while ((long)(millis() - target) < 0) { delay(0); }
    yield();
  }

  if (good > 0) {
    lastTemp     = sumTemp / good;
    lastPh       = sumPh   / good;
    lastMoisture = (int) round((double)sumMoist / good);
    lastN        = (int) round((double)sumN / good);
    lastP        = (int) round((double)sumP / good);
    lastK        = (int) round((double)sumK / good);
  }

  // refine NPK เร็ว ๆ 1 ครั้ง (ถ้าเคย IN SOIL)
  if (sawSoil) {
    int sn=0, sp=0, sk=0;
    if (rs485ReadNPK_fastPreferLocked(sn, sp, sk, sid, 80)) {
      pickBetterNPK(lastN, lastP, lastK, sn, sp, sk);
      updateNPKCards();
    }
  }

  // เก็บประวัติ + แสดงผล
  if (historyCount < MAX_HISTORY) {
    historyData[historyCount] = { g_deviceName.c_str(), String(timeStr),
      lastTemp, lastPh, lastN, lastP, lastK, lastMoisture, g_lat, g_lon };
    historyCount++;
  } else {
    for (int i = 0; i < MAX_HISTORY - 1; i++) historyData[i] = historyData[i + 1];
    historyData[MAX_HISTORY - 1] = { g_deviceName.c_str(), String(timeStr),
      lastTemp, lastPh, lastN, lastP, lastK, lastMoisture, g_lat, g_lon };
  }

  buzzerDone();
  drawResultsPage();

  if (WiFi.status()==WL_CONNECTED) {
    // ✅ ยิงเข้าฐาน Postgres ผ่านแบ็กเอนด์ทันที
    bool ok = apiPostMeasurement(lastTemp, lastPh, lastMoisture, lastN, lastP, lastK);

#if ENABLE_LIVE_TO_FIREBASE
    // (ตัวเลือก) ส่งสถานะ live เป็น 100% ให้แดชบอร์ดรู้ว่าจบแล้ว
    (void) fbPatchLive(lastTemp, lastPh, lastMoisture, lastN, lastP, lastK, 100);
#endif

    if (!ok) {
      Serial.println("ERROR: apiPostMeasurement failed");
      // จะ popup แจ้งผู้ใช้ด้วย showMessage ก็ได้
      // showMessage("Cannot save to server", COLOR_WARNING);
    }
  }
}

// ================== หน้า Results (ค้างไว้จนกด Back) ==================
void drawResultsPage() {
  onResultsPage = true;
  tft.fillScreen(COLOR_DARK);

  drawRibbonHeader("✅ Measurement Result", "Averaged from 30 samples");
  tft.setTextDatum(TR_DATUM);
  tft.setTextColor(COLOR_LIGHT, COLOR_CARD_BG);
  tft.setTextFont(2);
  tft.drawString("📍 " + fmtLatLon(g_lat, g_lon), 464, 36);

  String clockChip = "⏰ " + String(timeStr);
  String wifiChip  = (wifiStatus == "Connected") ? "Wi-Fi Online" : "Wi-Fi Offline";
  drawChip(16,  58, clockChip, COLOR_PRIMARY);
  drawChip(356, 58, wifiChip, (wifiStatus == "Connected") ? COLOR_SUCCESS : COLOR_DANGER);
  String contactChip = g_soilContact ? "Probe: IN SOIL" : "Probe: AIR";
  drawChip(186, 58, contactChip, g_soilContact ? COLOR_SUCCESS : COLOR_WARNING);

  const int leftX  = 22;
  const int rightX = 250;
  const int topY   = 76;
  const int tileW  = 206;
  const int tileH  = 50;
  const int gapY   = 54;

  uint16_t colT = getTemperatureColor(lastTemp);
  uint16_t colP = getPhColor(lastPh);
  uint16_t colM = getMoistureColor(lastMoisture);

  drawMetricTile(leftX,  topY,           tileW, tileH, "Temperature", String(lastTemp, 1), "°C",    colT, COLOR_LIGHT, "T");
  drawMetricTile(rightX, topY,           tileW, tileH, "pH",          String(lastPh, 1),   "",      colP, COLOR_LIGHT, "pH");
  drawMetricTile(leftX,  topY + gapY,    tileW, tileH, "Moisture",    String(lastMoisture),"%",     colM, COLOR_LIGHT, "M");
  drawMetricTile(rightX, topY + gapY,    tileW, tileH, "Nitrogen",    String(lastN),       "mg/kg", COLOR_SUCCESS, COLOR_LIGHT, "N");
  drawMetricTile(leftX,  topY + 2*gapY,  tileW, tileH, "Phosphorus",  String(lastP),       "mg/kg", COLOR_SUCCESS, COLOR_LIGHT, "P");
  drawMetricTile(rightX, topY + 2*gapY,  tileW, tileH, "Potassium",   String(lastK),       "mg/kg", COLOR_SUCCESS, COLOR_LIGHT, "K");

  drawLegendBar();

  drawNavButton(20,  260, 120, 50, COLOR_PRIMARY, "◀ Back");
  drawNavButton(340, 260, 120, 50, COLOR_PRIMARY, "History ▶");
}
void animateWaveEffect(int x, int y, int width, uint16_t color) {
  unsigned long t = millis();
  for (int i = 0; i < width; i++) {
    int waveHeight = sin((i + t/100.0) * 0.1) * 10 + 10;
    tft.drawPixel(x + i, y, color);
    tft.drawPixel(x + i, y + waveHeight, color);
  }
}

void drawHealthIndicator(int x, int y, const char* label, float value, float min_good, float max_good) {
  uint16_t healthColor = (value >= min_good && value <= max_good) ? COLOR_SUCCESS : COLOR_WARNING;
  if (value < min_good * 0.5 || value > max_good * 1.5) healthColor = COLOR_DANGER;
  tft.fillCircle(x, y, 15, healthColor);
  tft.drawCircle(x, y, 15, TFT_WHITE);
  static unsigned long pulseTime = 0;
  if (healthColor == COLOR_DANGER && millis() - pulseTime > 500) { 
    tft.drawCircle(x, y, 18, healthColor); 
    pulseTime = millis(); 
  }
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextDatum(TL_DATUM);
  tft.drawString(label, x + 25, y - 5, 2);
}

void drawTrendArrow(int x, int y, float currentValue, float previousValue) {
  uint16_t arrowColor = COLOR_LIGHT;
  String arrow = "→";
  if (currentValue > previousValue * 1.1) { arrow = "↗"; arrowColor = COLOR_SUCCESS; }
  else if (currentValue < previousValue * 0.9) { arrow = "↘"; arrowColor = COLOR_WARNING; }
  tft.setTextColor(arrowColor, TFT_BLACK);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(arrow, x, y, 3);
}

// ===== New Fast API Functions Implementation =====

// ช่วยสร้าง URL (ไม่ใส่ :443 เมื่อใช้ HTTPS)
String makeUrl(const char* path) {
  String baseUrl = (API_USE_TLS ? "https://" : "http://") + String(API_HOST_FALLBACK);
  return baseUrl + String(path);
}

// สร้าง Heartbeat URL
String makeHeartbeatUrl(const char* deviceName) {
  String baseUrl = (API_USE_TLS ? "https://" : "http://") + String(API_HOST_FALLBACK);
  return baseUrl + "/api/devices/" + String(deviceName) + "/heartbeat";
}

// Health check แบบสั้น/ชัวร์
bool apiHealthCheck_min() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi not connected");
    return false;
  }
  
  WiFiClientSecure client;
  client.setInsecure(); // ทดสอบก่อน, ภายหลังค่อยใส่ CA จริง
  
  HTTPClient http;
  const String url = makeUrl(API_PATH_HEALTH);
  Serial.println("🩺 Health: " + url);
  
  if (!http.begin(client, url)) {
    Serial.println("❌ http.begin failed");
    return false;
  }
  
  http.setReuse(false);
  http.useHTTP10(true);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.addHeader("Connection", "close");
  http.addHeader("Accept", "application/json");
  http.setTimeout(3000);
  http.setConnectTimeout(2000);
  
  const int code = http.GET();
  Serial.println("  - HTTP " + String(code));
  
  if (code == 200) {
    Serial.println("✅ API health OK");
  } else {
    Serial.println("❌ API health BAD: " + http.errorToString(code));
  }
  
  http.end();
  return code == 200;
}

// Heartbeat: ใช้ POST + JSON ชัดเจน
bool apiPostHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure(); // ทดสอบก่อน

  HTTPClient http;
  String url = makeHeartbeatUrl(DEVICE_NAME);
  Serial.println("💓 Heartbeat to: " + url);
  
  if (!http.begin(client, url)) {
    Serial.println("❌ http.begin failed");
    return false;
  }

  http.setReuse(false);
  http.useHTTP10(true);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.addHeader("Connection", "close");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");
  http.setTimeout(3000);
  http.setConnectTimeout(2000);
  
  // ใช้ API Key แทน JWT
  http.addHeader("x-api-key", DEVICE_API_KEY);

  // payload ตัวอย่าง — ปรับให้ตรงกับ backend
  String payload = String("{") +
    "\"deviceId\":\"" + String(DEVICE_NAME) + "\"," +
    "\"ip\":\"" + WiFi.localIP().toString() + "\"," +
    "\"rssi\":" + String(WiFi.RSSI()) + "," +
    "\"fw\":\"2.0.0\"" +
  "}";

  int code = http.POST(payload);
  Serial.println("  - HTTP " + String(code));
  
  if (code > 0) {
    String resp = http.getString();
    Serial.println("  - Resp: " + resp);
    
    // ดึงชื่อ Owner จาก Heartbeat Response
    if (code == 200 && resp.length() > 0) {
      // ลองดึงชื่อ Owner จาก response
      String ownerName = extractJsonString(resp, "user_name");
      if (ownerName.length() == 0) {
        // ลองคีย์สำรอง
        ownerName = extractJsonString(resp, "userName");
        if (ownerName.length() == 0) ownerName = extractJsonString(resp, "user");
        if (ownerName.length() == 0) ownerName = extractJsonString(resp, "owner");
        if (ownerName.length() == 0) ownerName = extractJsonString(resp, "name");
      }
      
      if (ownerName.length() > 0 && ownerName != g_userName) {
        g_userName = ownerName;
        // Serial.println("✅ Owner name updated from heartbeat: " + g_userName); // ลบออกเพื่อลด spam
        needsFullRedraw = true; // อัพเดต UI
        // Serial.println("🔄 Triggering UI update for owner name change");
      }
    }
  } else {
    Serial.println("  - Error: " + http.errorToString(code));
  }
  
  http.end();
  return code >= 200 && code < 300;
}

void drawAnalyticsOverview() {
  // not used in this version
}

// ===== Missing Functions Implementation =====

// Check if point is in box
bool inBox(uint16_t x, uint16_t y, uint16_t x1, uint16_t y1, uint16_t w, uint16_t h) {
  return (x >= x1 && x <= x1 + w && y >= y1 && y <= y1 + h);
}

// Button press animation
void buttonPressAnimation(uint16_t x, uint16_t y, uint16_t w, uint16_t h, uint16_t color) {
  // Simple button press animation
  tft.fillRect(x, y, w, h, color);
  delay(100);
  tft.fillRect(x, y, w, h, COLOR_DARK);
}
