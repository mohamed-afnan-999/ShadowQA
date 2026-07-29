import fs from 'fs';
import Groq from 'groq-sdk';
import { downloadAudio, optimizeAudioForWhisper, transcribeAudio } from './audioService.js';

// Initialize Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Runs the complete Audio -> Isolate -> Audit pipeline sequentially.
 * @param {string} audioFileURL - The direct URL to the Google Drive audio file.
 * @param {function} onProgress - Optional callback to send real-time status updates to the frontend.
 */
export async function runFullAudioAudit(audioFileURL, onProgress = () => {}) {
    let targetDir = null;

    try {
        // ==========================================
        // STEP 1: DOWNLOAD & TRANSCRIBE
        // ==========================================
        onProgress("Downloading audio file...");
        const downloadResult = await downloadAudio(audioFileURL);
        targetDir = downloadResult.targetDir;

        if (!downloadResult.isDownloaded) {
            throw new Error("Failed to download the audio file.");
        }

        let targetFile = downloadResult.filePath;
        if (!targetFile.endsWith('.mp3')) {
            onProgress("Optimizing audio for Whisper...");
            targetFile = await optimizeAudioForWhisper(targetFile);
        }

        onProgress("Transcribing audio with Whisper-AI...");
        const { transcribed, transcription } = await transcribeAudio(targetFile);

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

        // parse the JSON response from Groq (LLM response)
        const isolationData = JSON.parse(isolationResponse.choices[0].message.content);

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

        const auditResponse = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            temperature: 0.1, // low temp for analytical evaluation
            messages: [
                {
                    role: "system",
                    content: `You are an automated Quality Assurance (QA) Officer auditing a recruiter's interview transcript. 
Your task is to systematically evaluate if the recruiter adhered to mandatory compliance guidelines.

CRITICAL CONSTRAINT - ONE-SIDED TRANSCRIPT: 
The transcript may only contain the recruiter's voice. You must infer the candidate's answers based on the recruiter's context, acknowledgments, or conversational flow. For example, if the recruiter asks about work authorization and then responds with "Great, that works perfectly," you must deduce that the candidate provided a satisfactory answer, and grade the checkpoint as a "PASS".

Standard Agency QA Checklist:   
1. Legal Work Authorization: Did the recruiter verify if the candidate is legally authorized to work?
2. Salary Range: Did the recruiter explicitly state the salary range for the role?
3. Notice Period: Did the recruiter confirm the candidate's notice period or availability to start?

OUTPUT INSTRUCTIONS:
You must output strictly in JSON format. The JSON object must contain a single key "audit_report" which is an array of objects. 
Each object must have exactly the following keys:
- "checkpoint": The name of the checkpoint (e.g., "Work Authorization", "Salary Range", "Notice Period").
- "status": Strictly use "PASS", "FAIL", or "NOT_APPLICABLE".
- "reasoning": A brief explanation justifying the status based on evidence (or inferred evidence) from the transcript.`
                },
                {
                    role: "user",
                    content: isolationData.isolatedTranscript
                }
            ],
            response_format: { type: "json_object" }
        });

        const auditData = JSON.parse(auditResponse.choices[0].message.content);

        onProgress("Audit complete!");

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
        // ALWAYS clean up temporary audio files to prevent hard drive bloat
        if (targetDir) {
            try {
                await fs.promises.rm(targetDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.error(`Failed to cleanup temp directory: ${targetDir}`);
            }
        }
    }
}