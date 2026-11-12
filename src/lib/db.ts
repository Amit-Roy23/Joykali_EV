import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/joykali_ev";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

let cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      maxPoolSize: 10,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => {
      return m;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

/**
 * Helper to run operations within a MongoDB transaction if replica set is active,
 * otherwise falls back to normal execution if transactions are unsupported (e.g. local standalone mongod).
 */
export async function withTransaction<T>(
  fn: (session: mongoose.ClientSession | undefined) => Promise<T>
): Promise<T> {
  await connectToDatabase();
  let session: mongoose.ClientSession | undefined = undefined;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error: any) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    // If MongoDB is running in standalone mode (no replica set), transactions fail with error code or message
    if (
      error?.message?.includes("Transaction numbers are only allowed on a replica set member or mongos") ||
      error?.message?.includes("replica set")
    ) {
      console.warn("MongoDB replica set not detected, running operation without transaction session.");
      return await fn(undefined);
    }
    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
  }
}
