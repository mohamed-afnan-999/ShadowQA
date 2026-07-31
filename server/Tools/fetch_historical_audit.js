// btw, this tool is supposed to be used to fetch historical audit data on a specific singular recruiter

import {z} from "zod";
import { connectToDatabase } from "../services/dbService.js";

// Optional tool

export const fetchHistoricalAuditTool = {
    name: "fetch_historical_audit",
    description: "Retrieves past QA audit scores and compliance records for a specific recruiter to identify historical performance trends.",
    schema: {
        recruiterName: z.string().describe("The full name of the recruiter to look up in the database.")
    },
    handler: async (args) => {
        const recruiterName = Object.values(args)[0];   // grab the recruiter name no matter what the LLM named the variable
        if (!recruiterName || typeof recruiterName !== 'string') {
            throw new Error(`The LLM failed to provide a valid recruiter name. It provided: ${JSON.stringify(recruiterName)}`);
        }
        
        try {
            // 1. connect to the DB and hold the active connection object
            const dbConnection = await connectToDatabase();

            // 2. target the specific DB collection (table)
            const collection = dbConnection.collection('historical_audits');

            // 3. fetch all records / rows / 'documents' for the specified 'recruiterName'
            const query = { recruiter: { $regex: new RegExp(`^${recruiterName}$`, `i`) }};
            const historicalAudits = await collection.find(query).toArray();

            if (historicalAudits.length === 0) {
                return {
                    isError: false,
                    content: [
                        {
                            type: 'text',
                            text: `No historical records found for the specified recruiter ${recruiterName}.`
                        }
                    ]
                };
            }

            //
            return {
                isError: false,
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(historicalAudits)
                    }
                ]
            };

        } catch (error) {
            console.error(`Failed to retrieve past audit data for recruiter ${recruiterName}`);

            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: `Failed to fetch records for recruiter '${recruiterName}' due to the error: ${error.message}.`
                    }
                ]
            };
        }
    }
}