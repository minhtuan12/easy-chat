import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/review_chat";
const dbName = process.env.MONGODB_DB;

type MongoGlobal = typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

const globalForMongo = globalThis as MongoGlobal;

export function getMongoClient() {
  if (!globalForMongo.mongoClientPromise) {
    const client = new MongoClient(uri);
    globalForMongo.mongoClientPromise = client.connect();
  }

  return globalForMongo.mongoClientPromise;
}

export async function getMongoDb() {
  const client = await getMongoClient();
  return dbName ? client.db(dbName) : client.db();
}
