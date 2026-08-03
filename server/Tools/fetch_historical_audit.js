// btw, this tool is supposed to be used to fetch historical audit data on a specific singular recruiter

import {z} from "zod";
import { connectToDatabase } from "../services/dbService.js";

export const fetchHistoricalAuditTool = {
    name: "fetch_historical_audit",
    description: "Retrieves past QA audit scores and compliance records for a specific recruiter to identify historical performance trends, optionally filtered by a date range.",
    schema: {
        recruiterName: z.string().describe("The full name of the recruiter to look up in the database."),
        startDate: z.string().optional().describe("Optional start date to filter records from (Format: YYYY-MM-DD)."),
        endDate: z.string().optional().describe("Optional end date to filter records until (Format: YYYY-MM-DD).")
    },
    handler: async (args) => {
        const [recruiterName, startDate, endDate] = Object.values(args);   // grab the recruiter name no matter what the LLM named the variable

        if (!recruiterName || typeof recruiterName !== 'string') {
            throw new Error(`The LLM failed to provide a valid recruiter name. It provided: ${JSON.stringify(recruiterName)}`);
        }

        try {
            // 1. connect to the DB and hold the active connection object
            const dbConnection = await connectToDatabase();

            // 2. target the specific DB collection (table)
            const collection = dbConnection.collection('historical_audits');

            // 3. define query to fetch all records / rows / 'documents' for the specified 'recruiterName'
            const query = { recruiter: { $regex: new RegExp(`^${recruiterName}$`, `i`) }};

            // 4. Add date filters if provided
            if (startDate || endDate) {
                query.audit_date = {};

                if (startDate) {
                    query.audit_date.$gte = new Date(startDate);
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setUTCHours(23, 59, 59, 999);   // include the entire last day
                    query.audit_date.$lte = end;
                }
            }

            // 5. Fetch all the records
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

            // 6. Return raw JSON data to the orchestrator for it to summarize
            return {
                isError: false,
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            recordCount: historicalAudits.length,
                            filtersApplied: { startDate, endDate },
                            rawData: historicalAudits
                        })
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
                        text: `Failed to fetch records for recruiter '${recruiterName}' due to the error --> ${error.message}.`
                    }
                ]
            };
        }
    }
}