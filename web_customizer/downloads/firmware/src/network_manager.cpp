#include "network_manager.h"

NetworkManager::NetworkManager()
    : _lastPollTime(0),
      _lastWifiCheck(0),
      _onUpdate(nullptr),
      _pollingEnabled(true)
{}

void NetworkManager::begin() {
    loadPreferences();
    connectWifi();
}

void NetworkManager::loadPreferences() {
    _prefs.begin("surfclock", false);
    _ssid = _prefs.getString("wifi_ssid", DEFAULT_WIFI_SSID);
    _password = _prefs.getString("wifi_pass", DEFAULT_WIFI_PASS);
    _apiUrl = _prefs.getString("api_url", DEFAULT_API_URL);
    _prefs.end();

    Serial.printf("[NET] Config Loaded: SSID='%s' | API='%s'\n", _ssid.c_str(), _apiUrl.c_str());
}

void NetworkManager::setWifiCredentials(const String& ssid, const String& password) {
    _ssid = ssid;
    _password = password;

    _prefs.begin("surfclock", false);
    _prefs.putString("wifi_ssid", _ssid);
    _prefs.putString("wifi_pass", _password);
    _prefs.end();

    Serial.printf("[NET] Saved new Wi-Fi credentials for '%s'. Connecting...\n", _ssid.c_str());
    connectWifi();
}

void NetworkManager::setApiUrl(const String& url) {
    _apiUrl = url;

    _prefs.begin("surfclock", false);
    _prefs.putString("api_url", _apiUrl);
    _prefs.end();

    Serial.printf("[NET] Saved new API URL: '%s'\n", _apiUrl.c_str());
}

void NetworkManager::connectWifi() {
    if (_ssid.length() == 0) {
        Serial.println("[NET] Wi-Fi SSID not configured.");
        return;
    }

    Serial.printf("[NET] Connecting to Wi-Fi '%s'...\n", _ssid.c_str());
    WiFi.disconnect(true);
    delay(100);
    WiFi.mode(WIFI_STA);
    if (_password.length() == 0) {
        WiFi.begin(_ssid.c_str());
    } else {
        WiFi.begin(_ssid.c_str(), _password.c_str());
    }
}

void NetworkManager::scanNetworks() {
    Serial.println("[NET] Scanning for nearby 2.4GHz Wi-Fi networks...");
    int n = WiFi.scanNetworks();
    Serial.printf("[NET] Found %d networks:\n", n);
    for (int i = 0; i < n; ++i) {
        Serial.printf("  [%2d] %-32s RSSI: %3d dBm  (Chan: %2d)\n",
                      i + 1, WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i));
    }
}

bool NetworkManager::executeHttpRequest(SurfPayload& outPayload) {
    outPayload.valid = false;

    if (!isConnected()) {
        Serial.println("[NET] Cannot poll: Wi-Fi not connected.");
        return false;
    }

    HTTPClient http;
    WiFiClientSecure secureClient;
    WiFiClient plainClient;

    if (_apiUrl.startsWith("https://")) {
        secureClient.setInsecure();
        http.begin(secureClient, _apiUrl);
    } else {
        http.begin(plainClient, _apiUrl);
    }

    http.setTimeout(10000);

    Serial.printf("[NET] HTTP GET %s ...\n", _apiUrl.c_str());
    int httpCode = http.GET();

    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, payload);

        if (!error) {
            outPayload.beach_pos = doc["beach_pos"] | 0;
            outPayload.beach_name = doc["beach_name"] | "Unknown";
            outPayload.score = doc["score"] | 0;
            outPayload.conditions_rating = doc["conditions_rating"] | ((float)outPayload.score / 10.0f);
            outPayload.wind_condition = doc["wind_condition"] | "N/A";
            
            if (outPayload.beach_pos >= 1 && outPayload.beach_pos <= 12) {
                outPayload.valid = true;
                Serial.printf("[NET] API Response: Break Pos %d (%s) | Conditions: %.1f/10 (%s)\n",
                              outPayload.beach_pos, outPayload.beach_name.c_str(),
                              outPayload.conditions_rating, outPayload.wind_condition.c_str());
            } else {
                Serial.printf("[NET] Invalid beach_pos in payload: %d\n", outPayload.beach_pos);
            }
        } else {
            Serial.printf("[NET] JSON deserialization failed: %s\n", error.c_str());
        }
    } else {
        Serial.printf("[NET] HTTP GET failed. Code: %d (%s)\n", httpCode, http.errorToString(httpCode).c_str());
    }

    http.end();
    return outPayload.valid;
}

bool NetworkManager::pollNow(SurfPayload& outPayload) {
    bool ok = executeHttpRequest(outPayload);
    if (ok && _onUpdate) {
        _onUpdate(outPayload);
    }
    _lastPollTime = millis();
    return ok;
}

void NetworkManager::update() {
    unsigned long now = millis();

    // 1. Periodic Wi-Fi connection check (every 10s)
    if (now - _lastWifiCheck > 10000) {
        _lastWifiCheck = now;
        if (_ssid.length() > 0 && WiFi.status() != WL_CONNECTED) {
            Serial.println("[NET] Wi-Fi disconnected, reconnecting...");
            WiFi.reconnect();
        }
    }

    // 2. Periodic API Poll (every POLL_INTERVAL_MS)
    if (_pollingEnabled && isConnected() && (now - _lastPollTime >= POLL_INTERVAL_MS || _lastPollTime == 0)) {
        SurfPayload payload;
        pollNow(payload);
    }
}
