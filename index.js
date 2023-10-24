
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
app.use(cors());

const ALPHA_VANTAGE_API_KEY = 'XOS0F8F51TL70A31';

app.get('/search/:keyword', async (req, res) => {
    const { keyword } = req.params;
    console.log(keyword)
    try {
        const apiUrl = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${keyword}&apikey=${ALPHA_VANTAGE_API_KEY}`;

        const response = await fetch(apiUrl);
        const data = await response.json();
        res.json(data.bestMatches);
    } catch (error) {
        console.error('Error searching keyword:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }

});

app.get('/api/overview/:symbol', async (req, res) => {
    const { symbol } = req.params;
    try {
        const apiUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;

        const response = await fetch(apiUrl);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching overview', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }

});

app.get('/api/globalstatus', async (req, res) => {
    try {
        const apiUrl = `https://www.alphavantage.co/query?function=MARKET_STATUS&apikey=${ALPHA_VANTAGE_API_KEY}`;

        const response = await fetch(apiUrl);
        const data = await response.json();
        res.json(data["markets"]);
    } catch (error) {
        console.error('Error fetching Global market Status', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }

});

/* **********Historical Data************** */

app.get('/api/historical-data/:symbol/:timeframe', async (req, res) => {
    const { symbol, timeframe } = req.params;

    try {
        const data = await getHistoricalData(symbol, timeframe);
        // console.log(data)
        res.json(data);
    } catch (error) {
        console.error('Error fetching historical data:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// Function to get historical data from Alpha Vantage API
async function getHistoricalData(symbol, timeframe) {
    let func, interval;

    if (['Daily', 'Weekly', 'Monthly'].includes(timeframe)) {
        func = `TIME_SERIES_${timeframe.toUpperCase()}`;
    } else if (['1min', '5min', '15min', '30min', '60min'].includes(timeframe)) {
        func = 'TIME_SERIES_INTRADAY';
        interval = timeframe;
    } else {
        throw new Error('Invalid timeframe selected');
    }

    const apiUrl = `https://www.alphavantage.co/query?function=${func}&symbol=${symbol}&interval=${interval || ''}&apikey=${ALPHA_VANTAGE_API_KEY}`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (['Weekly', 'Monthly'].includes(timeframe)) {
        return data[`${timeframe} Time Series`];
    }
    else { return data[`Time Series (${timeframe})`]; }
}

/* **********Live Data************** */

const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
    let liveData, lastData, tf, interval, clampMax;
    console.log("client connected")

    ws.on('message', (message) => {
        const parsedMessage = JSON.parse(message);
        tf = parsedMessage.timeframe;
        lastData = (parsedMessage.lastValue ?? {})
        clampMax = parseFloat(lastData.open) + 2;
        let currentTime;

        // Example: Send a message to the client every second
        if (tf === '1min') {
            currentTime = Math.floor(new Date().getTime());
            interval = setInterval(() => {
                console.log("requesting live")
                liveData = getLiveData(tf, lastData, clampMax, currentTime);
                console.log('livedata = ' + liveData)
                lastData = liveData
                currentTime += 1 * 60 * 1000;
                console.log("updating live")
                ws.send(JSON.stringify({ liveData }));
            }, 10000);

        }
        else if (tf === '5min') {
            currentTime = Math.floor(new Date().getTime()) / (5 * 60 * 1000) * (5 * 60 * 1000);

            interval = setInterval(() => {
                liveData = getLiveData(tf, lastData, clampMax, currentTime);
                lastData = liveData
                currentTime += 5 * 60 * 1000;
                ws.send(JSON.stringify({ liveData: liveData }));
            }, 10000);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        clearInterval(interval);
    });
});


// Function to get live data randomly
function getLiveData(timeframe, lastEntry, clampMax, currentTime) {

    let randomChange;
    if (['Daily', 'Weekly', 'Monthly'].includes(timeframe)) {
        randomChange = () => { return ((Math.random() * 6) - 3) }; // Random value between -3 and +3

    }
    else if (['1min', '5min', '15min', '30min', '60min'].includes(timeframe)) {
        randomChange = () => { return ((Math.random() * 2) - 1) }; // Random value between -1 and +1
    }

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const randomOpen = clamp(parseFloat(lastEntry.open) + randomChange(), clampMax - 4, clampMax).toFixed(4);
    const randomHigh = clamp(parseFloat(lastEntry.high) + randomChange(), clampMax - 4, clampMax).toFixed(4);
    const randomLow = clamp(parseFloat(lastEntry.low) + randomChange(), clampMax - 4, clampMax).toFixed(4);
    const randomClose = clamp(parseFloat(lastEntry.close) + randomChange(), clampMax - 4, clampMax).toFixed(4);

    lastEntry = {
        open: parseFloat(randomOpen),
        high: parseFloat(randomHigh),
        low: parseFloat(randomLow),
        close: parseFloat(randomClose),
        time: currentTime / 1000
    };

    // console.log(lastEntry)
    return lastEntry;
};


server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
