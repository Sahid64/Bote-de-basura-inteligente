SYSTEM_THREAD(ENABLED);

#define NUM_SENSORES 3
#define MUESTRAS     5
#define TIMEOUT_US   30000UL
#define UMBRAL_ALERTA 80    

const int TRIG[3] = {D2, D4, D0};
const int ECHO[3] = {D3, D5, D1};
const int LED_PIN[3] = {A0, A1, A2};

double distVacio[3] = {27.0, 27.0, 27.0};
double distLleno[3] = {3.0, 3.0, 3.0};

double distancia[3] = {-1.0, -1.0, -1.0};
int    nivel[3]     = {-1, -1, -1};
int    nivelPrevio[3] = {-1, -1, -1}; 
String datos = "{}";

int intervaloMin = 5;
int umbralPreVaciado = 60;  // Valor por defecto (>= 60%)
int umbralPostVaciado = 10; // Valor por defecto (<= 10%)

unsigned long ultima = 0;
bool primera = true;

// =========================================================
// FUNCIONES AUXILIARES DE MEDICIÓN (DEBEN IR ARRIBA)
// =========================================================

unsigned long pulso(int pin) {
  unsigned long t0 = micros();
  while (digitalRead(pin) == LOW) {
    if (micros() - t0 > TIMEOUT_US) return 0;
  }
  unsigned long ini = micros();
  while (digitalRead(pin) == HIGH) {
    if (micros() - ini > TIMEOUT_US) return 0;
  }
  return micros() - ini;
}

double medirUna(int i) {
  digitalWrite(TRIG[i], LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG[i], HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG[i], LOW);
  
  unsigned long dur = pulso(ECHO[i]);
  if (dur == 0) return -1.0;
  return (dur * 0.0343) / 2.0;
}

double medir(int i) {
  double v[MUESTRAS];
  int n = 0;
  for (int m = 0; m < MUESTRAS; m++) {
    double d = medirUna(i);
    if (d > 2.0 && d < 400.0) v[n++] = d;
    delay(30);
  }
  if (n == 0) return -1.0;
  
  for (int a = 0; a < n - 1; a++) {
    for (int b = 0; b < n - 1 - a; b++) {
      if (v[b] > v[b + 1]) { 
        double t = v[b]; 
        v[b] = v[b + 1]; 
        v[b + 1] = t; 
      }
    }
  }
  return v[n / 2];
}

int calcNivel(int i, double d) {
  if (d < 0) return -1;
  double pct = (distVacio[i] - d) / (distVacio[i] - distLleno[i]) * 100.0;
  if (pct < 0.0) pct = 0.0;
  if (pct > 100.0) pct = 100.0;
  return (int)round(pct);
}

// =========================================================
// LÓGICA PRINCIPAL DE ACTUALIZACIÓN
// =========================================================

void actualizar() {
  bool haySeccionLlena = false;
  String detalleLleno = "";
  const char* nombres[3] = {"Plástico", "Aluminio", "Orgánico"};

  for (int i = 0; i < NUM_SENSORES; i++) {
    distancia[i] = medir(i);
    nivel[i] = calcNivel(i, distancia[i]);
    
    // Alerta de llenado
    if (nivel[i] >= UMBRAL_ALERTA) {
      digitalWrite(LED_PIN[i], HIGH);
      haySeccionLlena = true;
      detalleLleno += String(nombres[i]) + " (" + String(nivel[i]) + "%); ";
    } else {
      digitalWrite(LED_PIN[i], LOW);
    }

    // Detección automática de vaciado dinámico
    if (nivelPrevio[i] >= umbralPreVaciado && nivel[i] <= umbralPostVaciado && nivelPrevio[i] != -1) {
      String msgVaciado = String(nombres[i]) + " vaciado correctamente (bajó de " + String(nivelPrevio[i]) + "% a " + String(nivel[i]) + "%).";
      Particle.publish("vaciado", msgVaciado, PRIVATE);
    }

    if (nivel[i] >= 0) {
      nivelPrevio[i] = nivel[i];
    }
    
    delay(50);
  }

  // Creación del JSON
  String s = "{\"t\":" + String(Time.now());
  for (int i = 0; i < NUM_SENSORES; i++) {
    s += ",\"c" + String(i + 1) + "\":" + String(distancia[i], 1);
    s += ",\"p" + String(i + 1) + "\":" + String(nivel[i]);
  }
  s += "}";
  datos = s;

  Particle.publish("bote/nivel", datos, PRIVATE);

  if (haySeccionLlena) {
    Particle.publish("lleno", "Vaciar contenedor: " + detalleLleno, PRIVATE);
  }
}

int setUmbralVaciado(String arg) {
  int comaIndex = arg.indexOf(',');
  if (comaIndex != -1) {
    umbralPreVaciado = arg.substring(0, comaIndex).toInt();
    umbralPostVaciado = arg.substring(comaIndex + 1).toInt();
    return 1;
  }
  return -1;
}

int medirAhora(String arg) { actualizar(); return 1; }
int setIntervalo(String arg) {
  int m = arg.toInt();
  if (m < 1) return -1;
  intervaloMin = m;
  return m;
}

void setup() {
  for (int i = 0; i < NUM_SENSORES; i++) {
    pinMode(TRIG[i], OUTPUT);
    digitalWrite(TRIG[i], LOW);
    pinMode(ECHO[i], INPUT);
    pinMode(LED_PIN[i], OUTPUT);
    digitalWrite(LED_PIN[i], LOW);
  }

  Particle.variable("datos", datos);
  Particle.variable("minutos", intervaloMin);
  Particle.function("medir", medirAhora);
  Particle.function("intervalo", setIntervalo);
  Particle.function("configVaciado", setUmbralVaciado);
}

void loop() {
  if (primera || millis() - ultima >= (unsigned long)intervaloMin * 60000UL) {
    primera = false;
    ultima = millis();
    actualizar();
  }
}