import chai from 'chai';
import chaiHttp from 'chai-http';
import app from '../app';

chai.use(chaiHttp);
chai.should();

const realDateNow = Date.now;
const startTime = Date.parse('2026-10-14T12:00:00Z');
const startSeconds = startTime / 1000;
let fakeTime = startTime;

const moveClockTo = (ms: number) => {
  fakeTime = startTime + ms;
};

const getTasks = (ip: string) => chai.request(app).get('/tasks').set('X-Forwarded-For', ip);

const postTask = (ip: string) =>
  chai.request(app).post('/tasks').set('X-Forwarded-For', ip).send({ title: 'Update the ticket status' });

const sendRequests = async (ip: string, count: number) => {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) {
    statuses.push((await getTasks(ip)).status);
  }
  return statuses;
};

const remainingOf = async (ip: string, count: number) => {
  const remaining: string[] = [];
  for (let i = 0; i < count; i++) {
    remaining.push((await getTasks(ip)).header['x-ratelimit-remaining']);
  }
  return remaining;
};

const repeat = (status: number, count: number) => Array(count).fill(status);

describe('rate limiter', () => {
  beforeEach(() => {
    moveClockTo(0);
    Date.now = () => fakeTime;
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  it('accepts the first 10 requests of a client', async () => {
    (await sendRequests('10.0.0.1', 10)).should.deep.equal(repeat(200, 10));
  });

  it('rejects the 11th request with status 429 and the error message', async () => {
    await sendRequests('10.0.0.2', 10);
    const res = await getTasks('10.0.0.2');
    res.status.should.equal(429);
    res.body.should.deep.equal({ error: 'Too many requests' });
  });

  it('does not run the route when it rejects a request', async () => {
    await sendRequests('10.0.0.3', 10);
    const tasksBefore = (await getTasks('10.0.1.3')).body.length;
    (await postTask('10.0.0.3')).status.should.equal(429);
    (await getTasks('10.0.1.3')).body.length.should.equal(tasksBefore);
  });

  it('keeps a separate limit for each client', async () => {
    await sendRequests('10.0.0.4', 11);
    (await sendRequests('10.0.0.5', 10)).should.deep.equal(repeat(200, 10));
  });

  it('counts all methods together', async () => {
    for (let i = 0; i < 5; i++) {
      (await postTask('10.0.0.6')).status.should.equal(201);
    }
    (await sendRequests('10.0.0.6', 6)).should.deep.equal([...repeat(200, 5), 429]);
  });

  it('removes a request from the window exactly 60000 ms after it was accepted', async () => {
    await sendRequests('10.0.0.7', 10);
    moveClockTo(59999);
    (await getTasks('10.0.0.7')).status.should.equal(429);
    moveClockTo(60000);
    (await getTasks('10.0.0.7')).status.should.equal(200);
  });

  it('uses the last 60000 ms, not a fixed window', async () => {
    await sendRequests('10.0.0.8', 4);
    moveClockTo(30000);
    await sendRequests('10.0.0.8', 6);
    moveClockTo(60000);
    (await sendRequests('10.0.0.8', 5)).should.deep.equal([...repeat(200, 4), 429]);
    moveClockTo(90000);
    (await sendRequests('10.0.0.8', 7)).should.deep.equal([...repeat(200, 6), 429]);
  });

  it('does not count rejected requests', async () => {
    await sendRequests('10.0.0.9', 10);
    moveClockTo(50000);
    await sendRequests('10.0.0.9', 5);
    moveClockTo(60000);
    (await sendRequests('10.0.0.9', 11)).should.deep.equal([...repeat(200, 10), 429]);
  });

  describe('headers', () => {
    it('sends the limit and the remaining requests on accepted requests', async () => {
      const res = await getTasks('10.0.1.1');
      res.should.have.header('X-RateLimit-Limit', '10');
      res.should.have.header('X-RateLimit-Remaining', '9');
      res.should.not.have.header('Retry-After');
      (await remainingOf('10.0.1.1', 9)).should.deep.equal(['8', '7', '6', '5', '4', '3', '2', '1', '0']);
    });

    it('sends the reset time in Unix seconds, rounded up', async () => {
      moveClockTo(200);
      (await getTasks('10.0.1.2')).should.have.header('X-RateLimit-Reset', String(startSeconds + 61));
      moveClockTo(30000);
      (await getTasks('10.0.1.2')).should.have.header('X-RateLimit-Reset', String(startSeconds + 61));
    });

    it('sends all the headers on a rejected request', async () => {
      await sendRequests('10.0.1.3', 10);
      moveClockTo(30000);
      const res = await getTasks('10.0.1.3');
      res.status.should.equal(429);
      res.should.have.header('X-RateLimit-Limit', '10');
      res.should.have.header('X-RateLimit-Remaining', '0');
      res.should.have.header('X-RateLimit-Reset', String(startSeconds + 60));
      res.should.have.header('Retry-After', '30');
    });

    it('rounds Retry-After up', async () => {
      await sendRequests('10.0.1.4', 10);
      moveClockTo(40800);
      (await getTasks('10.0.1.4')).should.have.header('Retry-After', '20');
      moveClockTo(59999);
      (await getTasks('10.0.1.4')).should.have.header('Retry-After', '1');
    });

    it('uses the oldest request in the window for the reset time and Retry-After', async () => {
      await sendRequests('10.0.1.5', 4);
      moveClockTo(30000);
      await sendRequests('10.0.1.5', 6);
      moveClockTo(60000);
      const accepted = await getTasks('10.0.1.5');
      accepted.should.have.header('X-RateLimit-Remaining', '3');
      accepted.should.have.header('X-RateLimit-Reset', String(startSeconds + 90));
      await sendRequests('10.0.1.5', 3);
      const rejected = await getTasks('10.0.1.5');
      rejected.status.should.equal(429);
      rejected.should.have.header('X-RateLimit-Reset', String(startSeconds + 90));
      rejected.should.have.header('Retry-After', '30');
    });
  });
});
