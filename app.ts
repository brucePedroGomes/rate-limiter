import express from 'express';
import tasksRouter from './routes/tasks';
import { RateLimit } from './rateLimiter';

const app = express();

const rateLimit = new RateLimit()

app.set('trust proxy', true);
app.use(express.json());
app.use(rateLimit.middleware)
app.use('/tasks', tasksRouter);

export default app;
