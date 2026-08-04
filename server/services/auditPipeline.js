import fs from 'fs';
import Groq from 'groq-sdk';
import { optimizeAudioForWhisper, transcribeAudio } from './audioService.js';
import { fetchAndDownloadAudioChunks } from "./audioFetcher.js";
import { stitchAudioChunks } from "./audioStitcher.js";
import { connectToDatabase, fetchQAChecklist } from "./dbService.js";

// Initialize Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Helper function to strip down markdown syntax from LLM responses and isolate JSON
const sanitizeJSONString = (rawString) => {
    // This Regular Expression looks for the first '{' or '[' and the last '}' or ']'
    // It extracts ONLY the JSON structure, ignoring any conversational text or markdown code blocks (```json) surrounding it.
    const match = rawString.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
        return match[0];
    }
    return rawString; // Fallback: return raw string if no JSON brackets are found
};

/**
 * Runs the complete Audio -> Isolate -> Audit pipeline sequentially.
 * @param {string} apiURL - The direct URL to company's internal API containing the links to the Google Drive audio files.
 * @param {function} onProgress - Optional callback to send real-time status updates to the frontend.
 */
export async function runFullAudioAudit(apiURL, onProgress = () => {}) {
    let localFilePaths = [];
    let masterAudioFile = null, targetFile = null;

    try {
        // ==========================================
        // STEP 1: DOWNLOAD & TRANSCRIBE
        // ==========================================

        onProgress("Downloading audio file...");
        localFilePaths = await fetchAndDownloadAudioChunks(apiURL);

        onProgress("Stitching the audio files chunks together...");
        masterAudioFile = await stitchAudioChunks(localFilePaths);

        if (!masterAudioFile) {
            throw new Error("Failed to fetch the downloaded master audio file.");
        }

        if (!masterAudioFile.endsWith('.mp3')) {
            onProgress("Optimizing audio for Whisper...");
            targetFile = await optimizeAudioForWhisper(masterAudioFile);
        }

        onProgress("Transcribing audio with Whisper-AI...");
        const { transcribed, transcription } = await transcribeAudio(masterAudioFile);

        if (!transcribed || !transcription) {
            throw new Error("Transcription failed to generate text.");
        }

        const rawTranscriptString = JSON.stringify(transcription);

        // ==========================================
        // STEP 2: ISOLATE THE INTERVIEW SEGMENT
        // ==========================================
        onProgress("Isolating core interview segment...");

        const isolationResponse = await groq.chat.completions.create({
            "model": "llama-3.3-70b-versatile",
            "temperature": 0.1, // to minimise hallucinations
            "messages": [
                {
                    "role": "system",
                    "content": `You are a sophisticated, logical audio editor. Your job is to analyze the provided raw transcript (which includes temporal metadata and segments/words) to understand the conversational flow and temporal gaps. Identify standard introductory phrases (e.g., 'Hi, this is...', 'am I speaking with...') as the definitive start marker of the interview, and conclusive phrases (e.g., 'Thank you for your time', 'I'll send an email shortly') as the termination point. Extract and return a clean, consolidated string representing only the formal interview interaction. Completely remove dialing artifacts, automated voicemails, casual pre-interview small talk, and post-call administrative noise.
                        
                                    OUTPUT INSTRUCTIONS:
                                        You must output strictly in JSON format. The JSON object must contain exactly two keys:
                                            - "isolationStatus": A string indicating the status of extraction (e.g., "Success", "No Interview Found").
                                            - "isolatedTranscript": A string containing the cleaned and isolated interview text, strictly avoiding conversational metadata and dial-tones.`
                },
                {
                    "role": "user",
                    "content": rawTranscriptString
                }
            ],

            // Force structured JSON output
            response_format: {type: "json_object"}
        });

        // Sanitise LLM response to get JSON and then parse JSON output
        const rawIsolationString = isolationResponse.choices[0].message.content;
        const sanitisedJSONString = sanitizeJSONString(rawIsolationString);
        const isolationData = JSON.parse(sanitisedJSONString);

        // If the LLM determines it was just a voicemail or empty call, stop early
        if (isolationData.isolationStatus !== "Success" || !isolationData.isolatedTranscript) {
            return {
                isSuccess: true,
                message: "Audio processed, but no valid interview was found (e.g., automated voicemail).",
                report: null
            };
        }

        // ==========================================
        // STEP 3: RUN COMPLIANCE AUDIT
        // ==========================================
        onProgress("Running QA compliance audit...");

        const dbConnection = await connectToDatabase();
            const rawChecklist = await fetchQAChecklist(dbConnection);  // get this checklist to pass to the LLM for auditing purposes

        // Map the array into a clean numbered list for Llama
        const formattedChecklistPrompt = rawChecklist
            .map((item, index) => `${index + 1}. ${item.criteria}`)
            .join('\n');

        const auditResponse = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            temperature: 0.1, // low temp for analytical evaluation
            messages: [
                {
                    role: "system",
                    // TODO: Make the QA Checklist configurable from the frontend and fetch the actual checklist from the DB
                    // TODO: Make the response contain the final summary of the entire past data for a specific recruiter
                    content: `You are an automated Quality Assurance (QA) Officer auditing a recruiter's interview transcript. 
Your task is to systematically evaluate if the recruiter adhered to mandatory compliance guidelines.

CRITICAL CONSTRAINT - ONE-SIDED TRANSCRIPT: 
The transcript may only contain the recruiter's voice. You must infer the candidate's answers based on the recruiter's context, acknowledgments, or conversational flow. For example, if the recruiter asks about work authorization and then responds with "Great, that works perfectly," you must deduce that the candidate provided a satisfactory answer, and grade the checkpoint as a "PASS".

QA Checklist:   
${formattedChecklistPrompt}

OUTPUT INSTRUCTIONS:
You must output strictly in JSON format. The JSON object must contain two keys:
1. "recruiter_name": The name of the recruiter conducting the interview (infer from introductions, e.g., 'Hi, this is Hajira'). If unknown, output 'Unknown'.
2. "audit_report": An array of objects. Each object must have exactly the following keys:
- "checkpoint": The name of the checkpoint.
- "status": Strictly use "PASS", "FAIL", or "NOT_APPLICABLE".
- "reasoning": A brief explanation justifying the status.
3. "report_sumary": The summary of the recruiter's compliance with the checklist and performance.`
                },
                {
                    role: "user",
                    content: isolationData.isolatedTranscript
                }
            ],
            response_format: { type: "json_object" }
        });

        // sanitise audit data to get raw JSON output from (if any) markdown formatting, then parse the JSON data
        const rawAuditData = auditResponse.choices[0].message.content;
        const cleanedAuditData = sanitisedJSONString(rawAuditData)
        const auditData = JSON.parse(cleanedAuditData);

        onProgress("Audit complete!");

        // ==========================================
        // STEP 4: SAVE TO DATABASE
        // ==========================================
        onProgress("Saving audit results to database...");

        try {
            const db = await connectToDatabase();
            // create a new collection (like a DB table)
            const collection = db.collection('historical_audits');

            // DB entry (like an SQL table's row) definition within the new collection (table)
            const auditRecord = {
                recruiter: auditData.recruiter_name || "Unknown",
                audit_date: new Date(),
                source_api: apiURL,
                overall_score: auditData.audit_report.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL',
                report: auditData.audit_report,
                transcript: isolationData.isolatedTranscript
            };

            await collection.insertOne(auditRecord);
            onProgress("Audit saved to database successfully!");
        } catch (dbError) {
            console.error("Failed to save to database:", dbError);
            onProgress("Warning: Audit completed but failed to save to database.");
            // We don't throw here because the audit itself still succeeded
        }

        // Return the final packaged payload
        return {
            isSuccess: true,
            message: "Audit completed successfully.",
            isolatedTranscript: isolationData.isolatedTranscript,
            report: auditData.audit_report
        };
    } catch (error) {
        console.error("Audit Pipeline Error:", error);
        return {
            isSuccess: false,
            message: `Audit Pipeline failed: ${error.message}`,
            report: null
        };
    } finally {
        // ALWAYS clean up temporary audio chunks and master audio files created in this pipeline usage and not the directory altogether
        try {
            // Delete chunks
            if(localFilePaths && localFilePaths.length > 0) {
                localFilePaths.forEach( file => {
                    if(fs.existsSync(file))
                        fs.promises.unlink(file).catch(() => {});
                } )
            }

            // Delete master audio file (stitched chunks)
            if(masterAudioFile && fs.existsSync(masterAudioFile)) {
                fs.promises.unlink(masterAudioFile).catch(() => {});
            }

            // Delete the optimised file (if generated)
            if(targetFile && fs.existsSync(targetFile) && targetFile !== masterAudioFile) {
                fs.promises.unlink(targetFile).catch(() => {});
            }
        } catch (cleanupError) {
            console.error(`Error cleaning up temporary files: ${cleanupError}`);
        }
    }
}