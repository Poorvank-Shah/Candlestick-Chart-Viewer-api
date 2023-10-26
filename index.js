
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

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

app.get('/api/search/:keyword', async (req, res) => {
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
        res.json(data);

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
let connectedClient=null;
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {

    if (connectedClient) {
        ws.close();
        return;
    }
    connectedClient = ws;
    let liveData, lastData, tf, interval, clampMax;
    console.log("client connected")


    const setupInterval = (tf, minutes, lastData, clampMax) => {
        const currentDate = new Date();
        const intervalDuration = minutes * 60000;
        let currentTime = new Date(currentDate.getTime() + ((minutes - currentDate.getMinutes() % minutes) * 60000)).getTime();

        return setInterval(() => {
            liveData = getLiveData(tf, lastData, clampMax, currentTime);
            lastData = liveData;
            currentTime += intervalDuration;
            ws.send(JSON.stringify({ liveData }));
        }, 10000);
    };

    // Example usage
    ws.on('message', (message) => {
        const parsedMessage = JSON.parse(message);
        tf = parsedMessage.timeframe;
        lastData = (parsedMessage.lastValue ?? {})
        clampMax = [parseFloat(lastData[0].open) + 2, parseFloat(lastData[1].value) + 10000000];

        // Clear existing interval if any
        if (interval) {
            clearInterval(interval);
        }

        // Set up interval based on timeframe
        if (tf === '1min') {
            interval = setupInterval(tf, 1, lastData, clampMax);
        } else if (tf === '5min') {
            interval = setupInterval(tf, 5, lastData, clampMax);
        } else if (tf === '15min') {
            interval = setupInterval(tf, 15, lastData, clampMax);
        } else if (tf === '30min') {
            interval = setupInterval(tf, 30, lastData, clampMax);
        } else if (tf === '60min') {
            interval = setupInterval(tf, 60, lastData, clampMax);
        }
        // else if (tf === 'Daily') {
        //     interval = setupInterval(tf, 24 * 60, lastData, clampMax);
        // }
        else if (tf === 'Weekly') {
            interval = setupInterval(tf, 7 * 24 * 60, lastData, clampMax);
        } else if (tf === 'Monthly') {
            interval = setupInterval(tf, 30 * 24 * 60, lastData, clampMax);
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected');
        clearInterval(interval);
    });
});


// Function to get live data randomly
function getLiveData(timeframe, lastEntry, clampMax, currentTime) {

    let randomChange, randomVol;
    if (['Daily', 'Weekly', 'Monthly'].includes(timeframe)) {
        randomChange = () => { return ((Math.random() * 6) - 3) }; // Random value between -3 and +3

    }
    else if (['1min', '5min', '15min', '30min', '60min'].includes(timeframe)) {
        randomChange = () => { return ((Math.random() * 2) - 1) }; // Random value between -1 and +1
    }
    randomVol = () => {
        return Math.round(Math.random() * 2000000) - 1000000;
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const randomOpen = clamp(parseFloat(lastEntry[0].open) + randomChange(), clampMax[0] - 4, clampMax[0]).toFixed(2);
    const randomHigh = clamp(parseFloat(lastEntry[0].high) + randomChange(), clampMax[0] - 4, clampMax[0]).toFixed(2);
    const randomLow = clamp(parseFloat(lastEntry[0].low) + randomChange(), clampMax[0] - 4, clampMax[0]).toFixed(2);
    const randomClose = clamp(parseFloat(lastEntry[0].close) + randomChange(), clampMax[0] - 4, clampMax[0]).toFixed(2);
    const randomVolume = clamp(parseFloat(lastEntry[1].value) + randomVol(), clampMax[1] - 20000000, clampMax[1]);
    const ohlcEntry = {
        open: parseFloat(randomOpen),
        high: parseFloat(randomHigh),
        low: parseFloat(randomLow),
        close: parseFloat(randomClose),
        time: currentTime / 1000
    };

    const volumeEntry = {
        value: parseFloat(randomVolume),
        time: currentTime / 1000,
        color: parseFloat(randomOpen) > parseFloat(randomClose) ? "#ef5350" : "#26a69a"
    };

    lastEntry = [ohlcEntry, volumeEntry];
    // console.log("live Entry", lastEntry)

    return lastEntry;
};


server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
