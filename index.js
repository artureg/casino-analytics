import 'dotenv/config';
import express from 'express';
import runJob from "./src/job.js";
import * as cron from "node-cron";

const app = express();
const PORT    = process.env.HEALTH_CHECK_PORT;
const HOST    = process.env.HEALTH_CHECK_HOST;
const SCHEDULE = process.env.SCHEDULE;

const originalLog = console.log;

console.log = (...args) => {
  const timestamp = new Date().toISOString();
  originalLog(`[${timestamp}]`, ...args);
};

//cron.schedule(SCHEDULE, ()=> runJob());
runJob();
//runJob('2025-10-05T12:00:00.000Z','2025-10-05T14:00:00.000Z');


app.get('/health', (req, res) => {
  res.json({status: 'ok', timestamp: new Date().toISOString()});
});

app.listen(PORT, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
});
