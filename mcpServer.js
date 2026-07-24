import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';          // to actually instantiate an MCP server
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";     // transport channel between MCP client and server
import { z } from 'zod';      // data validation library
import Groq from 'groq-sdk';
import fs from "fs";
import path from "path";
import os from "os";
import axios from 'axios';

//Initialise Groq client
const groq = new Groq() // API key passed implictly

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

const transcribeAudio = async (audioFilePath) => {
    // transcribe the audio file
    let transcriptionResult = {};

    try {
        if(!fs.existsSync(audioFilePath)) {
            console.error("Audio File unavailable (does not exist)\n");
            transcriptionResult = {
                transcribed: false,
                transcription: null
            };
        }

        const audioFile = fs.createReadStream(audioFilePath);

        // call the groq API for transcription
        let transcription = await groq.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-large-v3-turbo',
            prompt: '',     // check what this prompt is for
            response_format: 'verbose_json',     // for word-level timestamps
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

// Register a tool
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
            return;
        }

        // pass the transcription to whisper-AI via groq-sdk for transcription
        const {transcribed, transcription} = await transcribeAudio(filePath);

        if(!transcribed || !transcription.text) {
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
        // save the transcription somewhere on mongoDB

        // remove the audio file itself - transcripts will be used for auditing
        if(targetDir) {
            try {
                await fs.promises.rm(targetDir, {recursive: true, force: true});
            } catch (error) {
                console.error(`Failed to cleanup temporary directory: ${targetDir}`);
            }
        }

        return {
            isError: false,
            content: [      // mandatory expected field by LLM for outputs/results of this tool
                {
                    type: "text",
                    text: transcription.text,
                }
            ]
        }
    }
)

// Connect the server to a standard I/O Transport layer
const transport = new StdioServerTransport();
await server.connect(transport);