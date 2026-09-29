#include "cli_handler.h"

CliHandler::CliHandler(StepperController& stepper, ConditionsGauge& gauge, HallSensor& hall, NetworkManager& net)
    : _stepper(stepper), _gauge(gauge), _hall(hall), _net(net)
{}

void CliHandler::begin() {
    _inputBuffer.reserve(128);
}

void CliHandler::printHelp() {
    Serial.println("\n=== 🏄 SurfClock Dual Actuator CLI Commands ===");
    Serial.println("  [Motor 1: Break Pointer (5 Northern Beaches)]");
    Serial.println("    pos <1-5>         : Move to beach (1:LongReef, 2:DeeWhy, 3:CurlCurl, 4:Freshie, 5:Queenscliff)");
    Serial.println("    angle <0-360>     : Move directly to exact degree (0=Top, 90=3oclock, 180=6oclock)");
    Serial.println("    seek cw / ccw     : Crawl continuously seeking Break datum (GPIO 10)");
    Serial.println("    step <N>          : Step Motor 1 manually (+N CW, -N CCW)");
    Serial.println("    zero / zero1      : Lock current position as Long Reef (12 o'clock / Step 0)");
    Serial.println("    hall              : Read Break Hall sensor state (GPIO 10)");
    Serial.println("    demo              : Toggle continuous sweep demo");
    Serial.println("");
    Serial.println("  [Motor 2: Conditions Gauge (1-10)]");
    Serial.println("    gauge <1.0-10.0>  : Move conditions subdial needle (1.0 to 10.0)");
    Serial.println("    seek_gauge cw/ccw : Crawl seeking Conditions datum (GPIO 15)");
    Serial.println("    step2 <N>         : Step Motor 2 manually (+N CW, -N CCW)");
    Serial.println("    zero2             : Lock current position as Rating 1.0 datum (Step 0)");
    Serial.println("    hall2             : Read Conditions Hall sensor state (GPIO 15)");
    Serial.println("");
    Serial.println("  [System & Network]");
    Serial.println("    status            : Print complete hardware and network status");
    Serial.println("    poll              : Force immediate HTTP GET poll");
    Serial.println("    wifi <ssid> [pwd] : Configure & save Wi-Fi credentials");
    Serial.println("    api <url>         : Configure & save scoring API endpoint");
    Serial.println("    free              : Power down all motor coils immediately");
    Serial.println("    pause             : Pause background network polling (for calibration)");
    Serial.println("    resume            : Resume background network polling");
    Serial.println("    save              : Persist current step positions to NVS flash");
    Serial.println("    help              : Show this help menu");
    Serial.println("==============================================\n");
}

void CliHandler::printStatus() {
    Serial.println("\n--- SurfClock Dual Hardware Status ---");
    Serial.printf("  [Motor 1: Break Pointer]\n");
    Serial.printf("    Beach Pos        : %d (Step: %ld / Target: %ld)\n",
                  _stepper.getCurrentBeachPos(), _stepper.getCurrentSteps(), _stepper.getTargetSteps());
    Serial.printf("    Homed / Calibrated: %s\n", _stepper.isHomed() ? "YES" : "NO");
    Serial.printf("    Break Sensor (G10): %s (Raw: %d)\n",
                  _hall.isTriggered() ? "MAGNET DETECTED (LOW)" : "IDLE (HIGH)", _hall.readRaw());
    Serial.println("");
    Serial.printf("  [Motor 2: Conditions Gauge]\n");
    Serial.printf("    Conditions Rating: %.1f / 10 (Step: %ld / Target: %ld)\n",
                  _gauge.getCurrentRating(), _gauge.getCurrentSteps(), _gauge.getTargetSteps());
    Serial.printf("    Homed / Calibrated: %s\n", _gauge.isHomed() ? "YES" : "NO");
    Serial.printf("    Gauge Sensor (G15): %s (Raw: %d)\n",
                  _gauge.isHallTriggered() ? "MAGNET DETECTED (LOW)" : "IDLE (HIGH)", _gauge.readHallRaw());
    Serial.println("");
    Serial.printf("  [Network]\n");
    Serial.printf("    Wi-Fi Status     : %s\n",
                  _net.isConnected() ? ("CONNECTED (" + _net.getLocalIP().toString() + ")").c_str() : "DISCONNECTED");
    Serial.printf("    API Endpoint     : %s\n", _net.getApiUrl().c_str());
    Serial.printf("    Free Heap        : %u bytes\n", ESP.getFreeHeap());
    Serial.println("-------------------------------------");
}

