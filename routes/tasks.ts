import { Router } from 'express';
import tasks from '../tasks.json';

const router = Router();

router.get('/', (req, res) => {
  res.json(tasks);
});

router.post('/', (req, res) => {
  const task = { id: tasks.length + 1, title: req.body.title, done: false };
  tasks.push(task);
  res.status(201).json(task);
});

export default router;
