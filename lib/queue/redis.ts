import Redis from 'ioredis';

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

// Create a singleton connection
export const connection = new Redis({
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
});

connection.on('error', (err) => {
  console.error('[Redis] Error:', err);
});

// A separate connection could be used for BullMQ if needed, but BullMQ accepts ioredis instances directly.
