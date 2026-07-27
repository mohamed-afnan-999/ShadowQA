import dotenv from 'dotenv';
dotenv.config();

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';          // to actually instantiate an MCP server
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";     // transport channel between MCP client and server
import { z } from 'zod';      // data validation library
import Groq from 'groq-sdk';
import fs from "fs";
import path from "path";
import os from "os";
import axios from 'axios';
import ffmpeg from "fluent-ffmpeg";     // any audio file -> mp3 conversion
import { randomUUID } from "crypto";    // for temp mp3 filename

//Initialise Groq client
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
}) // API key can be passed implictly also

// instantiate MCP server object
const server = new McpServer({
    name: "qa-auditor-server",
    version: "1.0.0"
});

const downloadAudio = async (audioURL, destinationPath) => {
    // helper function to download audio from the internal audio URLs

    let tempDir = null, tempFilePath = null;
    let isDownloaded = false;       // tracks the status of the file download

    try {
        // create a temp dir
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extracted-audio-files-'));
        // create temp file to store the audio file extracted
        tempFilePath = destinationPath || path.join(tempDir, 'audio.mp3');

        // create a writer that will write to the target file
        const writer = fs.createWriteStream(tempFilePath);

        // extract and download audio using 'axios'
        const response = await axios.get(audioURL, {
            responseType: 'stream'
        });

        // pipe the downloaded audio file data into the writer to write it to the temporary target file
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        isDownloaded = true;
        console.error(`Successfully downloaded the audio recording to ${tempFilePath}`);
    } catch (error) {
        // log the error
        console.error(`Failed to retrieve and download the audio recording: ${error}`);
        isDownloaded = false;
    }

    // cleanup the temp directory after the transcription is complete

    return {
        isDownloaded: isDownloaded,
        filePath: tempFilePath,
        targetDir: tempDir
    };
}

const optimizeAudioForWhisper = async (inputFilePath) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(inputFilePath)) {
            return reject(new Error("Input file does not exist."));
        }

        const outputDir = path.dirname(inputFilePath);
        const tempFileName = `optimized_${randomUUID()}.mp3`;
        const outputFilePath = path.join(outputDir, tempFileName);

        ffmpeg(inputFilePath)
            .audioFrequency(16000)      // Force 16 kHz sample rate
            .audioChannels(1)           // Force mono (1 channel)
            .audioBitrate("64k")        // Compress to 64 kbps MP3
            .format("mp3")
            .on("end", () => {
                resolve(outputFilePath);
            })
            .on("error", (err) => {
                reject(err);
            })
            .save(outputFilePath);
    });
}

const transcribeAudio = async (audioFilePath) => {
    // transcribe the audio file
    let transcriptionResult = {};

    try {
        if(!fs.existsSync(audioFilePath)) {
            console.error("Audio File unavailable (does not exist)\n");
            return {
                transcribed: false,
                transcription: null
            };
        }

        const audioFile = fs.createReadStream(audioFilePath);

        // call the groq API for transcription
        let transcription = await groq.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-large-v3-turbo',
            prompt: 'Interview transcript, recruitment, QA audit, candidate interaction.',
            response_format: 'verbose_json',     // for word-level timestamps
            timestamp_granularities: ['segment', 'word']
        });

        console.error(`Transcription successful`);
        transcriptionResult = {
            transcribed: true,
            transcription: transcription
        };
    } catch (error) {
        console.error(`Transcription failed`);
        transcriptionResult = {
            transcribed: false,
            transcription: null
        };
    }

    // cleanup the temp directory after the transcription is complete

    return transcriptionResult;
}

// Register tools

// Tool 1
server.tool(
    // name of tool - so the LLM can uniquely identify this tool
    'transcribe_recruiter_audio',
    // tool description - so the LLM knows what this tool is for
    'Transcribe recruiter audio clips to text for QA auditing purposes',
    {
        // Zod parameter schema for input params - to ensure that LLM gives the correct inputs (with correct types) to this tool
        audioFileURL: z.string().describe("The URL path to an audio clip recording")
    },
    // actual executable function - LLM can use this on demand
    async ({ audioFileURL }) => {
        // logic to transcribe the audio file

        // 1. locate and extract the audio file using the filePath/URL ✅
        // 2. pass to whisperAI via Groq for transcription ✅
        // 3. return the transcription to the AI agent (LLM) ✅

        // download the audio file into a temporary file
        const { isDownloaded, filePath, targetDir } = await downloadAudio(audioFileURL);

        if(!isDownloaded) {
            console.error("Failed to download the audio file");
            if(targetDir) {
                try {
                    await fs.promises.rm(targetDir, {recursive: true, force: true});
                } catch (error) {
                    console.error(`Failed to cleanup temporary directory: ${targetDir}`);
                }
            }
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: `Failed to download the audio file`
                    }
                ]
            };
        }

        let transcribed = false, transcription = null;

        try {
            // convert file to mp3 and pass the transcription to whisper-AI via groq-sdk for transcription
            let targetFile = filePath;
            if(!filePath.endsWith('.mp3')) {
                targetFile = await optimizeAudioForWhisper(filePath);
            }
            
            const result = await transcribeAudio(targetFile);
            transcribed = result.transcribed;
            transcription = result.transcription;
        } catch (error) {
            console.error(`Audio processing/transcription error: ${error.message}`);
        } finally {
            // remove the audio file itself - transcripts will be used for auditing
            if(targetDir) {
                try {
                    await fs.promises.rm(targetDir, {recursive: true, force: true});
                } catch (cleanupError) {
                    console.error(`Failed to cleanup temporary directory: ${targetDir}`);
                }
            }
        }

        if(!transcribed || !transcription) {
            console.error("Transcription unavailable")
            return {
                isError: true,
                content : [
                    {
                        type: 'text',
                        text: `Transcription unavailable`
                    }
                ]
            };
        }
        // TODO: save the raw ranscription somewhere on mongoDB

        return {
            isError: false,
            content: [      // mandatory expected field by LLM for outputs/results of this tool
                {
                    type: "text",
                    // We must return the raw transcription object (stringified) which includes segments and word level timestamps, not just the text property.
                    text: JSON.stringify(transcription),
                }
            ]
        }
    }
)

