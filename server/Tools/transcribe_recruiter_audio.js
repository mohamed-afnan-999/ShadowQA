// Tool 1
import {z} from "zod";
import Groq from 'groq-sdk';
import {downloadAudio, optimizeAudioForWhisper, transcribeAudio} from "../services/audioService.js";
import fs from "fs";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });


// Tool 1
export const transcribeRecruiterAudioTool = {
    // name of tool - so the LLM can uniquely identify this tool
    name: 'transcribe_recruiter_audio',
    // tool description - so the LLM knows what this tool is for
    description: 'Transcribe recruiter audio clips to text for QA auditing purposes',
    schema: {
        // Zod parameter schema for input params - to ensure that LLM gives the correct inputs (with correct types) to this tool
        audioFileURL: z.string().describe("The URL path to an audio clip recording")
    }
    ,
    // actual executable function - LLM can use this on demand
    handler: async ({audioFileURL}) => {
        // logic to transcribe the audio file

        // 1. locate and extract the audio file using the filePath/URL ✅
        // 2. pass to whisperAI via Groq for transcription ✅
        // 3. return the transcription to the AI agent (LLM) ✅

        // download the audio file into a temporary file
        const {isDownloaded, filePath, targetDir} = await downloadAudio(audioFileURL);

        if (!isDownloaded) {
            console.error("Failed to download the audio file");
            if (targetDir) {
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
            if (!filePath.endsWith('.mp3')) {
                targetFile = await optimizeAudioForWhisper(filePath);
            }

            const result = await transcribeAudio(targetFile);
            transcribed = result.transcribed;
            transcription = result.transcription;
        } catch (error) {
            console.error(`Audio processing/transcription error: ${error.message}`);
        } finally {
            // remove the audio file itself - transcripts will be used for auditing
            if (targetDir) {
                try {
                    await fs.promises.rm(targetDir, {recursive: true, force: true});
                } catch (cleanupError) {
                    console.error(`Failed to cleanup temporary directory: ${targetDir}`);
                }
            }
        }

        if (!transcribed || !transcription) {
            console.error("Transcription unavailable")
            return {
                isError: true,
                content: [
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
}
