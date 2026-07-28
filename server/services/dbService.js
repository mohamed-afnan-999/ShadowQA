import { MongoClient } from "mongodb";

const mongodbURI = process.env.MONGODB_URI;

// setup a client that can talk to the mongoDB server to deal with the Database
const client = new MongoClient(mongodbURI, {
    maxPoolSize: 20, minPoolSize: 0     // allows a max of 20 connections open to this DB
});

let dbConnection = null;

export async function connectToDatabase() {
    // If we already connected, just return the active connection
    if (dbConnection)
        return dbConnection;

    try {
        await client.connect();
        // Name your database here; MongoDB creates it automatically on the first insert
        dbConnection = client.db('qa_audits');
        console.error("Successfully connected to MongoDB Atlas");
        return dbConnection;
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
        throw error;
    }
}