void CliHandler::processCommand(const String& line) {
    String trimmed = line;
    trimmed.trim();
    if (trimmed.length() == 0) return;

    int firstSpace = trimmed.indexOf(' ');
    String cmd = (firstSpace == -1) ? trimmed : trimmed.substring(0, firstSpace);
    String arg = (firstSpace == -1) ? "" : trimmed.substring(firstSpace + 1);
    arg.trim();
    cmd.toLowerCase();
    arg.toLowerCase();

    if (cmd == "help" || cmd == "?") {
        printHelp();
    } else if (cmd == "status") {
        printStatus();
    } else if (cmd == "pos") {
        if (arg == "longreef" || arg == "lr") _stepper.setBeachPosition(1);
        else if (arg == "deewhy" || arg == "dy") _stepper.setBeachPosition(2);
        else if (arg == "curlcurl" || arg == "cc") _stepper.setBeachPosition(3);
        else if (arg == "freshie" || arg == "fw") _stepper.setBeachPosition(4);
        else if (arg == "queenscliff" || arg == "qc") _stepper.setBeachPosition(5);
        else {
            int pos = arg.toInt();
            _stepper.setBeachPosition(pos);
        }
    } else if (cmd == "angle") {
        float deg = arg.toFloat();
        _stepper.moveToAngle(deg);
    } else if (cmd == "gauge") {
        float r = arg.toFloat();
        _gauge.setRating(r);
    } else if (cmd == "seek" || cmd == "home") {
        bool cw = (arg != "ccw" && arg != "left" && arg != "-");
        _stepper.startSeek(cw);
    } else if (cmd == "seek_gauge" || cmd == "seek2") {
        bool cw = (arg == "cw" || arg == "right" || arg == "+");
        _gauge.startSeek(cw);
    } else if (cmd == "step") {
        long steps = arg.toInt();
        _stepper.moveRelative(steps);
    } else if (cmd == "zero" || cmd == "zero1" || cmd == "set_break_1") {
        _stepper.zeroDatum();
    } else if (cmd == "set_beach" || cmd == "cal_beach") {
        int pos = arg.toInt();
        _stepper.calibrateCurrentAsBeach(pos);
    } else if (cmd == "step2") {
        long steps = arg.toInt();
        _gauge.moveRelative(steps);
    } else if (cmd == "zero2" || cmd == "set_gauge_1") {
        _gauge.zeroDatum();
    } else if (cmd == "hall") {
        Serial.printf("[HALL 1] GPIO 10: %d (%s)\n",
                      _hall.readRaw(), _hall.isTriggered() ? "MAGNET DETECTED" : "NO MAGNET");
    } else if (cmd == "hall2") {
        Serial.printf("[HALL 2] GPIO 15: %d (%s)\n",
                      _gauge.readHallRaw(), _gauge.isHallTriggered() ? "MAGNET DETECTED" : "NO MAGNET");
    } else if (cmd == "demo") {
        _stepper.toggleSweepDemo();
    } else if (cmd == "poll") {
        SurfPayload payload;
        _net.pollNow(payload);
    } else if (cmd == "free") {
        _stepper.freeCoils();
        _gauge.freeCoils();
    } else if (cmd == "test_coils" || cmd == "test") {
        _stepper.testCoilSequence();
    } else if (cmd == "test_coils2" || cmd == "test2") {
        _gauge.testCoilSequence();
    } else if (cmd == "pause") {
        _net.setPollingEnabled(false);
        Serial.println("[CLI] ⏸ Network polling PAUSED for manual calibration.");
    } else if (cmd == "resume") {
        _net.setPollingEnabled(true);
        Serial.println("[CLI] ▶ Network polling RESUMED.");
    } else if (cmd == "save") {
        _stepper.savePositionToNvs();
        _gauge.savePositionToNvs();
        Serial.println("[CLI] 💾 Hand positions persisted to NVS flash.");
    } else if (cmd == "wifi") {
        int sp = arg.indexOf(' ');
        if (sp != -1) {
            String ssid = arg.substring(0, sp);
            String pwd = arg.substring(sp + 1);
            ssid.trim(); pwd.trim();
            _net.setWifiCredentials(ssid, pwd);
        } else if (arg.length() > 0) {
            _net.setWifiCredentials(arg, "");
        }
    } else if (cmd == "api") {
        if (arg.length() > 0) _net.setApiUrl(arg);
    } else {
        Serial.printf("[CLI] Unknown command: '%s'. Type 'help' for command list.\n", cmd.c_str());
    }
}

void CliHandler::update() {
    while (Serial.available() > 0) {
        char c = (char)Serial.read();
        if (c == '\r' || c == '\n') {
            if (_inputBuffer.length() > 0) {
                processCommand(_inputBuffer);
                _inputBuffer = "";
            }
        } else {
            _inputBuffer += c;
        }
    }
}
