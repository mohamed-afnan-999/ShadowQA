import { MongoClient, ObjectId } from "mongodb";

const mongodbURI = process.env.MONGODB_URI;

// setup a client that can talk to the mongoDB server to query and modify the Database
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
        console.log("Successfully connected to MongoDB Atlas");
        return dbConnection;
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
        throw error;
    }
}

export const getActiveRecruiters = async (dbConnection) => {
    try {
        const targetCollection = dbConnection.collection('recruiters_list');

        const recruiterNames = await targetCollection.find({}).toArray();
        return recruiterNames;
    } catch (error) {
        console.error(`Error fetching recruiter names: ${error.message}`);
        return [];
    }
}

export const fetchQAChecklist = async (dbConnection) => {
    // This helper function returns all the QA Checklist criteria (defined by project manager) from the DB [ use this and return to a client-side editable list ]
    try {
        const targetCollection = dbConnection.collection('qa_checklist');

        const qaChecklist = await targetCollection.find({}).toArray();
        return qaChecklist;
    } catch (error) {
        console.error(`Error fetching QA Checklist: ${error.message}`);
        return [];
    }
}

export const addQAChecklist = async (dbConnection, checklistData) => {
    try {
        const targetCollection = dbConnection.collection('qa_checklist');

        return await targetCollection.insertOne(checklistData);
    } catch (error) {
        console.error(`Error adding new QA checklist criteria: ${error.message}`);
        throw error;
    }
}

export const deleteQAChecklist = async (dbConnection, id) => {
    try {
        const targetCollection = dbConnection.collection('qa_checklist');

        // Use ObjectId to target a specific row by its id
        return await targetCollection.deleteOne({ _id: new ObjectId(id) });
    } catch (error) {
        console.error(`Error deleting new QA checklist criteria: ${error.message}`);
        throw error;
    }
}

export const updateQAChecklist = async (dbConnection, id, updatedFields) => {
    // This helper function updates (add , modify, delete) all the QA Checklist criteria (defined by project manager) in the DB
    try {
        const targetCollection = dbConnection.collection('qa_checklist');

        // TODO: verify if the new record/JSON doc matches the schema for this collection (table) - guardrail to prevent improperly formatted data

        return await targetCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedFields }
        );
    } catch (error) {
        console.error(`Error updating QA Checklist: ${error.message}`);
        throw error;
    }
}
