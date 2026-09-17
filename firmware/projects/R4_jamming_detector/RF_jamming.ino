#include <math.h>

// ====================================================================
// 1. ML SCALER VALUES 
// ====================================================================
const int NUM_FEATURES = 3; 
float scaler_mean[NUM_FEATURES]  = {0.47172642, 0.47065861, 0.06367533}; 
float scaler_scale[NUM_FEATURES] = {0.08477513, 0.04557619, 0.03718641}; 

// ====================================================================
// 2. NEURAL NETWORK WEIGHTS
// ====================================================================
const float W0[48] = {-0.78068393, 0.3015, -0.5118687, 0.3970989, 0.40074816, -0.10806009, 0.08059798, -0.2625656, -0.6582683, 0.6304615, 0.89526504, -0.949867, -0.70308113, -1.0096623, 0.025498498, -1.1818932, -0.12299742, -0.50214034, 0.34932318, 0.28193057, -0.5184968, -0.57319343, -0.20080662, -0.35221937, -0.614209, 0.5547594, -0.09238248, -0.005081126, -0.065535955, 0.23351021, 0.5619051, 0.13636635, -0.059527468, -0.57142484, 0.5603635, -0.14565353, -0.78314376, -0.4557219, -0.39679104, -0.14242734, -0.2962344, 0.2959464, -0.3393933, 0.0851435, -0.4040207, -0.12505877, 0.24570906, -0.10156781};
const float b0[16] = {0.43364683, 0.39508545, 0.266308, 0.24296933, 0.073560186, -0.17561546, -0.1566544, 0.20497312, 0.45843637, -0.0051193056, 0.32328227, 0.46488425, 0.018927082, 0.3985061, 0.20905378, 0.505134};

const float W1[128] = {1.0941715, 0.6377371, -0.054182768, -0.6177053, 0.7351535, 0.6541357, 0.61647785, 0.721197, -0.45491716, -0.70974636, 0.4381528, 0.7516588, -0.21824078, -0.15295331, 0.2583456, 0.18283376, 0.38331065, 0.33273992, -0.0052615404, 0.36977407, 0.3275514, 0.1556311, 0.06950275, 0.53795695, -0.53989065, -0.49072757, -0.29886281, 0.3436776, -0.6964974, 0.018042454, -0.20827806, -0.5174036, 0.15998544, 0.09614375, -0.06365442, 0.5974576, -0.05175672, 0.22647482, -0.45928738, -0.04185754, -0.030948563, -0.10506163, -0.49728835, 0.3799099, -0.07449309, -0.34291023, -0.35732818, -0.19691084, 0.1869568, 0.2685751, -0.27240896, 0.2572161, -0.051973708, -0.34442842, 0.2497945, -0.45465246, 0.2753895, 0.1415996, 0.25738502, 0.12890121, 0.020821491, 0.21751034, 0.66681397, -0.17456688, 0.1995697, 0.4490654, -0.27642953, -0.13023925, 0.3615253, 0.5355407, 0.2903177, 0.34522897, -0.44277483, 0.33738402, -0.4478042, -0.20104843, -0.5523241, -0.6141537, -0.27807844, 0.15612921, -0.29738393, 0.4657532, -0.4070338, 0.28472254, -0.12856816, -0.7131279, -0.49990866, -0.40076277, 1.1756971, -0.1967987, 0.27555203, 0.094638534, 0.95718026, 0.8961271, 0.8337067, 0.57887983, 0.65159017, -0.2031203, 0.013209224, -0.87154317, 0.12451358, 0.035509266, 0.15257601, 0.30984533, 0.7774901, 0.34634146, -0.23392415, -0.59477985, 0.57116586, 0.96752816, 0.66742676, 0.9888289, -0.10877919, -0.1080645, -0.2922374, 0.50252414, 0.1755307, 0.22638386, 0.023342237, -0.47029364, 1.3521016, 0.9011613, -0.46591258, -0.6198778, 1.1973506, 0.7096313, 0.7369698, 0.5456617};
const float b1[8] = {0.09362742, -0.20913005, 0.0, 0.25254053, 0.0948872, 0.101011924, 0.11524938, 0.06320896};

const float W2[8] = {-2.397482, -0.41228238, 0.055913687, 0.97708756, -1.0082512, -1.6758517, -1.4764094, -1.2808156};
const float b2[1] = {0.029573828};

// Mathematical Activation Functions
float relu(float x) { return (x > 0) ? x : 0.0; }
float sigmoid(float x) { return 1.0 / (1.0 + exp(-x)); }

