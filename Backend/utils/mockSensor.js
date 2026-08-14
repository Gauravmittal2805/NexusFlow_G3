const API_URL = 'http://localhost:5005/api/telemetry';
const SENSOR_ID = 'TURBINE-001';

let currentTemp = 70;
let currentPressure = 121;
let currentRPM = 1840;
let currentHumidity = 43;

let step = 0;

const sendTelemetryData = async () => {
  step++;
  
  // Occasional anomaly: Shoot up temperature
  if (step % 5 === 0) {
    currentTemp += 6; 
  } else {
    // Normal continuous sequence
    currentTemp += 1.2;
    if (currentTemp > 85 && step % 5 !== 0) {
      currentTemp = 70; // Reset
    }
  }

  currentTemp = Number(currentTemp.toFixed(1));
  currentPressure = Number((currentPressure + (Math.random() * 2 - 1)).toFixed(0));
  currentRPM = Number((currentRPM + (Math.random() * 10 - 5)).toFixed(0));
  currentHumidity = Number((currentHumidity + (Math.random() * 2 - 1)).toFixed(0));

  const payload = {
    sensorId: SENSOR_ID,
    timestamp: new Date().toISOString(),
    temperature: currentTemp,
    pressure: currentPressure,
    humidity: currentHumidity,
    rpm: currentRPM,
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log(`[Mock Sensor] Temperature: ${currentTemp} -> Server received -> MongoDB stored -> WebSocket broadcast`);
    } else {
      console.error(`Failed to send data: ${response.status} - ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error connecting to server: ${error.message}`);
  }
};

console.log(`Starting mock sensor...`);
setInterval(sendTelemetryData, 3000);
sendTelemetryData();
