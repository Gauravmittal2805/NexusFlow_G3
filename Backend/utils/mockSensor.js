const API_URL = 'http://localhost:5005/api/telemetry';
const SENSOR_ID = 'TURBINE-001';

// Initial baseline values
let currentTemp = 72;
let currentPressure = 118;
let currentRPM = 1790;
let currentHumidity = 40;

// Function to generate a random walk value
const getNextValue = (current, minDelta, maxDelta) => {
  const delta = (Math.random() * (maxDelta - minDelta) + minDelta);
  return Number((current + delta).toFixed(2));
};

const sendTelemetryData = async () => {
  // Update values with slight random fluctuations
  currentTemp = getNextValue(currentTemp, -2, 2);
  currentPressure = getNextValue(currentPressure, -3, 3);
  currentRPM = getNextValue(currentRPM, -20, 20);
  currentHumidity = getNextValue(currentHumidity, -1, 1);

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
      console.log(`[${payload.timestamp}] Sent data for ${SENSOR_ID}: Temp=${currentTemp}, Pressure=${currentPressure}, RPM=${currentRPM}`);
    } else {
      console.error(`Failed to send data: ${response.status} - ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error connecting to server: ${error.message}`);
  }
};

// Start simulating data every 3 seconds
console.log(`Starting mock sensor for ${SENSOR_ID}...`);
setInterval(sendTelemetryData, 3000);

// Send the first reading immediately
sendTelemetryData();
