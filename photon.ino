SYSTEM_THREAD(ENABLED);

#define NUM_SENSORES 3          // cambia a 3 cuando conectes los demás
#define MUESTRAS     5
#define TIMEOUT_US   30000UL

const int TRIG[3] = {D0, D1, D2};
const int ECHO[3] = {D3, D4, D5};

// Calibración por compartimento (cm medidos desde el sensor)
double distVacio[3] = {50.0, 60.0, 70.0};   // bote vacío
double distLleno[3] = {5.0, 5.0, 5.0};      // bote lleno

double distancia[3] = {-1, -1, -1};
int    nivel[3]     = {-1, -1, -1};          // porcentaje, -1 = error
String datos = "{}";

int intervaloMin = 5;                        // cada cuántos minutos mide solo
unsigned long ultima = 0;
bool primera = true;

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
  if (dur == 0) return -1;
  return dur * 0.0343 / 2.0;
}

// Mediana de varias muestras válidas
double medir(int i) {
  double v[MUESTRAS];
  int n = 0;
  for (int m = 0; m < MUESTRAS; m++) {
    double d = medirUna(i);
    if (d > 2 && d < 400) v[n++] = d;
    delay(30);
  }
  if (n == 0) return -1;
  for (int a = 0; a < n - 1; a++)
    for (int b = 0; b < n - 1 - a; b++)
      if (v[b] > v[b + 1]) { double t = v[b]; v[b] = v[b + 1]; v[b + 1] = t; }
  return v[n / 2];
}

int calcNivel(int i, double d) {
  if (d < 0) return -1;
  double pct = (distVacio[i] - d) / (distVacio[i] - distLleno[i]) * 100.0;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return (int)round(pct);
}

void actualizar() {
  for (int i = 0; i < NUM_SENSORES; i++) {
    distancia[i] = medir(i);
    nivel[i] = calcNivel(i, distancia[i]);
    delay(50);                               // evita interferencia entre sensores
  }
  String s = "{\"t\":" + String(Time.now());
  for (int i = 0; i < NUM_SENSORES; i++) {
    s += ",\"c" + String(i + 1) + "\":" + String(distancia[i], 1);
    s += ",\"p" + String(i + 1) + "\":" + String(nivel[i]);
  }
  s += "}";
  datos = s;
  Particle.publish("bote/nivel", datos, PRIVATE);
}

// Medición manual desde el dashboard
int medirAhora(String arg) {
  actualizar();
  return 1;
}

// Cambia cada cuántos minutos mide solo
int setIntervalo(String arg) {
  int m = arg.toInt();
  if (m < 1) return -1;
  intervaloMin = m;
  return m;
}

void setup() {
  for (int i = 0; i < 3; i++) {
    pinMode(TRIG[i], OUTPUT);
    digitalWrite(TRIG[i], LOW);
    pinMode(ECHO[i], INPUT);
  }
  Particle.variable("datos", datos);
  Particle.variable("minutos", intervaloMin);
  Particle.function("medir", medirAhora);
  Particle.function("intervalo", setIntervalo);
}

void loop() {
  if (primera || millis() - ultima >= (unsigned long)intervaloMin * 60000UL) {
    primera = false;
    ultima = millis();
    actualizar();
  }
}