// Tool 2
server.tool(
    'isolate_interview_segment',
    'Isolate the true interview segment of the audio trancriptions, filtering out irrelevant acoustic data, small-talk, and automated voicemail systems',
    {
        rawTranscript: z.string().describe("The raw text transcript (stringified verbose JSON) of the whole audio clip with timestamp metadata.")
    },
    async ({ rawTranscript }) => {
        // 1. receives the audio transcripts
        // 2. uses a structured, detailed prompt to LLM (Llama) to filter irrelevant data and find timestamps for actual interview segment
        // 3. use the returned timestamps to clip out the transcriptions
        // 4. use the LLM to filter for surrounding traffic noise, small-talk, automated voicemails and post-conversational tone
        //      FORCE STRUCTURED JSON OUTPUTS FROM LLM
        // 5. return { isolationStatus, isolatedTranscript } to the next tool

        if(!rawTranscript) {
            console.error("Transcript unavailable");
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: `Transcript unavailable`
                    }
                ]
            };
        }

        try {
            const response = await groq.chat.completions.create({
                "model": "llama-3.3-70b-versatile",
                "temperature": 0.1, // to minimise hallucinations
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a sophisticated, logical audio editor. Your job is to analyze the provided raw transcript (which includes temporal metadata and segments/words) to understand the conversational flow and temporal gaps. Identify standard introductory phrases (e.g., 'Hi, this is...', 'am I speaking with...') as the definitive start marker of the interview, and conclusive phrases (e.g., 'Thank you for your time', 'I'll send an email shortly') as the termination point. Extract and return a clean, consolidated string representing only the formal interview interaction. Completely remove dialing artifacts, automated voicemails, casual pre-interview small talk, and post-call administrative noise."
                    },
                    {
                        "role": "user",
                        "content": rawTranscript
                    }
                ],

                // Force structured JSON output
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "isolated_transcript_schema",
                        strict: true,
                        schema: {
                            type: "object",
                            properties: {
                                isolationStatus: {
                                    type: "string",
                                    description: "Status of extraction, e.g. Success or No Interview Found"
                                },
                                isolatedTranscript: {
                                    type: "string",
                                    description: "The cleaned and isolated interview transcript text, strictly avoiding conversational metadata and dial-tones"
                                }
                            },
                            required: ["isolationStatus", "isolatedTranscript"],
                            additionalProperties: false     // this key prevents the LLM from adding its own keys to the response
                        }
                    }
                }
            });

            // parse the JSON response from Groq (LLM response)
            const parsedResponse = JSON.parse(response.choices[0].message.content);

            // result to LLM
            return {
                isError: false,
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(parsedResponse, null, 2)
                    }
                ]
            };

        } catch (err) {
            console.error(`Interview Isolation Error: ${err}`);

            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Isolation failed: ${err.message}`
                    }
                ]
            };
        }
    }
)

// Tool 3
server.tool(
    'run_compliance_audit',
    'Systematically reviews the isolated interview text to determine if the recruiter strictly adhered to mandatory compliance guidelines.',
    {
        interviewTranscript: z.string().describe("The cleaned and isolated interview transcript text generated by the isolation tool.")
    },
    async ({ interviewTranscript }) => {
        if(!interviewTranscript) {
            console.error("Interview transcript unavailable");
            return {
                isError: true,
                content: [{ type: 'text', text: `Interview transcript unavailable` }]
            };
        }

        try {
            const response = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                temperature: 0.1, // low temp for analytical evaluation
                messages: [
                    {
                        role: "system",
                        // TODO: Update the QA Agency Checklist
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
                        content: interviewTranscript
                    }
                ],
                // Force structured JSON output with `type: json_object` because json_schema isn't strictly necessary as we outline in prompt, but we can also use json_schema for absolute rigid structure like earlier! Let's use json_object as requested.
                response_format: { type: "json_object" }
            });

            const parsedResponse = JSON.parse(response.choices[0].message.content);

            return {
                isError: false,
                content: [{ type: "text", text: JSON.stringify(parsedResponse, null, 2) }]
            };

        } catch (err) {
            console.error(`Compliance Audit Error: ${err}`);
            return {
                isError: true,
                content: [{ type: "text", text: `Compliance audit failed: ${err.message}` }]
            };
        }
    }
)

// Connect the server to a standard I/O Transport layer
const transport = new StdioServerTransport();
await server.connect(transport);