#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "config.h"

struct SurfPayload {
    int beach_pos;
    String beach_name;
    int score;
    float conditions_rating;
    String wind_condition;
    bool valid;
};

class NetworkManager {
public:
    NetworkManager();
    void begin();
    void update(); // Non-blocking check for polling interval & reconnection

    // Manual triggers
    bool pollNow(SurfPayload& outPayload);
    void scanNetworks();
    void setPollingEnabled(bool enabled) { _pollingEnabled = enabled; }
    bool isPollingEnabled() const { return _pollingEnabled; }


    // Configuration & NVS Persistence
    void setWifiCredentials(const String& ssid, const String& password);
    void setApiUrl(const String& url);
    String getSsid() const { return _ssid; }
    String getApiUrl() const { return _apiUrl; }
    bool isConnected() const { return WiFi.status() == WL_CONNECTED; }
    IPAddress getLocalIP() const { return WiFi.localIP(); }

    // Callback for new surf position & conditions rating
    typedef void (*SurfUpdateCallback)(const SurfPayload& payload);
    void setCallback(SurfUpdateCallback cb) { _onUpdate = cb; }

private:
    Preferences _prefs;
    String _ssid;
    String _password;
    String _apiUrl;
    unsigned long _lastPollTime;
    unsigned long _lastWifiCheck;
    SurfUpdateCallback _onUpdate;
    bool _pollingEnabled;

    void loadPreferences();
    void connectWifi();
    bool executeHttpRequest(SurfPayload& outPayload);
};