// Pure C++ Neural Network Inference
float predictJamming(float* input) {
  float hidden1[16];
  for (int i = 0; i < 16; i++) {
    hidden1[i] = b0[i];
    for (int j = 0; j < 3; j++) hidden1[i] += input[j] * W0[j * 16 + i];
    hidden1[i] = relu(hidden1[i]); 
  }
  float hidden2[8];
  for (int i = 0; i < 8; i++) {
    hidden2[i] = b1[i];
    for (int j = 0; j < 16; j++) hidden2[i] += hidden1[j] * W1[j * 8 + i];
    hidden2[i] = relu(hidden2[i]); 
  }
  float output = b2[0]; 
  for (int j = 0; j < 8; j++) output += hidden2[j] * W2[j * 1 + 0];
  
  return sigmoid(output); 
}

// Original standalone sampling/state-machine implementation retained below
// for reference. Agentwin now owns setup/loop in R4_jamming_detector.ino and
// calls this file's unchanged predictJamming() model from RfJammingDriver.
#if 0
// ====================================================================
// 3. HARDWARE & STATE MACHINE SETTINGS
// ====================================================================
const int SENSOR_PIN = A0;
const int WINDOW_SIZE = 10;
float voltage_buffer[WINDOW_SIZE];
int buffer_index = 0;
bool buffer_full = false; 

// *Note: Keeping VREF at 5.0 for the math so it matches your Python training scaler exactly, 
// even though the sensor is physically powered by 3.3V.
const float VREF = 3.3; 

// Prediction Thresholds & Debouncing
const float THRESH_ATTACK = 0.50; // Trigger if AI predicts >= 50% probability
const float THRESH_CLEAR  = 0.49; // Clear if AI predicts < 49% probability
const unsigned long DEBOUNCE_MS = 200;
const unsigned long PRINT_INTERVAL_MS = 100; 

unsigned long lastPrintMs = 0;
bool attackState = false;
unsigned long lastChangeMs = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial); 
  Serial.println("Starting LIVE NATIVE C++ RF Jamming Detector...");
  Serial.println("Time(ms), Voltage(V), Mean, Std, JammingProb(%), State");
  
  pinMode(SENSOR_PIN, INPUT);
}

void loop() {
  unsigned long now = millis();

  // Non-blocking timer: Run AI every PRINT_INTERVAL_MS
  if (now - lastPrintMs >= PRINT_INTERVAL_MS) {
    lastPrintMs = now;

    // 1. Read Voltage
    int raw_adc = analogRead(SENSOR_PIN);
    float voltage = (raw_adc * VREF) / 1023.0; 

    // 2. Add to Circular Buffer
    voltage_buffer[buffer_index] = voltage;
    buffer_index++; 
    if (buffer_index >= WINDOW_SIZE) {
      buffer_index = 0;
      buffer_full = true; 
    }

    // 3. Wait for buffer to fill, then process AI
    if (buffer_full) {
      // Calculate Rolling Mean
      float sum = 0.0;
      for (int i = 0; i < WINDOW_SIZE; i++) sum += voltage_buffer[i];
      float current_mean = sum / WINDOW_SIZE;

      // Calculate Rolling Std Dev
      float variance_sum = 0.0;
      for (int i = 0; i < WINDOW_SIZE; i++) {
        variance_sum += pow(voltage_buffer[i] - current_mean, 2);
      }
      float current_std = sqrt(variance_sum / (WINDOW_SIZE - 1)); 

      // Format & Scale Input
      float live_data[NUM_FEATURES] = {voltage, current_mean, current_std};
      float scaled_input[NUM_FEATURES];
      for (int i = 0; i < NUM_FEATURES; i++) {
        scaled_input[i] = (live_data[i] - scaler_mean[i]) / scaler_scale[i];
      }

      
      float prediction = predictJamming(scaled_input);

      // ====================================================================
      // 4. HYSTERESIS & DEBOUNCE LOGIC (Applied to AI Prediction)
      // ====================================================================
      if (!attackState) {
        if (prediction >= THRESH_ATTACK && (now - lastChangeMs) > DEBOUNCE_MS) {
          attackState = true;
          lastChangeMs = now;
          Serial.println("\n>>> ALERT: RF JAMMING DETECTED <<<");
        }
      } else {
        if (prediction < THRESH_CLEAR && (now - lastChangeMs) > DEBOUNCE_MS) {
          attackState = false;
          lastChangeMs = now;
          Serial.println("\n<<< CLEAR: BACK TO NORMAL >>>");
        }
      }

      // Print telemetry in CSV format for easy plotting/graphing
      Serial.print(now); Serial.print(", ");
      Serial.print(voltage, 3); Serial.print(", ");
      Serial.print(current_mean, 3); Serial.print(", ");
      Serial.print(current_std, 3); Serial.print(", ");
      Serial.print(prediction * 100, 3); Serial.print("%, ");
      Serial.println(attackState ? "ATTACK" : "NORMAL");

    } else {
      // Warming up print
      Serial.print("Warming up... ");
      Serial.print(buffer_index);
      Serial.println("/10");
    }
  }
}
#endif
